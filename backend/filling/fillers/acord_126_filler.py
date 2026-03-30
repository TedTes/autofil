"""
ACORD 126 PDF filler built on shared ``pypdf`` primitives.

The filler keeps the existing template contract:
- canonical data is flattened into canonical field ids
- template config maps canonical ids to PDF field names
- repeater config expands row-based sections into field patterns
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from .base_filler import BaseFiller, FillReport


class Acord126Filler(BaseFiller):
    """Filler for ACORD 126 General Liability Application forms."""

    form_type = "ACORD_126"
    supported_templates = ["acord_126"]

    def __init__(self):
        super().__init__()
        self.template_base_dir = Path(__file__).resolve().parent.parent / "templates"

    def fill_from_canonical(
        self,
        canonical_data: Dict[str, Any],
        output_path: str,
        template_id: str = "acord_126_2016",
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ) -> FillReport:
        try:
            template = self._load_template(
                template_id=template_id,
                template_version=template_version,
                template_pdf_override=template_pdf_override,
            )
            if not template:
                return self._template_missing_report(template_id, template_version)

            flat_fields = self._canonical_to_template_fields(canonical_data, template)

            template_pdf_path = self._resolve_template_pdf_path(template)
            if not template_pdf_path:
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=list(template.field_map.keys()),
                    warnings=[f"Template config has no pdf_url for {template.template_id}"],
                    errors=["Missing pdf_url in template"],
                )

            if not template_pdf_path.exists():
                return self._missing_pdf_report(
                    template,
                    f"Template PDF missing: {template_pdf_path}",
                )

            reader, writer = self._open_pdf_template(template_pdf_path)
            if "/AcroForm" not in reader.trailer["/Root"]:
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=list(flat_fields.keys()),
                    warnings=["PDF has no AcroForm — cannot fill fields"],
                    errors=["Non-fillable PDF template"],
                )

            warnings: List[str] = []
            unmapped: List[str] = []

            filled_count = self._fill_simple_fields(
                writer=writer,
                template=template,
                flat_fields=flat_fields,
                warnings=warnings,
                unmapped=unmapped,
            )
            filled_count += self._fill_repeaters(
                writer=writer,
                template=template,
                flat_fields=flat_fields,
                warnings=warnings,
                unmapped=unmapped,
            )

            coverage = self._calculate_coverage(
                template=template,
                flat_fields=flat_fields,
                filled_count=filled_count,
            )

            self.pdf_writer.set_need_appearances(writer)
            self._save_pdf(writer, output_path)

            return FillReport(
                success=True,
                coverage=coverage,
                filled_fields=filled_count,
                unmapped_fields=unmapped,
                warnings=warnings,
                errors=[],
            )
        except Exception as exc:
            return self._error_report(str(exc))

    def __repr__(self) -> str:
        return f"Acord126Filler(template_base_dir={self.template_base_dir})"
