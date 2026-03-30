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

        return flat
