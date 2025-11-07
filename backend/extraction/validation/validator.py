from __future__ import annotations

from typing import List

from ..core.schema import CanonicalOutput
from ..extractors.mfc import MFC
from ..validation.rules import QUICK_REQUIRED


class ExtractionValidationError(Exception):
    pass


def validate(output: CanonicalOutput) -> List[str]:
    """Return empty list on success, otherwise a list of human-readable errors."""
    errors: List[str] = []

    # 1. Form type must be known
    form = output.metadata.form_type_detected
    if not form:
        errors.append("metadata.form_type_detected is missing")
        raise ExtractionValidationError("; ".join(errors))

    # 2. Required canonical fields (from MFC)
    required = MFC.required_for(form)
    missing = [f for f in required if f not in output.entities or not output.entities[f]]
    if missing:
        errors.append(f"Missing required fields for {form}: {missing}")

    # 3. Low-confidence warnings (optional)
    for fid, vals in output.entities.items():
        low = [v for v in vals if v.confidence < 0.70]
        if low:
            errors.append(f"Low confidence (<0.70) in '{fid}': {len(low)} value(s)")

    if errors:
        raise ExtractionValidationError("; ".join(errors))

    return errors