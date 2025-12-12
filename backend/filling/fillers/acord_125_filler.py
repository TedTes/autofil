"""
ACORD 125 PDF Filler
--------------------

Extends the ACORD 126 filler with a few ACORD 125–specific helpers (address
flattening, entity flags). Shares the same canonical → PDF mapping pipeline.
"""

from typing import Any, Dict, Optional, List

from extraction.utils.semantic_section_builder import SemanticSectionBuilder

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

        sections = (
            canonical.get("semantic_sections")
            or canonical.get("semanticSections")
            or []
        )
        entities = SemanticSectionBuilder.flatten(sections)

        def first_value(field_id: str) -> Any:
            values = entities.get(field_id) or []
            if not values:
                return None
            return values[0].get("value")

        field_map = template.field_map if template else {}

        mailing = first_value("MailingAddress")
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

            if line_one and "MailingAddressLineOne" in field_map:
                flat.setdefault("MailingAddressLineOne", line_one)
            if line_two and "MailingAddressLineTwo" in field_map:
                flat.setdefault("MailingAddressLineTwo", line_two)
            if city and "MailingAddressCity" in field_map:
                flat.setdefault("MailingAddressCity", city)
            if state and "MailingAddressState" in field_map:
                flat.setdefault("MailingAddressState", state)
            if postal and "MailingAddressPostalCode" in field_map:
                flat.setdefault("MailingAddressPostalCode", postal)

        legal_entity = first_value("LegalEntity") or first_value("LegalStructure")
        if legal_entity and isinstance(legal_entity, str):
            normalized = legal_entity.strip().lower()

            def set_entity_flag(key: str, keywords: List[str]) -> None:
                if key not in field_map:
                    return
                if any(word in normalized for word in keywords):
                    flat.setdefault(key, True)

            set_entity_flag("LegalEntityCorporation", ["corp", "corporation", "inc"])
            set_entity_flag("LegalEntityLLC", ["llc", "limited liability"])
            set_entity_flag("LegalEntityPartnership", ["partnership", "llp", "lp"])

        return flat
