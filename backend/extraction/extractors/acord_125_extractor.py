"""
ACORD 125 Extractor → CanonicalOutput

Uses:
  - PdfReader (via Document)
  - PdfFieldParser (fillable fields)
  - OcrFallbackParser (scanned PDFs)
  - MFC (field definitions + aliases)
  - core.schema.CanonicalOutput
  - validation.validator.validate()
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import re

from ..core.schema import (
    CanonicalOutput,
    EntityValue, SourceRef,
    Metadata, SourceInfo
)
from ..extractors.mfc import MFC
from ..validation.validator import validate
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser, OcrFallbackParser
from utils.versioned_template_loader import (
    VersionedTemplateLoader,
    TemplateRecognizer,
    TemplateConfig,
)
from .extractor_base import BaseExtractor
from ..utils.semantic_section_builder import SemanticSectionBuilder



class ACORD125Extractor(BaseExtractor):
    def __init__(self):
        self.pdf_parser = PdfFieldParser()
        self.ocr_parser = OcrFallbackParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(
            base_dir=self.template_loader.base_dir
        )

    def extract(self, doc: Document) -> ExtractionResult:
        entities: Dict[str, List[EntityValue]] = {}

        # === 1. Try Fillable PDF Fields (High Confidence) ===
        template_config: Optional[TemplateConfig] = None

        if self.pdf_parser.is_fillable(doc.file_path):
            raw_fields = self.pdf_parser.extract_fields(doc.file_path)
            if raw_fields:
                template_id = self.template_recognizer.detect(raw_fields.keys())
                if template_id:
                    template_config = self.template_loader.load(template_id)
                self._extract_from_pdf_fields(
                    raw_fields,
                    entities,
                    confidence=0.98,
                    template_config=template_config,
                )
            else:
                self._extract_from_ocr(doc, entities, confidence=0.65)
        else:
            # === 2. OCR Fallback ===
            self._extract_from_ocr(doc, entities, confidence=0.65)

        semantic_sections = SemanticSectionBuilder.build(entities)

        # === 3. Build Canonical Output ===
        output = CanonicalOutput(
            job_id=doc.job_id,
            source=SourceInfo(
                file_name=doc.file_name,
                file_type="pdf",
                extraction_method="fillable_pdf" if self.pdf_parser.is_fillable(doc.file_path) else "ocr",
                extracted_at=datetime.utcnow()
            ),
            semantic_sections=semantic_sections,
            metadata=Metadata(
                form_type_detected="ACORD_125",
                line_of_business="Property",
                schema_version="1.0"
            )
        )

        # === 4. Validate (MFC + confidence) ===
        validated = validate(output)

        return self._success_result(
            validated,
            confidence=0.98 if self.pdf_parser.is_fillable(doc.file_path) else 0.65,
            metadata={
                "form_type": "ACORD_125",
                "line_of_business": "Property",
            },
        )

    # --------------------------------------------------------------------- #
    #  Fillable PDF Extraction
    # --------------------------------------------------------------------- #
    def _extract_from_pdf_fields(
        self,
        raw_fields: Dict[str, Any],
        entities: Dict,
        confidence: float,
        template_config: Optional[TemplateConfig] = None,
    ):
        for field_name, value in raw_fields.items():
            if not value or value == "/Off":  # Skip unchecked boxes
                continue

            # Map to canonical field via MFC aliases
            canonical_id = None
            if template_config:
                canonical_id = self._map_via_template(field_name, template_config)

            if not canonical_id:
                canonical_id = self._map_pdf_field_to_canonical(field_name)
            if not canonical_id:
                continue

            # Assume first page for now (enhance with page info later)
            source = SourceRef(page=1, extraction_rule="pdf_field", text_block_index=field_name)

            ev = EntityValue(
                value=self._clean_value(canonical_id, value),
                confidence=confidence,
                source=source,
                tags=["fillable_pdf"]
            )
            entities.setdefault(canonical_id, []).append(ev)

    def _map_pdf_field_to_canonical(self, pdf_field_name: str) -> str | None:
        """Match PDF field name → canonical field ID using MFC aliases."""
        pdf_field_lower = pdf_field_name.lower()
        for field_id in MFC._load()["fields"]:
            field_def = MFC.field(field_id)
            if not field_def:
                continue
            aliases = [a.lower() for a in field_def.get("aliases", [])]
            if any(alias in pdf_field_lower for alias in aliases):
                return field_id
        return None

    # --------------------------------------------------------------------- #
    #  OCR Fallback Extraction
    # --------------------------------------------------------------------- #
    def _extract_from_ocr(self, doc: Document, entities: Dict, confidence: float):
        ocr_result = self.ocr_parser.extract_fields(doc.file_path)
        text = ocr_result.get("text", "")
        if not text:
            return

        # Extract using MFC aliases as regex patterns
        for field_id in MFC.required_for("ACORD_125"):
            field_def = MFC.field(field_id)
            if not field_def:
                continue

            aliases = field_def.get("aliases", [])
            pattern = self._build_regex(aliases)
            match = pattern.search(text)
            if match:
                value = match.group(1).strip()
                if value:
                    source = SourceRef(page=1, extraction_rule="ocr_regex")
                    ev = EntityValue(
                        value=self._clean_value(field_id, value),
                        confidence=confidence,
                        source=source,
                        tags=["ocr"]
                    )
                    entities.setdefault(field_id, []).append(ev)

    # --------------------------------------------------------------------- #
    #  Utilities
    # --------------------------------------------------------------------- #
    def _build_regex(self, aliases: List[str]) -> re.Pattern:
        """Build case-insensitive regex from aliases."""
        patterns = [re.escape(alias) for alias in aliases]
        return re.compile(f"({'|'.join(patterns)})[\\s:]*([^\\n]+)", re.IGNORECASE)

    def _clean_value(self, field_id: str, raw: str) -> Any:
        """Clean value based on MFC type."""
        raw = raw.strip()
        if not raw:
            return raw

        field_def = MFC.field(field_id)
        if not field_def:
            return raw

        ftype = field_def.get("type", "string")
        if ftype == "money":
            return float(re.sub(r"[^\d.]", "", raw)) if re.search(r"\d", raw) else 0.0
        if ftype == "integer":
            return int(re.sub(r"\D", "", raw)) if re.search(r"\d", raw) else 0
        if ftype == "date":
            for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
                try:
                    return datetime.strptime(raw, fmt).date().isoformat()
                except:
                    continue
        return raw

    def __repr__(self) -> str:
        return "ACORD125Extractor()"

    def can_extract(self, document: Document) -> bool:
        return document.document_type.value == "acord_125"

    def get_supported_types(self) -> List[DocumentType]:
        return [DocumentType.ACORD_125]

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
            canonical = pdf_to_canonical.get(candidate)
            if canonical:
                return canonical
        return None
