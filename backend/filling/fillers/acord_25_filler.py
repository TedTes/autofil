"""
ACORD 25 Certificate of Liability Insurance filler.

This starts with the shared canonical -> template pipeline and adds a small
amount of certificate-specific normalization. The final field-level mapping
still depends on the real template asset/config stored in template storage.
"""

from typing import Any, Dict, Optional

from filling.canonical_projection import CanonicalFillView

from .acord_126_filler import Acord126Filler


class Acord25Filler(Acord126Filler):
    """Filler for ACORD 25 certificate templates."""

    form_type = "ACORD_25"
    supported_templates = ["acord_25"]

    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Optional[Any] = None,
    ) -> Dict[str, Any]:
        flat = super()._canonical_to_template_fields(canonical, template)
        view = CanonicalFillView.from_canonical(canonical)

        insured_name = view.first_value("InsuredName") or view.first_value("ApplicantName")
        carrier = view.first_value("Carrier")
        policy_number = view.first_value("PolicyNumber")
        effective_date = view.first_value("EffectiveDate")
        expiration_date = view.first_value("ExpirationDate")
        line_of_business = view.first_value("LineOfBusiness")

        if insured_name:
            flat["InsuredName"] = insured_name
            flat.setdefault("CertificateHolderName", insured_name)
        if carrier:
            flat["Carrier"] = carrier
        if policy_number:
            flat["PolicyNumber"] = policy_number
        if effective_date:
            flat["EffectiveDate"] = effective_date
        if expiration_date:
            flat["ExpirationDate"] = expiration_date
        if line_of_business:
            flat["DescriptionOfOperations"] = line_of_business

        return flat
