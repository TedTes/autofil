from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Optional
import re

from ..core.document import Document, DocumentType
from ..core.schema import CanonicalOutput, EntityValue, Metadata, SourceInfo, SourceRef
from ..extractors.extractor_base import BaseExtractor
from ..extractors.mfc import MFC
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser
from ..utils.semantic_section_builder import SemanticSectionBuilder
from ..validation.validator import validate
from utils.versioned_template_loader import (
    TemplateConfig,
    TemplateRecognizer,
    VersionedTemplateLoader,
)


class ACORD25Extractor(BaseExtractor):
    FORM_TYPE = "ACORD_25"
    LOB = "Certificate"

    def __init__(self):
        self.pdf_parser = PdfFieldParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(base_dir=self.template_loader.base_dir)

    def extract(self, doc: Document) -> ExtractionResult:
        if doc.document_type != DocumentType.ACORD_25:
            return self._failure_result(
                f"Expected ACORD_25 document, got {doc.document_type.value}"
            )

        entities: Dict[str, List[EntityValue]] = {}
        confidence = 0.65
        extraction_method = "ocr_text_alias"

        raw_fields: Dict[str, Any] = {}
        field_metadata: Dict[str, Dict[str, Any]] = {}
        if self.pdf_parser.is_fillable(doc.file_path):
            field_metadata = self.pdf_parser.extract_field_metadata(doc.file_path)
            raw_fields = {
                field_name: metadata.get("value")
                for field_name, metadata in field_metadata.items()
            }
            if raw_fields:
                confidence = 0.98
                extraction_method = "fillable_pdf_alias"

        template_config: Optional[TemplateConfig] = None
        if raw_fields:
            detected = self.template_recognizer.detect(raw_fields.keys()) or "acord_25_2016"
            template_config = self.template_loader.load(detected)
            self._extract_from_pdf_fields(
                raw_fields,
                entities,
                confidence,
                template_config,
                field_metadata,
            )

        if doc.raw_text:
            missing_field_ids = set(self._relevant_field_ids(template_config))
            if entities:
                missing_field_ids -= set(entities.keys())
                extraction_method = "fillable_pdf_plus_ocr_text"
            self._extract_from_text(
                doc.raw_text,
                entities,
                confidence=0.78 if raw_fields else 0.72,
                field_ids=missing_field_ids,
            )

        if not entities:
            return self._failure_result("No extractable ACORD 25 data found")

        semantic_sections = SemanticSectionBuilder.build(entities)
        output = CanonicalOutput(
            job_id=doc.job_id,
            source=SourceInfo(
                file_name=doc.file_name,
                file_type="pdf",
                extraction_method=extraction_method,
                extracted_at=datetime.utcnow(),
            ),
            semantic_sections=semantic_sections,
            metadata=Metadata(
                form_type_detected=self.FORM_TYPE,
                line_of_business=self.LOB,
                schema_version="1.0",
            ),
        )
        validated = validate(output)
        return self._success_result(
            validated,
            confidence=confidence,
            metadata={
                "form_type": self.FORM_TYPE,
                "line_of_business": self.LOB,
            },
        )

    def can_extract(self, document: Document) -> bool:
        return document.document_type == DocumentType.ACORD_25

    def get_supported_types(self) -> List[DocumentType]:
        return [DocumentType.ACORD_25]

    def _extract_from_pdf_fields(
        self,
        raw_fields: Dict[str, Any],
        entities: Dict[str, List[EntityValue]],
        confidence: float,
        template_config: Optional[TemplateConfig],
        field_metadata: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> None:
        for field_name, value in raw_fields.items():
            if value is None or str(value).strip() in ("", "/Off", "Off"):
                continue

            canonical_id = None
            if template_config:
                canonical_id = self._map_via_template(field_name, template_config)
            if not canonical_id:
                canonical_id = self._map_pdf_field_to_canonical(field_name)
            if not canonical_id:
                continue

            entities.setdefault(canonical_id, []).append(
                EntityValue(
                    value=self._clean_value(canonical_id, str(value)),
                    confidence=confidence,
                    source=self._source_ref_for_pdf_field(
                        field_name,
                        field_metadata,
                        extraction_rule="pdf_field_alias",
                    ),
                    tags=["fillable_pdf", "alias"],
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
            value, start_offset = match
            cleaned = self._clean_value(field_id, value)
            if cleaned in ("", None):
                continue
            entities.setdefault(field_id, []).append(
                EntityValue(
                    value=cleaned,
                    confidence=confidence,
                    source=SourceRef(
                        page=self._find_page_for_offset(text, start_offset),
                        text_block_index=start_offset,
                        extraction_rule="ocr_text_alias",
                    ),
                    tags=["ocr_text", "alias"],
                )
            )

    def _map_via_template(self, field_name: str, template_config: TemplateConfig) -> Optional[str]:
        pdf_to_canonical = template_config.pdf_to_canonical
        candidates = [field_name, field_name.lstrip("/"), re.sub(r"\s+", "", field_name)]
        for candidate in candidates:
            if candidate in pdf_to_canonical:
                return pdf_to_canonical[candidate]
        return None

    def _map_pdf_field_to_canonical(self, field_name: str) -> Optional[str]:
        normalized = re.sub(r"_[A-Z0-9]+$", "", field_name)
        field_norm = re.sub(r"[^a-z0-9]", "", normalized.lower())

        for fid, defn in MFC._load().get("fields", {}).items():
            for alias in defn.get("aliases", []):
                alias_norm = re.sub(r"[^a-z0-9]", "", alias.lower())
                if alias_norm and alias_norm in field_norm:
                    return fid
        return None

    def _relevant_field_ids(self, template_config: Optional[TemplateConfig]) -> List[str]:
        if template_config:
            return [field_id for field_id in template_config.field_map.keys() if MFC.field(field_id)]
        return [
            "InsuredName",
            "MailingAddress",
            "Carrier",
            "CarrierNAIC",
            "PolicyNumber",
            "EffectiveDate",
            "ExpirationDate",
            "CertificateHolderName",
            "DescriptionOfOperations",
            "ProducerName",
        ]

    def _match_alias_value(self, text: str, field_id: str) -> Optional[tuple[str, int]]:
        aliases = MFC.aliases(field_id)
        if not aliases:
            return None

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

    @staticmethod
    @lru_cache(maxsize=1)
    def _date_patterns() -> List[str]:
        return ["%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"]

    def _clean_value(self, field_id: str, raw: str) -> Any:
        raw = raw.strip()
        if not raw:
            return raw

        field = MFC.field(field_id)
        if not field:
            return raw

        field_type = field.get("type")
        if field_type == "money":
            return float(re.sub(r"[^\d.]", "", raw)) if re.search(r"\d", raw) else 0.0
        if field_type == "integer":
            return int(re.sub(r"\D", "", raw)) if re.search(r"\d", raw) else 0
        if field_type == "boolean":
            normalized = raw.lower()
            if normalized in {"yes", "y", "true", "checked", "on"}:
                return True
            if normalized in {"no", "n", "false", "unchecked", "off"}:
                return False
        if field_type == "date":
            for fmt in self._date_patterns():
                try:
                    return datetime.strptime(raw, fmt).date().isoformat()
                except Exception:
                    continue
        return raw
