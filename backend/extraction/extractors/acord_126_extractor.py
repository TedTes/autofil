from datetime import datetime
from typing import Dict, Any, List, Iterable, Optional
import re
from functools import lru_cache

from ..core.schema import (
    CanonicalOutput,
    EntityValue,
    SourceRef,
    Metadata,
    SourceInfo,
)
from ..core.document import Document, DocumentType
from ..extractors.extractor_base import BaseExtractor
from ..models.extraction_result import ExtractionResult
from ..validation.validator import validate
from ..parsers.pdf_field_parser import PdfFieldParser
from ..extractors.mfc import MFC
from utils.versioned_template_loader import (
    VersionedTemplateLoader,
    TemplateRecognizer,
    TemplateConfig,
)
from ..utils.semantic_section_builder import SemanticSectionBuilder


class ACORD126Extractor(BaseExtractor):
    FORM_TYPE = "ACORD_126"
    LOB = "General Liability"

    def __init__(self):
        self.pdf_parser = PdfFieldParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(base_dir=self.template_loader.base_dir)

    def extract(self, doc: Document) -> ExtractionResult:
        if doc.document_type != DocumentType.ACORD_126:
            return self._failure_result(
                f"Expected ACORD_126 document, got {doc.document_type.value}"
            )

        entities: Dict[str, List[EntityValue]] = {}
        confidence = 0.65
        extraction_method = "ocr_text_alias"

        # 1) Raw fields from fillable PDF
        raw_fields: Dict[str, Any] = {}
        if self.pdf_parser.is_fillable(doc.file_path):
            raw_fields = self.pdf_parser.extract_fields(doc.file_path)
            if raw_fields:
                confidence = 0.98
                extraction_method = "fillable_pdf_alias"

        template_config: Optional[TemplateConfig] = None
        if raw_fields:
            detected = self.template_recognizer.detect(raw_fields.keys())
            if detected:
                template_config = self.template_loader.load(detected)

        # 2) Map fields using template (with alias fallback)
        if raw_fields:
            self._map_fields(raw_fields, entities, confidence, template_config)

        # 3) Use OCR/text-layer content for scanned forms or to patch missing fields.
        if doc.raw_text:
            missing_field_ids = set(self._relevant_field_ids())
            if entities:
                missing_field_ids -= set(entities.keys())
                extraction_method = "fillable_pdf_plus_ocr_text"
            self._extract_from_text(
                doc,
                entities,
                confidence=0.72 if not raw_fields else 0.78,
                field_ids=missing_field_ids,
            )

        if not entities:
            return self._failure_result("No extractable ACORD 126 data found")

        semantic_sections = SemanticSectionBuilder.build(entities)

        # 4) Build CanonicalOutput
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
                # no template id in alias mode
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
        return document.document_type == DocumentType.ACORD_126

    def get_supported_types(self) -> List[DocumentType]:
        return [DocumentType.ACORD_126]

    # ---------------------------------------------------------- #
    # Alias-based mapping
    # ---------------------------------------------------------- #
    def _map_fields(
        self,
        raw_fields: Dict[str, Any],
        entities: Dict[str, List[EntityValue]],
        confidence: float,
        template_config: Optional[TemplateConfig],
    ) -> None:
        """
        Map each raw PDF field name to a canonical_id by:
          - normalizing name
          - matching against MFC aliases
          - handling special cases (Classification rows, etc. if you want)
        """
        template_hits: set[str] = set()

        for field_name, value in raw_fields.items():
            if value is None or str(value).strip() in ("", "/Off", "Off"):
                continue

            # Example: treat certain patterns as Classification table
            if self._looks_like_classification_field(field_name):
                self._map_classification_field(field_name, value, entities, confidence)
                continue

            canonical_id: Optional[str] = None
            mapped_via_template = False
            if template_config:
                canonical_id = self._map_via_template(field_name, template_config)
                if canonical_id:
                    mapped_via_template = True
                    template_hits.add(canonical_id)

            if not canonical_id:
                canonical_id = self._map_pdf_field_to_canonical(field_name)
            if not canonical_id:
                # Unknown / unmapped field, ignore for now
                continue

            cleaned_value = self._clean_value(canonical_id, str(value))

            ev = EntityValue(
                value=cleaned_value,
                confidence=confidence,
                source=SourceRef(
                    page=1,
                    extraction_rule="pdf_field_alias",
                ),
                tags=["fillable_pdf", "alias"],
            )
            entities.setdefault(canonical_id, []).append(ev)

    def _extract_from_text(
        self,
        doc: Document,
        entities: Dict[str, List[EntityValue]],
        confidence: float,
        field_ids: set[str],
    ) -> None:
        text = doc.raw_text or ""
        if not text:
            return

        for field_id in field_ids:
            if field_id == "Classification":
                continue

            match = self._match_alias_value(text, field_id)
            if not match:
                continue

            value, start_offset = match
            cleaned_value = self._clean_value(field_id, value)
            if cleaned_value in ("", None):
                continue

            entities.setdefault(field_id, []).append(
                EntityValue(
                    value=cleaned_value,
                    confidence=confidence,
                    source=SourceRef(
                        page=self._find_page_for_offset(text, start_offset),
                        text_block_index=start_offset,
                        extraction_rule="ocr_text_alias",
                    ),
                    tags=["ocr_text", "alias"],
                )
            )

    # ---------------------------------------------------------- #
    # Classification (optional alias-based).
    #  NOTE: simplify/remove this if not needed.
    # ---------------------------------------------------------- #
    def _looks_like_classification_field(self, field_name: str) -> bool:
        lower = field_name.lower()
        return bool(
            re.search(
                r"(classcode|classification|exposure|premiumbasis|premisesoperationsrate|productsrate|territorycode)",
                lower,
            )
        )

    def _map_classification_field(
        self,
        field_name: str,
        value: Any,
        entities: Dict[str, List[EntityValue]],
        confidence: float,
    ) -> None:
        """
        Simple heuristic: group classification row fields by trailing index/letter.
        Example field names:
          GeneralLiability_Hazard_ClassCode_A
          GeneralLiability_Hazard_Exposure_1
        """
        # Try to find a row id at the end
        m = re.search(r"[_\-]([A-Za-z0-9])$", field_name)
        if not m:
            return

        row_id = m.group(1)
        lower = field_name.lower()

        # Decide which logical column this is
        if "classcode" in lower:
            key = "class_code"
        elif "class" in lower:
            key = "description"
        elif "exposure" in lower:
            key = "exposure"
        elif "premiumbasis" in lower or "basis" in lower:
            key = "premium_basis"
        elif "premisesoperationsrate" in lower or "prem_ops" in lower:
            key = "prem_ops_rate"
        elif "productsrate" in lower:
            key = "products_rate"
        elif "territory" in lower:
            key = "territory"
        else:
            return

        # Prepare Classification list
        if "Classification" not in entities:
            entities["Classification"] = []

        # Map row_id → index
        # 'A'→0, 'B'→1 ... or numeric indexing
        if row_id.isdigit():
            idx = int(row_id) - 1
        else:
            idx = ord(row_id.upper()) - ord("A")

        # Ensure we have enough rows
        while len(entities["Classification"]) <= idx:
            entities["Classification"].append(
                EntityValue(
                    value={},  # row dict
                    confidence=confidence,
                    source=SourceRef(
                        page=1,
                        extraction_rule="pdf_field_classification",
                    ),
                    tags=["fillable_pdf", "classification"],
                )
            )

        row_ev = entities["Classification"][idx]
        row_dict = row_ev.value

        clean_val = str(value).strip()
        # Basic numeric conversion for exposure/rates
        if key in ("exposure", "prem_ops_rate", "products_rate"):
            try:
                clean_val = float(re.sub(r"[^\d.]", "", clean_val))
            except Exception:
                pass

        row_dict[key] = clean_val
        row_ev.value = row_dict  # reassign (probably not strictly needed)

    # ---------------------------------------------------------- #
    # Helpers
    # ---------------------------------------------------------- #
    def _map_via_template(
        self, field_name: str, template_config: TemplateConfig
    ) -> Optional[str]:
        pdf_to_canonical = template_config.pdf_to_canonical

        candidates = [
            field_name,
            field_name.lstrip("/"),
            re.sub(r"\s+", "", field_name),
        ]

        for candidate in candidates:
            if candidate in pdf_to_canonical:
                return pdf_to_canonical[candidate]

        return None

    def _map_pdf_field_to_canonical(self, field_name: str) -> str | None:
        canonical = self._target_index().get(field_name)
        if canonical:
            return canonical

        normalized = re.sub(r"_[A-Z0-9]+$", "", field_name)
        lower = normalized.lower()
        field_norm = re.sub(r"[^a-z0-9]", "", lower)

        for fid, defn in MFC._load().get("fields", {}).items():
            for alias in defn.get("aliases", []):
                alias_norm = re.sub(r"[^a-z0-9]", "", alias.lower())
                if alias_norm and alias_norm in field_norm:
                    return fid

        return None

    @lru_cache(maxsize=1)
    def _target_index(self) -> Dict[str, str]:
        mapping: Dict[str, str] = {}
        for fid, meta in MFC._load().get("fields", {}).items():
            targets = meta.get("targets", {})
            pdf_target = targets.get("acord_126_pdf")
            if not pdf_target:
                continue
            if isinstance(pdf_target, str):
                mapping[pdf_target] = fid
        return mapping

    @lru_cache(maxsize=1)
    def _relevant_field_ids(self) -> List[str]:
        field_ids: List[str] = []
        for field_id, meta in MFC._load().get("fields", {}).items():
            required_for = meta.get("required_for", [])
            targets = meta.get("targets", {})
            if self.FORM_TYPE in required_for or targets.get("acord_126_pdf"):
                field_ids.append(field_id)
        return field_ids

    def _match_alias_value(self, text: str, field_id: str) -> Optional[tuple[str, int]]:
        aliases = MFC.aliases(field_id)
        if not aliases:
            return None

        for alias in aliases:
            pattern = re.compile(
                rf"{re.escape(alias)}\s*[:\-]?\s*([^\n]+)",
                re.IGNORECASE,
            )
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

    def _clean_value(self, field_id: str, raw: str):
        """
        Normalize value according to type in MFC schema (money, integer, etc.)
        """
        raw = raw.strip()
        if not raw:
            return raw
        field = MFC.field(field_id)
        if not field:
            return raw

        t = field.get("type")
        if t == "money":
            return float(re.sub(r"[^\d.]", "", raw)) if re.search(r"\d", raw) else 0.0
        if t == "integer":
            return int(re.sub(r"\D", "", raw)) if re.search(r"\d", raw) else 0
        if t == "boolean":
            normalized = raw.lower()
            if normalized in {"yes", "y", "true", "checked", "on"}:
                return True
            if normalized in {"no", "n", "false", "unchecked", "off"}:
                return False

        # future: dates, bools, etc.
        return raw
