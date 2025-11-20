from datetime import datetime
from typing import Dict, Any, List
import re
from functools import lru_cache

from ..core.schema import CanonicalOutput, EntityValue, SourceRef, Metadata, SourceInfo
from ..core.document import Document
from ..extractors.extractor_base import BaseExtractor
from ..parsers.pdf_field_parser import PdfFieldParser
from ..extractors.mfc import MFC


class ACORD126Extractor(BaseExtractor):
    FORM_TYPE = "ACORD_126"
    LOB = "General Liability"

    def __init__(self):
        # No templates_dir, no recognizer
        self.pdf_parser = PdfFieldParser()

    def extract(self, doc: Document) -> CanonicalOutput:
        entities: Dict[str, List[EntityValue]] = {}
        confidence = 0.65

        # 1) Raw fields from fillable PDF
        raw_fields: Dict[str, Any] = {}
        if self.pdf_parser.is_fillable(doc.file_path):
            raw_fields = self.pdf_parser.extract_fields(doc.file_path)
            if raw_fields:
                confidence = 0.98

        # 2) Alias-based mapping only
        if raw_fields:
            self._map_alias_fields(raw_fields, entities, confidence)

        # (optional) future: OCR/tables to patch Classification if still missing

        # 3) Build CanonicalOutput
        return CanonicalOutput(
            job_id=doc.job_id,
            source=SourceInfo(
                file_name=doc.file_name,
                file_type="pdf",
                extraction_method="fillable_pdf_alias",
                extracted_at=datetime.utcnow(),
            ),
            entities=entities,
            metadata=Metadata(
                form_type_detected=self.FORM_TYPE,
                line_of_business=self.LOB,
                schema_version="1.0",
                # no template id in alias mode
            ),
        )

    # ---------------------------------------------------------- #
    # Alias-based mapping
    # ---------------------------------------------------------- #
    def _map_alias_fields(
        self,
        raw_fields: Dict[str, Any],
        entities: Dict[str, List[EntityValue]],
        confidence: float,
    ) -> None:
        """
        Map each raw PDF field name to a canonical_id by:
          - normalizing name
          - matching against MFC aliases
          - handling special cases (Classification rows, etc. if you want)
        """
        for field_name, value in raw_fields.items():
            if value is None or str(value).strip() in ("", "/Off", "Off"):
                continue

            # Example: treat certain patterns as Classification table
            if self._looks_like_classification_field(field_name):
                self._map_classification_field(field_name, value, entities, confidence)
                continue

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

        # future: dates, bools, etc.
        return raw
