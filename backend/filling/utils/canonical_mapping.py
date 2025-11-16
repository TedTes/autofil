"""
canonical_mapping.py
--------------------

Utility: Convert canonical extracted data (CanonicalOutput.to_dict())
→ into flat fields required by PDF fillers.

This function bridges:
  - Canonical schema (semantic)
  - TemplateConfig (pdf field map + repeaters)
"""

from typing import Dict, Any, List, Union
from dataclasses import asdict

def canonical_to_template_fields(
    canonical_data: Dict[str, Any],
    template
) -> Dict[str, Any]:
    """
    Convert canonical extracted data to flat fields that match the template config.

    Args:
        canonical_data: dict from CanonicalOutput.to_dict()
        template: TemplateConfig object (field_map + repeaters)

    Returns:
        flat_fields: dict of canonical_key -> scalar value OR list (for repeaters)
    """

    flat_fields: Dict[str, Any] = {}

    # ----------------------------------------------------------------------
    # 1. Flatten simple canonical fields
    # ----------------------------------------------------------------------
    # canonical_data["entities"] is usually a dict:
    #   { "InsuredName": [EntityValue, EntityValue], ... }
    entities = canonical_data.get("entities", {})

    for canonical_key, values in entities.items():

        # ----- Handle repeaters later -----
        if canonical_key in template.repeaters:
            continue

        # Values may be:
        # - list of EntityValue
        # - list of dicts
        # - raw strings / numbers
        cleaned = _extract_scalar_value(values)
        if cleaned is not None:
            flat_fields[canonical_key] = cleaned

    # ----------------------------------------------------------------------
    # 2. Flatten repeater fields (tables like Classification)
    # ----------------------------------------------------------------------
    for repeater_key, repeater_cfg in template.repeaters.items():

        raw_rows = entities.get(repeater_key, [])
        if not raw_rows:
            flat_fields[repeater_key] = []
            continue

        rows_list: List[Dict[str, Any]] = []

        # Each row is an EntityValue with `.value` as dict
        for item in raw_rows:
            if isinstance(item, dict):
                rows_list.append(item)
            elif hasattr(item, "value"):
                if isinstance(item.value, dict):
                    rows_list.append(item.value)
            else:
                # Unsupported row format → skip
                continue

        # optional cleanup (strip None/empty)
        cleaned_rows = []
        for row in rows_list:
            cleaned_row = {
                k: v for k, v in row.items()
                if v not in (None, "", [], {}, "N/A")
            }
            cleaned_rows.append(cleaned_row)

        flat_fields[repeater_key] = cleaned_rows

    return flat_fields


# =====================================================================
# Internal helper
# =====================================================================

def _extract_scalar_value(values: Any) -> Union[str, float, int, None]:
    """
    From an entity list (multiple EntityValue objects),
    choose one scalar value to put into the PDF.

    Strategy:
    - If list: choose highest-confidence EntityValue
    - If raw list: choose first non-empty
    - If scalar: return as-is
    """
    if values is None:
        return None

    # ----- Case 1: single scalar -----
    if not isinstance(values, list):
        return values

    if len(values) == 0:
        return None

    # ----- Case 2: list of EntityValue objects -----
    # EntityValue usually: { "value": something, "confidence": float, ... }
    try:
        # pick highest confidence
        best = max(values, key=lambda v: getattr(v, "confidence", 0))
        val = getattr(best, "value", None)
        return val
    except Exception:
        pass

    # ----- Case 3: list of raw values -----
    for v in values:
        if v not in (None, "", "N/A", {}, []):
            return v

    return None
