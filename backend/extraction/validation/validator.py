from __future__ import annotations

from typing import List

from ..core.schema import CanonicalOutput
from ..extractors.mfc import MFC
from ..utils.semantic_section_builder import SemanticSectionBuilder


class ExtractionValidationError(Exception):
    """Only for hard, structural problems (bad output, wrong form, etc.)."""
    pass


def validate(output: CanonicalOutput) -> CanonicalOutput:
    """
    Validate and annotate the output.

    - Fatal issues  -> raise ExtractionValidationError
    - Soft issues   -> appended as warnings on the output (or metadata / _validation_warnings)
    """
    errors: List[str] = []
    warnings: List[str] = []

    # ---------- 1. Structural sanity checks (hard fail) ----------
    if output is None:
        raise ExtractionValidationError("Extractor returned None")

    sections = getattr(output, "semantic_sections", None)
    if sections is None:
        raise ExtractionValidationError("output.semantic_sections must be provided")

    if not hasattr(output, "metadata"):
        raise ExtractionValidationError("output.metadata is missing")

    form = getattr(output.metadata, "form_type_detected", None)
    if not form:
        errors.append("metadata.form_type_detected is missing")

    # ---------- 2. Required fields (soft: warnings, not errors) ----------
    # If form known, check against MFC.required_for(form)
    entity_map = SemanticSectionBuilder.flatten(sections)

    if form:
        try:
            required: List[str] = MFC.required_for(form)
        except Exception:
            required = []

        missing: List[str] = []

        for fid in required:
            values = entity_map.get(fid, [])

            if fid == "Classification":
                # At least one row with some real data
                has_data = any(
                    isinstance((v or {}).get("value"), dict)
                    and any(
                        val not in ("", None, 0, 0.0)
                        for val in ((v or {}).get("value") or {}).values()
                    )
                    for v in values
                    if isinstance(v, dict)
                )
                if not has_data:
                    missing.append(fid)
            else:
                if not values:
                    missing.append(fid)

        if missing:
            warnings.append(
                f"Missing recommended fields for {form}: {missing}"
            )

    # ---------- 3. Low-confidence values (always warnings) ----------
    for fid, vals in entity_map.items():
        low = [
            v for v in vals
            if isinstance(v, dict) and float(v.get("confidence", 1.0)) < 0.70
        ]
        if low:
            warnings.append(
                f"Low confidence (<0.70) in '{fid}': {len(low)} value(s)"
            )

    # ---------- 4. Truly fatal conditions ----------
    # No entities at all → nothing to work with.
    if not entity_map:
        errors.append("No entities extracted")

    if errors:
        raise ExtractionValidationError("; ".join(errors))

    # ---------- 5. Attach warnings onto the output ----------
    if warnings:
        raw = output.raw or {}
        existing = raw.get("validation_warnings", [])
        if not isinstance(existing, list):
            existing = []
        raw["validation_warnings"] = [*existing, *warnings]
        output.raw = raw

    return output
