"""
ACORD 130 PDF Filler
--------------------

Workers Compensation Application filler built on the ACORD 126 pipeline.
Adds Workers Comp–specific repeater handling and small value normalizations.
"""

from typing import Any, Dict, List, Optional

from filling.canonical_projection import CanonicalFillView

from .acord_126_filler import Acord126Filler


class Acord130Filler(Acord126Filler):
    """Filler for ACORD 130 Workers Compensation templates."""

    form_type = "ACORD_130"
    supported_templates = ["acord_130"]

    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Extend the base flattening with Workers Comp tweaks:
          • Normalize classification rows under the template's repeater key
          • Join state lists for CoverageStates
        """
        flat = super()._canonical_to_template_fields(canonical, template)

        view = CanonicalFillView.from_canonical(canonical)

        def set_if_mapped(target_key: str, value: Any) -> None:
            if value in ("", None):
                return
            if template and not template.has_pdf_field(target_key):
                return
            flat.setdefault(target_key, value)

        mailing = view.first_value("MailingAddress")
        if isinstance(mailing, dict):
            set_if_mapped(
                "EmployerAddressLine1",
                mailing.get("street") or mailing.get("line1") or mailing.get("address") or mailing.get("street1"),
            )
            set_if_mapped(
                "EmployerAddressLine2",
                mailing.get("line2") or mailing.get("street2") or mailing.get("suite") or mailing.get("unit"),
            )
            set_if_mapped("EmployerCity", mailing.get("city"))
            set_if_mapped("EmployerState", mailing.get("state") or mailing.get("state_code"))
            set_if_mapped("EmployerPostalCode", mailing.get("zip") or mailing.get("postal_code"))

        set_if_mapped(
            "EmployerName",
            flat.get("EmployerName")
            or view.first_value("InsuredName")
            or view.first_value("EmployerName"),
        )
        set_if_mapped(
            "FederalID",
            flat.get("FederalID")
            or view.first_value("TaxIdentifier")
            or view.first_value("FEIN")
            or view.first_value("FederalEmployerId"),
        )
        set_if_mapped(
            "StateID",
            flat.get("StateID")
            or view.first_value("StateEmployerIdentifier")
            or view.first_value("StateId"),
        )
        set_if_mapped(
            "TotalEstimatedPayroll",
            flat.get("TotalEstimatedPayroll")
            or view.first_value("AnnualPayroll")
            or view.first_value("EstimatedAnnualPayroll"),
        )

        # Map Classification rows to the template's expected repeater key
        classification_rows = view.repeated_rows("Classifications", "Classification")
        if classification_rows:
            flat["Classifications"] = classification_rows

        # Join multi-state coverage lists
        coverage_states = flat.get("CoverageStates")
        if isinstance(coverage_states, list):
            flat["CoverageStates"] = ", ".join(
                [str(v) for v in coverage_states if v not in ("", None)]
            )
        elif not coverage_states:
            coverage_list = view.first_value("CoverageStates") or view.first_value("States")
            if isinstance(coverage_list, list):
                set_if_mapped(
                    "CoverageStates",
                    ", ".join([str(v) for v in coverage_list if v not in ("", None)]),
                )

        return flat
