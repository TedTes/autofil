from datetime import datetime
from typing import Dict, Any, List

from ..core.schema import CanonicalOutput, EntityValue, SourceRef, Metadata, SourceInfo
from ..core.document import Document
from ..extractors.extractor_base import BaseExtractor
from ..parsers.pdf_field_parser import PdfFieldParser
from ..extractors.mfc import MFC

from .template_recognizer import TemplateRecognizer
from .template_loader import TemplateLoader


class ACORD126Extractor(BaseExtractor):
    FORM_TYPE = "ACORD_126"
    LOB = "General Liability"

    def __init__(self, templates_dir: str):
        self.pdf_parser = PdfFieldParser()
        self.recognizer = TemplateRecognizer(templates_dir)
        self.templates_dir = templates_dir

    def extract(self, doc: Document) -> CanonicalOutput:
        entities: Dict[str, List[EntityValue]] = {}
        confidence = 0.65

        # 1) Raw fields from fillable PDF
        raw_fields: Dict[str, Any] = {}
        if self.pdf_parser.is_fillable(doc.file_path):
            raw_fields = self.pdf_parser.extract_fields(doc.file_path)
            if raw_fields:
                confidence = 0.98

        # 2) Try to recognize template
        template_id = None
        template = None
        if raw_fields:
            template_id = self.recognizer.recognize(raw_fields, doc.raw_text or "")
            if template_id:
                template = TemplateLoader.load(self.templates_dir, template_id)

        # 3) Map fields
        if template:
            self._map_template_fields(template, raw_fields, entities, confidence)
            self._map_template_checkboxes(template, raw_fields, entities, confidence)
            self._map_template_repeaters(template, raw_fields, entities, confidence)
        else:
            # fallback to old alias-based mapping
            self._fallback_map(raw_fields, entities, confidence)

        # (optional) OCR/tables to patch Classification if still missing

        # 4) Build CanonicalOutput
        return CanonicalOutput(
            job_id=doc.job_id,
            source=SourceInfo(
                file_name=doc.file_name,
                file_type="pdf",
                extraction_method="fillable_pdf_template" if template else "fillable_pdf_fallback",
                extracted_at=datetime.utcnow(),
            ),
            entities=entities,
            metadata=Metadata(
                form_type_detected=self.FORM_TYPE,
                line_of_business=self.LOB,
                schema_version="1.0",
                template_id=template_id or "unknown",
            ),
        )

    # ----------------- template mapping helpers ----------------- #

    def _map_template_fields(self, template: dict, raw_fields: Dict[str, Any],
                             entities: Dict, confidence: float) -> None:
        for canonical_id, pdf_name in template.get("field_map", {}).items():
            raw_val = raw_fields.get(pdf_name)
            if not raw_val or str(raw_val).strip() in ("", "/Off", "Off"):
                continue

            value = self._clean_value(canonical_id, raw_val)
            ev = EntityValue(
                value=value,
                confidence=confidence,
                source=SourceRef(page=1, extraction_rule="pdf_field_template"),
                tags=["fillable_pdf", "template", template["template_id"]],
            )
            entities.setdefault(canonical_id, []).append(ev)

    def _map_template_checkboxes(self, template: dict, raw_fields: Dict[str, Any],
                                 entities: Dict, confidence: float) -> None:
        for canonical_id, pdf_name in template.get("checkbox_map", {}).items():
            raw_val = raw_fields.get(pdf_name)
            if raw_val is None:
                continue
            checked = str(raw_val).strip().lower() not in ("off", "/off", "0", "false")
            ev = EntityValue(
                value=checked,
                confidence=confidence,
                source=SourceRef(page=1, extraction_rule="pdf_field_checkbox"),
                tags=["fillable_pdf", "checkbox", template["template_id"]],
            )
            entities.setdefault(canonical_id, []).append(ev)

    def _map_template_repeaters(self, template: dict, raw_fields: Dict[str, Any],
                                entities: Dict, confidence: float) -> None:
        for canonical_id, spec in template.get("repeaters", {}).items():
            rows: List[EntityValue] = []
            row_ids = spec.get("row_ids", [])
            columns = spec.get("columns", {})

            for rid in row_ids:
                row_obj: Dict[str, Any] = {}
                non_empty = False
                for logical_key, pattern in columns.items():
                    pdf_field_name = pattern.format(row=rid)
                    raw_val = raw_fields.get(pdf_field_name)
                    if not raw_val or str(raw_val).strip() in ("", "/Off", "Off"):
                        continue
                    cleaned = self._clean_value(canonical_id, raw_val)
                    row_obj[logical_key] = cleaned
                    non_empty = True

                if non_empty:
                    rows.append(
                        EntityValue(
                            value=row_obj,
                            confidence=confidence,
                            source=SourceRef(
                                page=1,
                                extraction_rule="pdf_field_repeater",
                                row=rid,
                            ),
                            tags=["fillable_pdf", "repeater", canonical_id, template["template_id"]],
                        )
                    )

            if rows:
                entities[canonical_id] = rows

    # ----------------- fallback & helpers ----------------- #

    def _fallback_map(self, raw_fields: Dict[str, Any], entities: Dict,
                      confidence: float) -> None:
        """Your old MFC alias-based logic lives here."""
        for field_name, value in raw_fields.items():
            if not value or str(value).strip() in ("", "/Off", "Off"):
                continue

            canonical_id = self._map_pdf_field_to_canonical(field_name)
            if not canonical_id:
                continue

            ev = EntityValue(
                value=self._clean_value(canonical_id, value),
                confidence=confidence,
                source=SourceRef(page=1, extraction_rule="pdf_field_fallback"),
                tags=["fillable_pdf", "fallback"],
            )
            entities.setdefault(canonical_id, []).append(ev)

    def _map_pdf_field_to_canonical(self, field_name: str) -> str | None:
        # reuse your existing implementation here
        normalized = re.sub(r"_[A-Z0-9]+$", "", field_name)
        normalized = re.sub(r"(?<!^)(?=[A-Z])", " ", normalized)
        lower = normalized.lower()

        for fid, defn in MFC._load()["fields"].items():
            aliases = [a.lower() for a in defn.get("aliases", [])]
            if any(alias in lower for alias in aliases):
                return fid
        return None

    def _clean_value(self, field_id: str, raw: str):
        # reuse your _clean_value logic from the old class
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
