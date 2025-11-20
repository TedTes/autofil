"""
ACORD 126 PDF Filler — Fills blank ACORD 126 template with canonical extracted data.

Uses pdfrw for AcroForm field injection.
Supports simple fields and repeaters (e.g., Classification table).
"""

from pathlib import Path
from typing import Dict, Any, List, Optional

import pdfrw
from pdfrw import (
    PdfReader,
    PdfWriter,
    PdfDict,
    PdfName,
    PdfObject,
    PdfString,
)

from ..template_loader import TemplateLoader, TemplateConfig
from .base_filler import BaseFiller, FillReport


class Acord126Filler(BaseFiller):
    """
    Filler for ACORD 126 General Liability Application forms.

    Inputs:
        - canonical_data: Dict from CanonicalOutput.to_dict() — extracted entities
        - output_path: Path to save filled PDF
        - template_id: Optional template family (e.g., "acord_126_2016")
        - template_version: Optional version (e.g., "v2016_09" or "latest")

    Outputs:
        - Filled PDF at output_path
        - FillReport with coverage, warnings, unmapped fields
    """

    form_type = "ACORD_126"

    def __init__(self):
        super().__init__()
        # Base dir for local templates (TemplateLoader also uses this)
        self.template_base_dir = Path(__file__).parent / "templates"

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def fill_from_canonical(
        self,
        canonical_data: Dict[str, Any],
        output_path: str,
        template_id: str = "acord_126_2016",
        template_version: str = "latest",
    ) -> FillReport:
        """
        Fill an ACORD PDF from canonical extracted data.
        """
        try:
            # ---- 1. Load template config (cloud → local) -------------------
            template: Optional[TemplateConfig] = TemplateLoader.load(
                template_id=template_id,
                version=template_version,
            )
            print("output")
            print(template)

            if not template:
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=[],
                    warnings=[f"No template found for {template_id} ({template_version})"],
                    errors=["Template loading failed"],
                )

            # ---- 2. Map canonical data to flat fields ----------------------
            # flat_fields MUST be keyed by canonical names
            flat_fields = self._canonical_to_template_fields(canonical_data, template)

            # ---- 3. Resolve PDF template path ------------------------------
            if not template.pdf_url:
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=list(template.field_map.keys()),
                    warnings=[f"Template config has no pdf_url for {template.template_id}"],
                    errors=["Missing pdf_url in template"],
                )

            template_pdf_path = Path(template.pdf_url)
            if not template_pdf_path.exists():
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=list(template.field_map.keys()),
                    warnings=[f"Template PDF missing: {template_pdf_path}"],
                    errors=["PDF template not found"],
                )

            pdf = PdfReader(str(template_pdf_path))
            acro_form = getattr(pdf.Root, "AcroForm", None)
            if not acro_form:
                return FillReport(
                    success=False,
                    coverage=0.0,
                    filled_fields=0,
                    unmapped_fields=list(flat_fields.keys()),
                    warnings=["PDF has no AcroForm — cannot fill fields"],
                    errors=["Non-fillable PDF template"],
                )

            filled_count = 0
            unmapped: List[str] = []
            warnings: List[str] = []

            # ---- 4. Fill simple fields (non-repeater) ----------------------
            for canonical_key, value in flat_fields.items():
                # Skip repeater keys here; they are handled separately
                if canonical_key in template.repeaters:
                    continue

                pdf_key = template.field_map.get(canonical_key)

                # Strict: only fill if the template explicitly knows about this field
                if not pdf_key:
                    warnings.append(
                        f"Canonical field has no mapping for this template: {canonical_key}"
                    )
                    continue

                ok = self._set_pdf_field(pdf, acro_form, pdf_key, value)
                if ok:
                    filled_count += 1
                else:
                    unmapped.append(pdf_key)
                    warnings.append(
                        f"PDF field not found: {pdf_key} (from canonical {canonical_key})"
                    )

            # ---- 5. Repeaters (Classification, etc.) -----------------------
            for repeater_key, repeater_config in template.repeaters.items():
                rows_data = flat_fields.get(repeater_key)

                if not rows_data:
                    warnings.append(f"No data for repeater: {repeater_key}")
                    continue

                if not isinstance(rows_data, list):
                    warnings.append(
                        f"Repeater {repeater_key} expected list of rows, got {type(rows_data)}"
                    )
                    continue

                row_ids: List[str] = repeater_config.get("row_ids", [])
                columns: Dict[str, str] = repeater_config.get("columns", {})

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

                        # pattern has {row_id} placeholder, e.g. "GeneralLiability_Hazard_ClassCode_{row_id}"
                        field_name = pattern.format(row_id=row_id)

                        ok = self._set_pdf_field(pdf, acro_form, field_name, value)
                        if ok:
                            filled_count += 1
                        else:
                            unmapped.append(field_name)
                            warnings.append(
                                f"PDF field not found for repeater {repeater_key}: {field_name}"
                            )

                if len(rows_data) > max_rows:
                    warnings.append(
                        f"Truncated {repeater_key} to {max_rows} rows (original: {len(rows_data)})"
                    )

            # ---- 6. Coverage calculation -----------------------------------
            simple_keys = [
                k for k in flat_fields.keys()
                if k not in template.repeaters
            ]
            total_expected_simple = len(simple_keys)

            total_expected_repeaters = 0
            for repeater_key, repeater_config in template.repeaters.items():
                rows = flat_fields.get(repeater_key, [])
                if isinstance(rows, list):
                    row_ids: List[str] = repeater_config.get("row_ids", [])
                    columns: Dict[str, str] = repeater_config.get("columns", {})
                    max_rows = min(len(rows), len(row_ids))
                    total_expected_repeaters += max_rows * len(columns)

            total_expected = total_expected_simple + total_expected_repeaters
            coverage = filled_count / total_expected if total_expected > 0 else 0.0

            # ---- 7. Ensure NeedAppearances is set on AcroForm -------------
            if acro_form is not None:
                acro_form.update(PdfDict(NeedAppearances=PdfObject("true")))
                pdf.Root.AcroForm = acro_form

            # ---- 8. Save filled PDF ----------------------------------------
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            writer = PdfWriter()
            writer.write(str(output_path), pdf)

            # ---- 9. Build and return FillReport ----------------------------
            return FillReport(
                success=True,
                coverage=coverage,
                filled_fields=filled_count,
                unmapped_fields=unmapped,
                warnings=warnings,
                errors=[],
            )

        except Exception as e:
            print("fill_from_canonical error:", str(e))
            return FillReport(
                success=False,
                coverage=0.0,
                filled_fields=0,
                unmapped_fields=[],
                warnings=[],
                errors=[str(e)],
            )

    # ------------------------------------------------------------------ #
    # Internal Helpers
    # ------------------------------------------------------------------ #
    def _set_pdf_field(
        self,
        pdf: pdfrw.PdfReader,
        acro_form: pdfrw.PdfDict,
        field_name: str,
        value: Any,
    ) -> bool:
        """
        Set a value in a PDF field.
        """
        # Normalize leading slash
        if field_name.startswith("/"):
            field_name = field_name[1:]

        field = self._find_field(acro_form, field_name)
        if not field:
            return False

        # ---- Type-specific handling -----------------------------------
        if isinstance(value, bool):
            # Checkbox / radio handling
            on_value = None
            ap = getattr(field, "AP", None)
            if ap:
                normal = ap.get("/N") or ap.get("N")
                if isinstance(normal, pdfrw.PdfDict):
                    keys = list(normal.keys())
                    if keys:
                        on_value = keys[0]

            if not on_value:
                on_value = PdfName("Yes")  # default ON state

            field.V = on_value if value else PdfName("Off")
            field.AS = field.V

        elif isinstance(value, (int, float)):
            field.V = str(value)
        else:
            field.V = str(value)

        field.update(PdfDict(NeedAppearances=PdfObject("true")))
        return True

    def _find_field(
        self,
        acro_form: pdfrw.PdfDict,
        field_name: str,
    ) -> Optional[pdfrw.PdfDict]:
        """
        Find field by name in AcroForm, recursing into Kids.
        """

        def recurse_fields(fields: List[pdfrw.PdfDict]) -> Optional[pdfrw.PdfDict]:
            for field in fields:
                if self._field_name_equals(field, field_name):
                    return field

                kids = getattr(field, "Kids", None)
                if kids:
                    found = recurse_fields(kids)
                    if found:
                        return found
            return None

        fields = getattr(acro_form, "Fields", None)
        if fields:
            return recurse_fields(fields)
        return None

    def _field_name_equals(self, field: pdfrw.PdfDict, target: str) -> bool:
        """
        Normalize and compare field.T with target text.
        """
        if not hasattr(field, "T") or field.T is None:
            return False

        target = target.strip().lstrip("/")

        raw = field.T
        if isinstance(raw, PdfString):
            name = raw.to_unicode()
        else:
            name = str(raw)

        name = name.strip().strip("()").lstrip("/")
        return name == target

    def __repr__(self) -> str:
        return f"Acord126Filler(template_base_dir={self.template_base_dir})"
