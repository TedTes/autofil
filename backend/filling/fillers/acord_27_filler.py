"""
ACORD 27 Evidence of Property Insurance filler.

This follows the same canonical -> template pipeline as the other ACORD forms
and normalizes a small set of property-evidence fields from merged submission
data. Final field mapping still depends on the actual template asset/config.
"""

from typing import Any, Dict, Optional

from filling.canonical_projection import CanonicalFillView

from .acord_140_filler import Acord140Filler


class Acord27Filler(Acord140Filler):
    """Filler for ACORD 27 evidence of property insurance templates."""

    form_type = "ACORD_27"
    supported_templates = ["acord_27"]

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
        address = view.first_value("LocationAddressLine1") or view.first_value("MailingAddress")

        if insured_name:
            flat["InsuredName"] = insured_name
        if carrier:
            flat["Carrier"] = carrier
        if policy_number:
            flat["PolicyNumber"] = policy_number
        if effective_date:
            flat["EffectiveDate"] = effective_date
        if expiration_date:
            flat["ExpirationDate"] = expiration_date
        if address:
            flat["PropertyAddress"] = address

        return flat
