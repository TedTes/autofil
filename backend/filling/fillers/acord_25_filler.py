"""
ACORD 25 Certificate of Liability Insurance filler.

This filler treats the certificate as its own output shape instead of relying
on older placeholder assumptions. It starts from canonical submission data and
projects the top-level certificate metadata, insured/producer/holder details,
and primary liability policy values into the template field map.
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

        def set_if_mapped(target_key: str, value: Any) -> None:
            if value in ("", None):
                return
            if template and not template.has_pdf_field(target_key):
                return
            flat.setdefault(target_key, value)

        def split_address(prefix: str, value: Any) -> None:
            if not value:
                return
            if isinstance(value, dict):
                set_if_mapped(
                    f"{prefix}Line1",
                    value.get("street")
                    or value.get("line1")
                    or value.get("address")
                    or value.get("street1"),
                )
                set_if_mapped(
                    f"{prefix}Line2",
                    value.get("line_two")
                    or value.get("line2")
                    or value.get("street2")
                    or value.get("suite")
                    or value.get("unit"),
                )
                set_if_mapped(f"{prefix}City", value.get("city"))
                set_if_mapped(f"{prefix}State", value.get("state") or value.get("state_code"))
                set_if_mapped(f"{prefix}PostalCode", value.get("zip") or value.get("postal_code"))
            else:
                set_if_mapped(f"{prefix}Line1", value)

        insured_name = view.first_value("InsuredName") or view.first_value("ApplicantName")
        carrier = view.first_value("Carrier")
        carrier_naic = view.first_value("CarrierNAIC")
        policy_number = view.first_value("PolicyNumber")
        effective_date = view.first_value("EffectiveDate")
        expiration_date = view.first_value("ExpirationDate")
        line_of_business = view.first_value("LineOfBusiness")
        certificate_holder_name = view.first_value("CertificateHolderName")
        certificate_number = view.first_value("CertificateNumber")
        revision_number = view.first_value("RevisionNumber")
        form_edition = view.first_value("FormEdition")
        form_completion_date = view.first_value("FormCompletionDate")

        set_if_mapped("FormEdition", form_edition)
        set_if_mapped("FormCompletionDate", form_completion_date)
        set_if_mapped("CertificateNumber", certificate_number)
        set_if_mapped("RevisionNumber", revision_number)

        set_if_mapped("InsuredName", insured_name)
        split_address("MailingAddress", view.first_value("MailingAddress"))

        set_if_mapped("ProducerName", view.first_value("ProducerName"))
        split_address("ProducerAddress", view.first_value("ProducerAddress"))
        set_if_mapped("ProducerContactName", view.first_value("ProducerContactName"))
        set_if_mapped("ProducerPhone", view.first_value("ProducerPhone"))
        set_if_mapped("ProducerFax", view.first_value("ProducerFax"))
        set_if_mapped("ProducerEmail", view.first_value("ProducerEmail"))

        set_if_mapped("Carrier", carrier)
        set_if_mapped("CarrierNAIC", carrier_naic)

        additional_carriers = view.repeated_rows("AdditionalCarriers")
        carrier_slot_letters = ["B", "C", "D", "E", "F"]
        for slot_letter, carrier_row in zip(carrier_slot_letters, additional_carriers):
            if not isinstance(carrier_row, dict):
                continue
            name = carrier_row.get("name") or carrier_row.get("carrier") or carrier_row.get("full_name")
            naic = carrier_row.get("naic") or carrier_row.get("naic_code")
            set_if_mapped(f"Carrier{slot_letter}", name)
            set_if_mapped(f"Carrier{slot_letter}NAIC", naic)

        # Certificate defaults to the primary GL policy details when present.
        set_if_mapped("GLPolicyNumber", view.first_value("GLPolicyNumber") or policy_number)
        set_if_mapped("GLEffectiveDate", view.first_value("GLEffectiveDate") or effective_date)
        set_if_mapped("GLExpirationDate", view.first_value("GLExpirationDate") or expiration_date)

        set_if_mapped("PolicyNumber", policy_number)
        set_if_mapped("EffectiveDate", effective_date)
        set_if_mapped("ExpirationDate", expiration_date)

        set_if_mapped("CertificateHolderName", certificate_holder_name or insured_name)
        split_address("CertificateHolderAddress", view.first_value("CertificateHolderAddress"))

        set_if_mapped(
            "DescriptionOfOperations",
            view.first_value("DescriptionOfOperations") or line_of_business,
        )
        set_if_mapped(
            "AuthorizedRepresentativeSignature",
            view.first_value("AuthorizedRepresentativeSignature"),
        )

        # Primary general liability limits/flags remain the most important v1
        # certificate payload, so project them directly when canonical data exists.
        for key in (
            "CoverageClaimsMadeIndicator",
            "CoverageOccurrenceIndicator",
            "CoverageOtherIndicator",
            "CoverageOtherDescription",
            "EachOccurrenceLimit",
            "FireDamageLimit",
            "MedicalExpenseLimit",
            "PersonalAdvertisingInjuryLimit",
            "GeneralAggregateLimit",
            "ProductsCompletedOpsLimit",
            "OtherCoverageLimitDescription",
            "OtherCoverageLimitAmount",
        ):
            set_if_mapped(key, view.first_value(key) or flat.get(key))

        return flat
