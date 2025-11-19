from typing import Dict, Any, Optional


class TemplateRecognizer:
    def __init__(self, templates_dir: str):
        self.templates_dir = templates_dir  # unused for now, kept for future

    def recognize(self, raw_fields: Dict[str, Any], raw_text: str) -> Optional[str]:
        field_names = set(raw_fields.keys())

        # Example: this combo strongly suggests ACORD 126 2016
        signature_2016 = {
            "Form_EditionIdentifier_A",
            "GeneralLiability_GeneralAggregate_LimitAmount_A",
            "GeneralLiability_Hazard_ClassCode_A",
            "ProductAndCompletedOperations_ProductName_A"
        }

        if signature_2016.issubset(field_names):
            return "acord_126_2016"

        # Fallback: unknown template
        return None
