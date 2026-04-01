"""
ACORD 28 Evidence of Commercial Property Insurance filler.

Built on the property-section filler so it can reuse the current commercial
property canonical mapping while we phase in the final template-specific fields.
"""

from typing import Any, Dict, Optional

from filling.canonical_projection import CanonicalFillView

from .acord_140_filler import Acord140Filler


class Acord28Filler(Acord140Filler):
    """Filler for ACORD 28 commercial property evidence templates."""

    form_type = "ACORD_28"
    supported_templates = ["acord_28"]

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
        location_number = view.first_value("LocationNumber")
        property_address = view.first_value("LocationAddressLine1") or view.first_value("MailingAddress")

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
        if location_number:
            flat["LocationNumber"] = location_number
        if property_address:
            flat["PropertyAddress"] = property_address

        return flat
