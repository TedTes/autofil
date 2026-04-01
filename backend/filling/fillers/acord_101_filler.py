"""
ACORD 101 Additional Remarks Schedule filler.

This starts with the same shared PDF/template pipeline as the other ACORD
fillers, but its main job is to map generated remarks/overflow text into the
template once the field map is finalized.
"""

from typing import Any, Dict, Optional

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
        ACORD 101 is used as an overflow/supporting schedule, so for now we
        reuse the base canonical flattening pipeline. Specific remark-building
        rules will be added once the field-level template mapping is finalized.
        """
        return super()._canonical_to_template_fields(canonical, template)
