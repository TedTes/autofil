"""
ACORD 125 PDF Filler
--------------------

Extends the ACORD 126 filler with a few ACORD 125–specific helpers (address
flattening, entity flags). Shares the same canonical → PDF mapping pipeline.
"""

from typing import Any, Dict, Optional, List

from filling.canonical_projection import CanonicalFillView

from .acord_126_filler import Acord126Filler


class Acord125Filler(Acord126Filler):
    """Filler for ACORD 125 templates."""

    form_type = "ACORD_125"
    supported_templates = ["acord_125"]

    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Extend the base flattening logic with ACORD 125 specific tweaks:
          • Break MailingAddress objects into individual line/city/state fields
          • Derive legal-entity checkboxes from a single LegalEntity value
        """
        flat = super()._canonical_to_template_fields(canonical, template)

        view = CanonicalFillView.from_canonical(canonical)

        mailing = view.first_value("MailingAddress")
        if mailing:
            line_one = None
            line_two = None
            city = None
            state = None
            postal = None

            if isinstance(mailing, dict):
                line_one = (
                    mailing.get("street")
                    or mailing.get("line1")
                    or mailing.get("address")
                    or mailing.get("street1")
                )
                line_two = (
                    mailing.get("line2")
                    or mailing.get("street2")
                    or mailing.get("suite")
                    or mailing.get("unit")
                )
                city = mailing.get("city")
                state = mailing.get("state") or mailing.get("state_code")
                postal = mailing.get("zip") or mailing.get("postal_code")
            else:
                line_one = mailing

            if line_one and template and template.has_pdf_field("MailingAddressLineOne"):
                flat.setdefault("MailingAddressLineOne", line_one)
            if line_two and template and template.has_pdf_field("MailingAddressLineTwo"):
                flat.setdefault("MailingAddressLineTwo", line_two)
            if city and template and template.has_pdf_field("MailingAddressCity"):
                flat.setdefault("MailingAddressCity", city)
            if state and template and template.has_pdf_field("MailingAddressState"):
                flat.setdefault("MailingAddressState", state)
            if postal and template and template.has_pdf_field("MailingAddressPostalCode"):
                flat.setdefault("MailingAddressPostalCode", postal)

        legal_entity = view.first_value("LegalEntity") or view.first_value("LegalStructure")
        if legal_entity and isinstance(legal_entity, str):
            normalized = legal_entity.strip().lower()

            def set_entity_flag(key: str, keywords: List[str]) -> None:
                if not template or not template.has_pdf_field(key):
                    return
                if any(word in normalized for word in keywords):
                    flat.setdefault(key, True)

            set_entity_flag("LegalEntityCorporation", ["corp", "corporation", "inc"])
            set_entity_flag("LegalEntityLLC", ["llc", "limited liability"])
            set_entity_flag("LegalEntityPartnership", ["partnership", "llp", "lp"])

        return flat
