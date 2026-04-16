from __future__ import annotations

from datetime import datetime
import re
from typing import Any, ClassVar, Dict, Iterable, List, Optional

from filling.template_loader import TemplateConfig, TemplateLoader

from ..core.document import Document, DocumentType
from ..core.schema import CanonicalOutput, EntityValue, Metadata, SourceInfo, SourceRef
from ..extractors.extractor_base import BaseExtractor
from ..extractors.mfc import MFC
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser
from ..utils.semantic_section_builder import SemanticSectionBuilder
from ..validation.validator import validate


class AcordTemplateExtractor(BaseExtractor):
    """Template-driven extractor for filled ACORD PDFs backed by Supabase YAML."""

    document_type: ClassVar[DocumentType]
    form_type: ClassVar[str]
    line_of_business: ClassVar[str]
    candidate_template_ids: ClassVar[List[str]]
    fallback_text_field: ClassVar[Optional[str]] = None

    def __init__(self):
        self.pdf_parser = PdfFieldParser()

    def extract(self, doc: Document) -> ExtractionResult:
        if doc.document_type != self.document_type:
            return self._failure_result(
                f"Expected {self.form_type} document, got {doc.document_type.value}"
            )

        entities: Dict[str, List[EntityValue]] = {}
        raw_fields: Dict[str, Any] = {}
        field_metadata: Dict[str, Dict[str, Any]] = {}
        confidence = 0.65
        extraction_method = "ocr_text_alias"

        if self.pdf_parser.is_fillable(doc.file_path):
            field_metadata = self.pdf_parser.extract_field_metadata(doc.file_path)
            raw_fields = {
                field_name: metadata.get("value")
                for field_name, metadata in field_metadata.items()
            }

        template = self._select_template(raw_fields.keys())
        if raw_fields:
            confidence = 0.98
            extraction_method = "fillable_pdf_alias"
            self._extract_from_pdf_fields(raw_fields, entities, template, field_metadata)

        if doc.raw_text:
            missing_field_ids = set(self._template_field_ids(template)) - set(entities.keys())
            if entities:
                extraction_method = "fillable_pdf_plus_ocr_text"
            self._extract_from_text(
                doc.raw_text,
                entities,
                confidence=0.78 if raw_fields else 0.72,
                field_ids=missing_field_ids,
            )

        if not entities and self.fallback_text_field and doc.raw_text.strip():
            entities[self.fallback_text_field] = [
                EntityValue(
                    value=doc.raw_text.strip(),
                    confidence=0.55,
                    source=SourceRef(page=1, extraction_rule="ocr_text_fallback"),
                    tags=["ocr_text", "fallback"],
                )
            ]

        if not entities:
            return self._failure_result(f"No extractable {self.form_type} data found")

        canonical = CanonicalOutput(
            job_id=doc.job_id,
            source=SourceInfo(
                file_name=doc.file_name,
                file_type="pdf",
                extraction_method=extraction_method,
                extracted_at=datetime.utcnow(),
            ),
            semantic_sections=SemanticSectionBuilder.build(entities),
            metadata=Metadata(
                form_type_detected=self.form_type,
                line_of_business=self.line_of_business,
                schema_version="1.0",
            ),
            raw={
                "template_id": template.template_id if template else None,
                "raw_field_count": len(raw_fields),
            },
        )
        validated = validate(canonical)
        return self._success_result(
            validated,
            confidence=confidence,
            metadata={
                "form_type": self.form_type,
                "line_of_business": self.line_of_business,
                "template_id": template.template_id if template else None,
            },
        )

    def can_extract(self, document: Document) -> bool:
        return document.document_type == self.document_type

    def get_supported_types(self) -> List[DocumentType]:
        return [self.document_type]

    def _select_template(self, field_names: Iterable[str]) -> Optional[TemplateConfig]:
        names = set(field_names or [])
        loaded: List[TemplateConfig] = []
        for template_id in self.candidate_template_ids:
            config = TemplateLoader.load(template_id)
            if not config:
                continue
            loaded.append(config)
            signature = set(config.raw.get("signature_fields") or [])
            if signature and signature.issubset(names):
                return config

        if names:
            best = self._best_field_overlap_template(loaded, names)
            if best:
                return best
        return loaded[0] if loaded else None

    def _best_field_overlap_template(
        self,
        templates: List[TemplateConfig],
        field_names: set[str],
    ) -> Optional[TemplateConfig]:
        best: Optional[TemplateConfig] = None
        best_score = 0
        normalized_names = {self._normalize_pdf_field(name) for name in field_names}
        for template in templates:
            mapped_fields = set(template.field_map.values())
            score = len(mapped_fields & field_names)
            if score == 0:
                score = len(
                    {self._normalize_pdf_field(name) for name in mapped_fields}
                    & normalized_names
                )
            if score > best_score:
                best = template
                best_score = score
        return best

    def _extract_from_pdf_fields(
        self,
        raw_fields: Dict[str, Any],
        entities: Dict[str, List[EntityValue]],
        template: Optional[TemplateConfig],
        field_metadata: Dict[str, Dict[str, Any]],
    ) -> None:
        for field_name, value in raw_fields.items():
            if value is None or str(value).strip() in ("", "/Off", "Off"):
                continue

            canonical_id = self._map_via_template(field_name, template)
            if not canonical_id:
                canonical_id = self._map_pdf_field_to_canonical(field_name)
            if not canonical_id:
                continue

            entities.setdefault(canonical_id, []).append(
                EntityValue(
                    value=self._clean_value(canonical_id, str(value)),
                    confidence=0.98,
                    source=self._source_ref_for_pdf_field(
                        field_name,
                        field_metadata,
                        extraction_rule="pdf_field_template",
                    ),
                    tags=["fillable_pdf", "template"],
                )
            )

    def _extract_from_text(
        self,
        text: str,
        entities: Dict[str, List[EntityValue]],
        confidence: float,
        field_ids: set[str],
    ) -> None:
        for field_id in field_ids:
            match = self._match_alias_value(text, field_id)
            if not match:
                continue
            value, offset = match
            entities.setdefault(field_id, []).append(
                EntityValue(
                    value=self._clean_value(field_id, value),
                    confidence=confidence,
                    source=SourceRef(
                        page=self._find_page_for_offset(text, offset),
                        text_block_index=offset,
                        extraction_rule="ocr_text_alias",
                    ),
                    tags=["ocr_text", "alias"],
                )
            )

    def _map_via_template(
        self,
        field_name: str,
        template: Optional[TemplateConfig],
    ) -> Optional[str]:
        if not template:
            return None

        pdf_to_canonical = template.pdf_to_canonical
        candidates = [
            field_name,
            field_name.lstrip("/"),
            self._normalize_pdf_field(field_name),
        ]
        normalized_lookup = {
            self._normalize_pdf_field(pdf_name): canonical
            for pdf_name, canonical in pdf_to_canonical.items()
        }

        for candidate in candidates:
            if candidate in pdf_to_canonical:
                return pdf_to_canonical[candidate]
            if candidate in normalized_lookup:
                return normalized_lookup[candidate]
        return None

    def _map_pdf_field_to_canonical(self, field_name: str) -> Optional[str]:
        normalized = self._normalize_pdf_field(re.sub(r"_[A-Z0-9]+$", "", field_name))
        for field_id, definition in MFC._load().get("fields", {}).items():
            for alias in definition.get("aliases", []):
                alias_norm = self._normalize_pdf_field(alias)
                if alias_norm and alias_norm in normalized:
                    return field_id
        return None

    def _template_field_ids(self, template: Optional[TemplateConfig]) -> List[str]:
        if template:
            return list(template.field_map.keys())
        return [
            "InsuredName",
            "PolicyNumber",
            "EffectiveDate",
            "ExpirationDate",
            "ProducerName",
            "Carrier",
            "AdditionalRemarks",
        ]

    def _match_alias_value(self, text: str, field_id: str) -> Optional[tuple[str, int]]:
        aliases = MFC.aliases(field_id)
        for alias in aliases:
            pattern = re.compile(rf"{re.escape(alias)}\s*[:\-]?\s*([^\n]+)", re.IGNORECASE)
            match = pattern.search(text)
            if match:
                return match.group(1).strip(), match.start(1)
        return None

    def _find_page_for_offset(self, text: str, offset: int) -> Optional[int]:
        markers = list(re.finditer(r"=== Page (\d+) ===", text))
        if not markers:
            return 1
        page_number = 1
        for marker in markers:
            marker_page = int(marker.group(1))
            if marker.start() > offset:
                break
            page_number = marker_page
        return page_number

    def _clean_value(self, field_id: str, raw: str) -> Any:
        value = raw.strip()
        field = MFC.field(field_id)
        if not field:
            return value

        field_type = field.get("type")
        if field_type == "money":
            return float(re.sub(r"[^\d.]", "", value)) if re.search(r"\d", value) else 0.0
        if field_type == "integer":
            return int(re.sub(r"\D", "", value)) if re.search(r"\d", value) else 0
        if field_type == "boolean":
            normalized = value.lower()
            if normalized in {"yes", "y", "true", "checked", "on"}:
                return True
            if normalized in {"no", "n", "false", "unchecked", "off"}:
                return False
        return value

    @staticmethod
    def _normalize_pdf_field(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


class ACORD27Extractor(AcordTemplateExtractor):
    document_type = DocumentType.ACORD_27
    form_type = "ACORD_27"
    line_of_business = "Property"
    candidate_template_ids = ["acord_27_2016"]


class ACORD28Extractor(AcordTemplateExtractor):
    document_type = DocumentType.ACORD_28
    form_type = "ACORD_28"
    line_of_business = "Commercial Property"
    candidate_template_ids = ["acord_28_2016"]


class ACORD101Extractor(AcordTemplateExtractor):
    document_type = DocumentType.ACORD_101
    form_type = "ACORD_101"
    line_of_business = "Supplemental"
    candidate_template_ids = ["acord_101_2016"]
    fallback_text_field = "AdditionalRemarks"
