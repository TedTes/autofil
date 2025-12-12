"""
ACORD 140 PDF Filler
--------------------

Property Section filler built on the ACORD 126 pipeline.
Adds blanket summary repeater handling and light normalization.
"""

from typing import Any, Dict, List, Optional

from extraction.utils.semantic_section_builder import SemanticSectionBuilder

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

        blanket_rows = collect_rows(["BlanketSummary", "BlanketCoverage", "Blankets"])
        if blanket_rows:
            flat["BlanketSummary"] = blanket_rows

        return flat
