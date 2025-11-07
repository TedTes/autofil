from typing import Dict, List

# The primary source is still MFC.required_for().
QUICK_REQUIRED: Dict[str, List[str]] = {
    "ACORD_126": [],
    "ACORD_125": ["InsuredName", "Location"],
}
# "InsuredName", "EffectiveDate", "Classification"