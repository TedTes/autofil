"""
ACORD 101 Additional Remarks Schedule filler.

This starts with the same shared PDF/template pipeline as the other ACORD
fillers, but its main job is to map generated remarks/overflow text into the
template once the field map is finalized.
"""

from typing import Any, Dict, List, Optional

from filling.canonical_projection import CanonicalFillView
from .acord_126_filler import Acord126Filler


class Acord101Filler(Acord126Filler):
    """Filler for ACORD 101 Additional Remarks Schedule templates."""

    form_type = "ACORD_101"
    supported_templates = ["acord_101"]

    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        ACORD 101 is used as an overflow/supporting schedule. We synthesize a
        concise narrative from the merged canonical view so the schedule is
        useful even before form-specific overflow rules are fully modeled.
        """
        flat = super()._canonical_to_template_fields(canonical, template)
        view = CanonicalFillView.from_canonical(canonical)

        insured_name = (
            view.first_value("ApplicantName")
            or view.first_value("InsuredName")
            or flat.get("InsuredName")
        )
        policy_number = view.first_value("PolicyNumber") or flat.get("PolicyNumber")
        effective_date = view.first_value("EffectiveDate") or flat.get("EffectiveDate")

        remarks = self._build_additional_remarks(canonical, view)

        if insured_name:
            flat["ApplicantName"] = insured_name
        if policy_number:
            flat["PolicyNumber"] = policy_number
        if effective_date:
            flat["EffectiveDate"] = effective_date
        if remarks:
            flat["AdditionalRemarks"] = remarks

        return flat

    def _build_additional_remarks(
        self,
        canonical: Dict[str, Any],
        view: CanonicalFillView,
    ) -> str:
        lines: List[str] = []

        def add_line(label: str, value: Any) -> None:
            if value in (None, "", [], {}):
                return
            lines.append(f"{label}: {value}")

        add_line("Insured", view.first_value("InsuredName") or view.first_value("ApplicantName"))
        add_line("Legal Entity", view.first_value("LegalEntity") or view.first_value("LegalStructure"))
        add_line("Business Description", view.first_value("BusinessDescription"))
        add_line("Line of Business", view.first_value("LineOfBusiness"))
        add_line("Carrier", view.first_value("Carrier"))
        add_line("Policy Number", view.first_value("PolicyNumber"))
        add_line("Effective Date", view.first_value("EffectiveDate"))
        add_line("Number of Employees", view.first_value("NumberOfEmployees"))
        add_line("Gross Sales", view.first_value("GrossSales"))

        location_rows = view.repeated_rows("Location")
        classification_rows = view.repeated_rows("Classification", "Classifications")
        prior_losses = view.repeated_rows("PriorLosses")

        if location_rows:
            lines.append(f"Locations Included: {len(location_rows)}")
        if classification_rows:
            lines.append(f"Classifications Included: {len(classification_rows)}")
        if prior_losses:
            lines.append(f"Prior Loss Records Included: {len(prior_losses)}")

        warnings = canonical.get("validation_warnings") or canonical.get("warnings") or []
        if isinstance(warnings, list) and warnings:
            warning_text = "; ".join(str(item) for item in warnings[:3] if item)
            if warning_text:
                lines.append(f"Review Notes: {warning_text}")

        return "\n".join(lines[:10]).strip()
