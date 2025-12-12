"""
ACORD 130 PDF Filler
--------------------

Workers Compensation Application filler built on the ACORD 126 pipeline.
Adds Workers Comp–specific repeater handling and small value normalizations.
"""

from typing import Any, Dict, List, Optional

from extraction.utils.semantic_section_builder import SemanticSectionBuilder

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

        sections = canonical.get("semantic_sections") or canonical.get("semanticSections") or []
        entities = SemanticSectionBuilder.flatten(sections)

        def collect_rows(field_ids: List[str]) -> List[Dict[str, Any]]:
            rows: List[Dict[str, Any]] = []
            for field_id in field_ids:
                values = entities.get(field_id) or []
                for ev in values:
                    value = ev.get("value")
                    if isinstance(value, list):
                        for item in value:
                            if isinstance(item, dict) and any(v not in ("", None) for v in item.values()):
                                rows.append(item)
                    elif isinstance(value, dict) and any(v not in ("", None) for v in value.values()):
                        rows.append(value)
            return rows

        # Map Classification rows to the template's expected repeater key
        classification_rows = collect_rows(["Classifications", "Classification"])
        if classification_rows:
            flat["Classifications"] = classification_rows

        # Join multi-state coverage lists
        coverage_states = flat.get("CoverageStates")
        if isinstance(coverage_states, list):
            flat["CoverageStates"] = ", ".join(
                [str(v) for v in coverage_states if v not in ("", None)]
            )

        return flat
