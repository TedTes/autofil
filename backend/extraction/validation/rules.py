from typing import Dict, List

# The primary source is still MFC.required_for().
QUICK_REQUIRED: Dict[str, List[str]] = {
    "ACORD_25": ["InsuredName", "CertificateHolderName"],
    "ACORD_126": [],
    "ACORD_125": ["InsuredName", "Location"],
}
# "InsuredName", "EffectiveDate", "Classification"
