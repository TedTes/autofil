"""
ACORD 126 Extractor → CanonicalOutput

Features:
- Uses PdfFieldParser for fillable PDFs
- Falls back to OCR + pdfplumber tables
- Maps via MFC.aliases() → canonical field IDs
- Extracts Classification table (repeating, any naming pattern)
- Full SourceRef + confidence + tags
- Validates via MFC.required_for("ACORD_126")
"""

from typing import Dict, List, Any
from datetime import datetime
import re

from ..core.schema import CanonicalOutput, EntityValue, SourceRef, Metadata, SourceInfo
from ..extractors.mfc import MFC
from ..validation.validator import validate
from ..core.document import Document, DocumentType
from ..parsers.pdf_field_parser import PdfFieldParser
from ..extractors.extractor_base import BaseExtractor


class ACORD126Extractor(BaseExtractor):
    FORM_TYPE = "ACORD_126"
    LOB = "General Liability"

    def __init__(self):
        self.pdf_parser = PdfFieldParser()
    
    def extract(self, doc: Document) -> CanonicalOutput:
        try:
            entities: Dict[str, List[EntityValue]] = {}
            confidence = 0.98  # Default: high confidence
            
            # === 1. Fillable PDF (High Confidence) ===
            if self.pdf_parser.is_fillable(doc.file_path):
                raw_fields = self.pdf_parser.extract_fields(doc.file_path)
                if raw_fields:
                    self._extract_from_pdf_fields(raw_fields, entities, confidence=0.98)
                else:
                    confidence = 0.65  # Only drop if fillable fails
            else:
                confidence = 0.65
            # === 2. OCR + Table Fallback (Only if needed) ===
            if entities:  # ← If  got ANYTHING from fillable
                ocr_needed = "Classification" not in entities
            else:
                ocr_needed = True
                
            # if ocr_needed:
            #    self._extract_from_ocr_and_tables(doc, entities, confidence=confidence)
            # === 3. Build Output ===
            output = CanonicalOutput(
                job_id=doc.job_id,
                source=SourceInfo(
                    file_name=doc.file_name,
                    file_type="pdf",
                    extraction_method="fillable_pdf" if confidence >= 0.98 else "ocr+table",
                    extracted_at=datetime.utcnow()
                ),
                entities=entities,
                metadata=Metadata(
                    form_type_detected=self.FORM_TYPE,
                    line_of_business=self.LOB,
                    schema_version="1.0"
                )
            )
  
            # output = validate(output)
            
            return output
        except Exception as e:
            print("extract error:",str(e))

    # --------------------------------------------------------------------- #
    #  Fillable PDF Extraction
    # --------------------------------------------------------------------- #
    def _extract_from_pdf_fields(self, raw_fields: Dict[str, Any], entities: Dict, confidence: float):
           try:
                for field_name, value in raw_fields.items():
                    if not value or str(value).strip() in ("", "/Off", "Off"):
                        continue

                    lower_name = field_name.lower()

                    # === 1. CLASSIFICATION TABLE ===
                    if re.search(r"_([A-Z0-9]+)_(classcode|classification|exposure|premiumbasiscode|premisesoperationsrate|productsrate|territorycode)_", lower_name, re.IGNORECASE):
                        self._handle_classification_table(field_name, value, entities, confidence)
                        continue  # ← skip rest

                    # === 2. EFFECTIVE DATE ===
                    if "effective" in lower_name or "eff" in lower_name:
                        ev = EntityValue(
                            value=self._clean_value("EffectiveDate", value),
                            confidence=confidence,
                            source=SourceRef(page=1, extraction_rule="pdf_field"),
                            tags=["fillable_pdf"]  # ← no 'classification'
                        )
                        entities.setdefault("EffectiveDate", []).append(ev)
                        continue

                    # === 3. ALL OTHER FIELDS ===
                    canonical_id = self._map_pdf_field_to_canonical(field_name)
                    if canonical_id:
                        ev = EntityValue(
                            value=self._clean_value(canonical_id, value),
                            confidence=confidence,
                            source=SourceRef(page=1, extraction_rule="pdf_field"),
                            tags=["fillable_pdf"]  # ← ONLY fillable_pdf
                        )
                        entities.setdefault(canonical_id, []).append(ev)
           except Exception as e:
              print("_extract_from_pdf_fields", str(e))

    # --------------------------------------------------------------------- #
    #  OCR + Table Extraction
    # --------------------------------------------------------------------- #
    def _extract_from_ocr_and_tables(self, doc: Document, entities: Dict, confidence: float):
        try:
            text = doc.raw_text

            # Extract required text fields via regex
            for field_id in MFC.required_for(self.FORM_TYPE):
                if field_id in entities and field_id != "Classification":
                    continue
                field_def = MFC.field(field_id)
                if not field_def:
                    continue
                pattern = self._build_regex(field_def.get("aliases", []))
                match = pattern.search(text)
                if match:
                    value = match.group(1).strip()
                    if value:
                        ev = EntityValue(
                            value=self._clean_value(field_id, value),
                            confidence=confidence,
                            source=SourceRef(page=1, extraction_rule="ocr_regex"),
                            tags=["ocr"]
                        )
                        entities.setdefault(field_id, []).append(ev)

            # Extract Classification table from pdfplumber
            if "Classification" not in entities:
                self._extract_classification_from_tables(doc.tables, entities, confidence)
        except Exception as e:
            print("_extract_from_ocr_and_tables",str(e))

    def _extract_classification_from_tables(self, tables: List[Any], entities: Dict, confidence: float):
        try:
            for table in tables:
                headers = [h.lower() for h in table.headers]
                header_text = " ".join(headers)
                if not any(kw in header_text for kw in ["class", "code", "description", "exposure"]):
                    continue

                classifications = []
                for i, row in enumerate(table.rows):
                    if len(row) < 4:
                        continue
                    value = {
                        "class_code": self._safe_get(row, headers, ["class code", "class", "code"], 0),
                        "description": self._safe_get(row, headers, ["description", "desc"], 1),
                        "premium_basis": self._safe_get(row, headers, ["premium basis", "basis"], 2),
                        "exposure": self._to_float(self._safe_get(row, headers, ["exposure"], 3)),
                        "rate": self._to_float(self._safe_get(row, headers, ["rate"], 4)),
                        "premium": self._to_float(self._safe_get(row, headers, ["premium"], 5)),
                    }
                    classifications.append(
                        EntityValue(
                            value=value,
                            confidence=confidence,
                            source=SourceRef(
                                page=table.metadata.get("page", 1),
                                table_id=f"table_{table.metadata.get('table_index', 0)}",
                                row=i
                            ),
                            tags=["table", "classification"]
                        )
                    )
                if classifications:
                    entities["Classification"] = classifications
                    break
        except Exception as e:
            print(" _extract_classification_from_tables",str(e))

    # --------------------------------------------------------------------- #
    #  Classification Table (Fillable PDF) – Robust Matching
    # --------------------------------------------------------------------- #
    def _handle_classification_table(self, field_name: str, value: str, entities: Dict, confidence: float):
        try:
            match = re.search(r"_([A-Z0-9]+)_(classcode|classification|exposure|premiumbasiscode|premisesoperationsrate|productsrate|territorycode)_", field_name, re.IGNORECASE)
            if not match:
                return

            row_id = match.group(1).upper()
            key_raw = match.group(2).lower()

            # Use last character
            row_char = row_id[-1]
            if row_char.isdigit():
                index = int(row_char) - 1
            else:
                index = ord(row_char) - ord('A')

            key_map = {
                "classcode": "class_code",
                "classification": "description",
                "exposure": "exposure",
                "premiumbasiscode": "premium_basis",
                "premisesoperationsrate": "rate",
                "productsrate": "rate",
                "territorycode": "territory"
            }
            key = key_map.get(key_raw)
            if not key:
                return

            # Initialize Classification list
            if "Classification" not in entities:
                entities["Classification"] = []

            # Ensure we have space
            # Only grow with real EntityValue objects
            while len(entities["Classification"]) <= index:
                entities["Classification"].append(
                    EntityValue(
                        value={},
                        confidence=confidence,
                        source=SourceRef(page=1, extraction_rule="pdf_field"),
                        tags=["fillable_pdf", "classification"]
                    )
                )

            entities["Classification"][index].value[key] = clean_val
            # Set value
            clean_val = self._clean_value("Classification", value)
            if key in ["exposure", "rate"]:
                try:
                    clean_val = float(str(clean_val).replace('$', '').replace(',', ''))
                except:
                    clean_val = 0.0

            entities["Classification"][index].value[key] = clean_val
        except Exception as e:
            print("_handle_classification_table",str(e))

    # --------------------------------------------------------------------- #
    #  Helpers
    # --------------------------------------------------------------------- #
    def _safe_get(self, row: List[str], headers: List[str], candidates: List[str], default_idx: int) -> str:
        try:
            for cand in candidates:
                if cand in headers:
                    return row[headers.index(cand)]
            return row[default_idx] if default_idx < len(row) else ""
        except Exception as e:
            print("_safe_get",str(e))

    def _map_pdf_field_to_canonical(self, pdf_name: str) -> str | None:
        try:
            # Remove suffix _A, _B
            normalized = re.sub(r'_[A-Z0-9]+$', '', pdf_name)
            # Split camelCase
            normalized = re.sub(r'(?<!^)(?=[A-Z])', ' ', normalized)
            lower = normalized.lower()

            for fid, defn in MFC._load()["fields"].items():
                aliases = [a.lower() for a in defn.get("aliases", [])]
                if any(alias in lower for alias in aliases):
                    return fid
            return None
        except Exception as e:
            print("_map_pdf_field_to_canonical",str(e))

    def _build_regex(self, aliases: List[str]) -> re.Pattern:
        try:

            patterns = [re.escape(a) for a in aliases]
            return re.compile(f"({'|'.join(patterns)})[\\s:]*([^\\n]+)", re.IGNORECASE)
        except  Exception as e:
            print("_build_regex",str(e))

    def _clean_value(self, field_id: str, raw: str) -> Any:
        try:
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
            return raw
        except Exception as e:
            print('_clean_value',str(e))

    def _to_float(self, s: str) -> float:
        try:
            return float(re.sub(r"[^\d.]", "", s))
        except Exception as e:
            print("_to_float",str(e))
            return 0.0