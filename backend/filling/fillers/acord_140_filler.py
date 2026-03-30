"""
ACORD 140 PDF Filler
--------------------

Property Section filler built on the ACORD 126 pipeline.
Adds blanket summary repeater handling and light normalization.
"""

from typing import Any, Dict, List, Optional

from filling.canonical_projection import CanonicalFillView

from .acord_126_filler import Acord126Filler


class Acord140Filler(Acord126Filler):
    """Filler for ACORD 140 Property Section templates."""

    form_type = "ACORD_140"
    supported_templates = ["acord_140"]

    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Extend base flattening with Property-specific tweaks:
          • Normalize blanket summary rows to the template's repeater key
        """
        flat = super()._canonical_to_template_fields(canonical, template)

        view = CanonicalFillView.from_canonical(canonical)

        blanket_rows = view.repeated_rows("BlanketSummary", "BlanketCoverage", "Blankets")
        if blanket_rows:
            flat["BlanketSummary"] = blanket_rows

        return flat
