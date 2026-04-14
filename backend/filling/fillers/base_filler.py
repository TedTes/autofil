from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Dict, List, Optional, Type, Any

from pypdf import PdfReader, PdfWriter

from filling.canonical_projection import CanonicalFillView
from ..template_loader import TemplateLoader, TemplateConfig
from ..writers.pdf_field_writer import PdfFieldWriter


@dataclass
class FillReport:
    """Summary of how well a filler populated a PDF/form output."""
    success: bool
    coverage: float                # 0.0 → 1.0
    filled_fields: int
    unmapped_fields: List[str]
    warnings: List[Any]
    errors: List[Any]


class BaseFiller:
    """Base class for all PDF/DOCX/FORM fillers. Provides common utilities."""

    form_type: str = "GENERIC"
    supported_templates: ClassVar[List[str]] = []
    _registry: ClassVar[Dict[str, Type['BaseFiller']]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        for template_id in getattr(cls, "supported_templates", []) or []:
            normalized = cls._normalize_template_id(template_id)
            if normalized:
                BaseFiller._registry[normalized] = cls

    def __init__(self):
        self.pdf_writer = PdfFieldWriter()

    @staticmethod
    def _normalize_template_id(template_id: str) -> str:
        return re.sub(r"[^a-z0-9_-]+", "", template_id.lower())

    @classmethod
    def resolve_filler(cls, template_id: str) -> Type['BaseFiller']:
        normalized = cls._normalize_template_id(template_id)
        for key, filler_cls in cls._registry.items():
            if normalized == key or normalized.startswith(f"{key}_"):
                return filler_cls
        raise ValueError(f"No filler registered for template {template_id}")

    # -------------------------------------------------------------- #
    # Public API
    # -------------------------------------------------------------- #
    def fill_from_canonical(
        self,
        canonical_data: dict,
        output_path: str,
        template_id: str,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ):
        """
        Child classes must implement this.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__}.fill_from_canonical must be implemented by subclass."
        )

    def fill(
        self,
        canonical_data: dict,
        output_path: str,
        template_id: Optional[str] = None,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ):
        """
        Thin wrapper around fill_from_canonical.

        Child fillers can ignore template_version if they don't need it.
        """
        return self.fill_from_canonical(
            canonical_data=canonical_data,
            output_path=output_path,
            template_id=template_id or "",
            template_version=template_version,
            template_pdf_override=template_pdf_override,
        )

    # -------------------------------------------------------------- #
    # Shared canonical → template mapping
    # -------------------------------------------------------------- #
    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Any = None,   # TemplateConfig-like, but not strictly required
    ) -> Dict[str, Any]:
        """
        Map CanonicalOutput.to_dict() -> flat fields for the filler.

        Strategy:
          - For most entities: take the first .value
          - For 'Classification': build a list of row dicts from .value
          - Optionally could filter by template.field_map keys in future.

        Expected canonical structure:

        {
          "entities": {
            "InsuredName": [
              { "value": "Acme Inc", "confidence": 0.98, ... },
              ...
            ],
            "Classification": [
              { "value": { "class_code": "1234", "exposure": "10000", ... }, ... },
              ...
            ]
          },
          ...
        }
        """
        template_repeaters = {}
        if template is not None and hasattr(template, "repeater_mappings"):
            template_repeaters = template.repeater_mappings

        view = CanonicalFillView.from_canonical(canonical)
        repeater_aliases = self._repeater_field_aliases(template_repeaters)
        flat: Dict[str, Any] = view.scalar_fields(exclude=repeater_aliases.keys())

        for repeater_key, source_fields in repeater_aliases.items():
            rows = view.repeated_rows(*source_fields)
            if rows:
                flat[repeater_key] = rows

        return flat

    def _repeater_field_aliases(self, repeater_mappings: Dict[str, Any]) -> Dict[str, List[str]]:
        aliases: Dict[str, List[str]] = {}
        for repeater_key in repeater_mappings.keys():
            aliases[repeater_key] = self._candidate_repeater_fields(repeater_key)
        return aliases

    def _candidate_repeater_fields(self, repeater_key: str) -> List[str]:
        """
        Candidate canonical field ids that may populate a repeater.

        The explicit repeater key is always tried first, followed by a small
        alias set for the ACORD forms currently supported in this codebase.
        """
        candidates = [repeater_key]
        alias_map = {
            "Classification": ["Classifications"],
            "Classifications": ["Classification"],
            "BlanketSummary": ["BlanketCoverage", "Blankets"],
        }
        candidates.extend(alias_map.get(repeater_key, []))

        seen = set()
        ordered: List[str] = []
        for candidate in candidates:
            if candidate in seen:
                continue
            seen.add(candidate)
            ordered.append(candidate)
        return ordered

    def _load_template(
        self,
        template_id: str,
        template_version: str,
        template_pdf_override: Optional[str] = None,
    ) -> Optional[TemplateConfig]:
        template = TemplateLoader.load(template_id=template_id, version=template_version)
        if template and template_pdf_override:
            template.pdf_url = template_pdf_override
        return template

    def _template_missing_report(
        self,
        template_id: str,
        template_version: str,
    ) -> FillReport:
        return FillReport(
            success=False,
            coverage=0.0,
            filled_fields=0,
            unmapped_fields=[],
            warnings=[f"No template found for {template_id} ({template_version})"],
            errors=["Template loading failed"],
        )

    def _resolve_template_pdf_path(self, template: TemplateConfig) -> Optional[Path]:
        if not template.pdf_url:
            return None
        return Path(template.pdf_url)

    def _missing_pdf_report(self, template: TemplateConfig, reason: str) -> FillReport:
        return FillReport(
            success=False,
            coverage=0.0,
            filled_fields=0,
            unmapped_fields=list(template.field_map.keys()),
            warnings=[reason],
            errors=["PDF template not found"],
        )

    def _open_pdf_template(self, template_pdf_path: Path) -> tuple[PdfReader, PdfWriter]:
        reader = PdfReader(str(template_pdf_path))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        self.pdf_writer.setup_acro_form(reader, writer)
        self.pdf_writer.set_need_appearances(writer)
        return reader, writer

    def _fill_simple_fields(
        self,
        writer: PdfWriter,
        template: TemplateConfig,
        flat_fields: Dict[str, Any],
        warnings: List[str],
        unmapped: List[str],
    ) -> int:
        filled_count = 0
        repeater_mappings = template.repeater_mappings
        for canonical_key, value in flat_fields.items():
            if canonical_key in repeater_mappings:
                continue

            pdf_key = template.get_pdf_field(canonical_key)
            if not pdf_key:
                warnings.append(
                    f"Canonical field has no mapping for this template: {canonical_key}"
                )
                continue

            if not self.pdf_writer.has_field(writer, pdf_key):
                unmapped.append(pdf_key)
                warnings.append(
                    f"PDF field not found: {pdf_key} (from canonical {canonical_key})"
                )
                continue

            if self.pdf_writer.write_field(writer, pdf_key, value):
                filled_count += 1
            else:
                unmapped.append(pdf_key)
                warnings.append(
                    f"Failed to write PDF field: {pdf_key} (from canonical {canonical_key})"
                )
        return filled_count

    def _fill_repeaters(
        self,
        writer: PdfWriter,
        template: TemplateConfig,
        flat_fields: Dict[str, Any],
        warnings: List[str],
        unmapped: List[str],
    ) -> int:
        filled_count = 0
        for repeater_key, repeater_config in template.repeater_mappings.items():
            rows_data = flat_fields.get(repeater_key)

            if not rows_data:
                warnings.append(f"No data for repeater: {repeater_key}")
                continue

            if not isinstance(rows_data, list):
                warnings.append(
                    f"Repeater {repeater_key} expected list of rows, got {type(rows_data)}"
                )
                continue

            row_ids = repeater_config.row_ids
            columns = repeater_config.columns

            if not row_ids or not columns:
                warnings.append(
                    f"Repeater {repeater_key} misconfigured (missing row_ids or columns)"
                )
                continue

            max_rows = min(len(rows_data), len(row_ids))
            for row_idx in range(max_rows):
                row_data = rows_data[row_idx] or {}
                row_id = row_ids[row_idx]
                for canonical_col, pattern in columns.items():
                    value = row_data.get(canonical_col)
                    if value is None:
                        continue

                    field_name = pattern.format(row_id=row_id)
                    if not self.pdf_writer.has_field(writer, field_name):
                        unmapped.append(field_name)
                        warnings.append(
                            f"PDF field not found for repeater {repeater_key}: {field_name}"
                        )
                        continue

                    if self.pdf_writer.write_field(writer, field_name, value):
                        filled_count += 1
                    else:
                        unmapped.append(field_name)
                        warnings.append(
                            f"Failed to write repeater field {field_name} for {repeater_key}"
                        )

            if len(rows_data) > max_rows:
                warnings.append(
                    f"Truncated {repeater_key} to {max_rows} rows (original: {len(rows_data)})"
                )
        return filled_count

    def _calculate_coverage(
        self,
        template: TemplateConfig,
        flat_fields: Dict[str, Any],
        filled_count: int,
    ) -> float:
        repeater_mappings = template.repeater_mappings
        simple_keys = [k for k in flat_fields.keys() if k not in repeater_mappings]
        total_expected_simple = len(simple_keys)

        total_expected_repeaters = 0
        for repeater_key, repeater_config in repeater_mappings.items():
            rows = flat_fields.get(repeater_key, [])
            if isinstance(rows, list):
                row_ids = repeater_config.row_ids
                columns = repeater_config.columns
                max_rows = min(len(rows), len(row_ids))
                total_expected_repeaters += max_rows * len(columns)

        total_expected = total_expected_simple + total_expected_repeaters
        return filled_count / total_expected if total_expected > 0 else 0.0

    def _save_pdf(self, writer: PdfWriter, output_path: str) -> None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as handle:
            writer.write(handle)

    def _error_report(self, message: str) -> FillReport:
        return FillReport(
            success=False,
            coverage=0.0,
            filled_fields=0,
            unmapped_fields=[],
            warnings=[],
            errors=[message],
        )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} form_type={self.form_type}>"

    def get_supported_form_type(self) -> str:
        return self.form_type
