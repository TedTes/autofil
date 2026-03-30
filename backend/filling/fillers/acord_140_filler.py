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

        def set_if_mapped(target_key: str, value: Any) -> None:
            if value in ("", None):
                return
            if template and not template.has_pdf_field(target_key):
                return
            flat.setdefault(target_key, value)

        blanket_rows = view.repeated_rows("BlanketSummary", "BlanketCoverage", "Blankets")
        if blanket_rows:
            flat["BlanketSummary"] = blanket_rows

        location_rows = view.repeated_rows("Location", "locations")
        first_location = location_rows[0] if location_rows else {}
        if isinstance(first_location, dict):
            set_if_mapped(
                "LocationNumber",
                first_location.get("location_number")
                or first_location.get("location")
                or first_location.get("location_id"),
            )
            set_if_mapped(
                "LocationAddressLine1",
                first_location.get("address")
                or first_location.get("street")
                or first_location.get("line1")
                or first_location.get("address_line_1"),
            )
            set_if_mapped(
                "BuiltYear",
                first_location.get("year_built")
                or first_location.get("built_year"),
            )
            set_if_mapped(
                "BuildingArea",
                first_location.get("building_area")
                or first_location.get("square_feet")
                or first_location.get("sq_ft"),
            )
            set_if_mapped(
                "BuildingValue",
                first_location.get("building_value"),
            )
            set_if_mapped(
                "ContentsLimit",
                first_location.get("contents_value")
                or first_location.get("contents_limit"),
            )
            set_if_mapped(
                "BusinessIncomeLimit",
                first_location.get("business_income")
                or first_location.get("business_income_limit"),
            )
            set_if_mapped(
                "ConstructionType",
                first_location.get("construction")
                or first_location.get("construction_type"),
            )
            set_if_mapped(
                "NumberOfStories",
                first_location.get("stories")
                or first_location.get("number_of_stories"),
            )
            set_if_mapped(
                "SprinklerIndicator",
                first_location.get("sprinkler")
                or first_location.get("sprinkler_indicator"),
            )
            set_if_mapped(
                "FireAlarmIndicator",
                first_location.get("fire_alarm")
                or first_location.get("fire_alarm_indicator"),
            )
            set_if_mapped(
                "BurglarAlarmIndicator",
                first_location.get("burglar_alarm")
                or first_location.get("burglar_alarm_indicator"),
            )

        return flat
