"""
ACORD 140 extractor for Property Section forms.

Extracts property insurance specific information.
"""

from typing import Dict, Any, Iterable, List, Optional
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..core.schema import Metadata
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser
from ..utils.canonical_output_builder import (
    SectionPayload,
    build_generic_canonical_output,
)
from utils.versioned_template_loader import (
    VersionedTemplateLoader,
    TemplateRecognizer,
    TemplateConfig,
)


class ACORD140Extractor(IExtractor):
    """
    Extractor for ACORD 140 Property Section forms.
    
    Extracts:
    - Property location details
    - Building information
    - Coverage limits
    - Construction details
    """
    
    FIELD_MAPPINGS = {
        "InsuredName": ["Named Insured"],
        "LocationNumber": ["Location Number", "Loc #"],
        "LocationAddressLine1": ["Location Address", "Address"],
        "BuiltYear": ["Year Built"],
        "BuildingArea": ["Square Footage", "Area"],
        "BuildingValue": ["Building Limit", "Building Value"],
        "ContentsLimit": ["Contents Limit", "Personal Property"],
        "BusinessIncomeLimit": ["Business Income", "BI Limit"],
        "ConstructionType": ["Construction Type", "Construction"],
        "NumberOfStories": ["Number of Stories", "Stories"],
        "SprinklerIndicator": ["Sprinkler", "Automatic Sprinkler"],
        "FireAlarmIndicator": ["Fire Alarm", "Alarm"],
        "BurglarAlarmIndicator": ["Burglar Alarm"],
    }
    
    def __init__(self):
        """Initialize ACORD 140 extractor."""
        self.pdf_parser = PdfFieldParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(
            base_dir=self.template_loader.base_dir
        )
    
    def extract(self, document: Document) -> ExtractionResult:
        """Extract ACORD 140 data."""
        try:
            if document.document_type != DocumentType.ACORD_140:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected ACORD_140, got {document.document_type.value}"]
                )
            
            template_config: Optional[TemplateConfig] = None
            raw_fields = {}
            # Extract from fillable fields
            locations = self._extract_locations_from_tables(document)
            if self.pdf_parser.is_fillable(document.file_path):
                raw_fields = self.pdf_parser.extract_fields(document.file_path)
                if raw_fields:
                    template_config = self._resolve_template_config(
                        document,
                        raw_fields.keys(),
                    )
                result = self._extract_from_fillable(
                    document, raw_fields, template_config, locations
                )
                if result.success:
                    return result

            if locations:
                canonical = build_generic_canonical_output(
                    document,
                    section_payloads=[
                        SectionPayload(
                            key="property_section",
                            display_name="Property Section",
                            description="Location schedule",
                            fields={
                                "Location": locations,
                                "locations": locations,
                                "extractedAt": datetime.utcnow().isoformat(),
                            },
                        )
                    ],
                    extraction_method="table_parser",
                    metadata=Metadata(
                        form_type_detected="ACORD_140", line_of_business="Property"
                    ),
                    raw={"locations": locations},
                )
                return ExtractionResult(
                    success=True,
                    data=canonical.to_dict(),
                    confidence=0.75,
                )

            return ExtractionResult(
                success=False,
                data={},
                errors=["No extractable data found"]
            )
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"ACORD 140 extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract."""
        return document.document_type == DocumentType.ACORD_140
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported types."""
        return [DocumentType.ACORD_140]

    def _resolve_template_config(
        self,
        document: Document,
        field_names: Iterable[str],
    ) -> Optional[TemplateConfig]:
        names = tuple(field_names or [])
        template_id_hint = (document.metadata or {}).get("template_id_hint")
        preferred_ids = [str(template_id_hint)] if template_id_hint else []

        detected = self.template_recognizer.detect(names)
        if detected:
            preferred_ids.append(detected)

        return self.template_loader.load_matching(
            form_type="ACORD_140",
            preferred_template_ids=preferred_ids,
            field_names=names,
        )
    
    def _extract_from_fillable(
        self,
        document: Document,
        raw_fields: Dict[str, Any],
        template_config: Optional[TemplateConfig],
        locations: List[Dict[str, Any]],
    ) -> ExtractionResult:
        """Extract from fillable fields."""
        mapped = self._map_fields(raw_fields, template_config)
        shared_fields = self._build_shared_fields(mapped, locations)
        fields = {**mapped, **shared_fields}
        canonical = build_generic_canonical_output(
            document,
            section_payloads=[
                SectionPayload(
                    key="property_section",
                    display_name="Property Section",
                    description="Building & coverage data",
                    fields=fields,
                )
            ],
            extraction_method="fillable_pdf",
            metadata=Metadata(
                form_type_detected="ACORD_140", line_of_business="Property"
            ),
            raw={
                "mapped_fields": mapped,
                "shared_fields": shared_fields,
                "raw_fields": raw_fields,
                "locations": locations,
            },
        )
        return ExtractionResult(
            success=True,
            data=canonical.to_dict(),
            confidence=0.8,
        )
    
    def _extract_locations_from_tables(self, document: Document) -> List[Dict[str, Any]]:
        """Extract location summary rows from reader-populated tables."""
        locations: List[Dict[str, Any]] = []

        if not document.tables:
            return locations

        for table in document.tables:
            headers = list(table.headers or [])
            headers_lower = [h.lower() for h in headers]
            if any("location" in h or "building" in h for h in headers_lower):
                column_map = self._map_table_columns(headers)
                for row in table.rows:
                    if not row:
                        continue
                    location = self._row_to_location(row, column_map)
                    if any(value not in ("", None) for value in location.values()):
                        locations.append(location)
        return locations
    
    def _map_fields(
        self, raw_fields: Dict[str, Any], template_config: Optional[TemplateConfig]
    ) -> Dict[str, Any]:
        """Map raw fields."""
        mapped: Dict[str, Any] = {}
        if template_config:
            for canonical, pdf_name in template_config.field_map.items():
                if pdf_name in raw_fields:
                    mapped[canonical] = raw_fields[pdf_name]
            return mapped

        for standard_field, possible_names in self.FIELD_MAPPINGS.items():
            for possible_name in possible_names:
                if possible_name in raw_fields:
                    mapped[standard_field] = raw_fields[possible_name]
                    break
        return mapped

    def _build_shared_fields(
        self,
        mapped: Dict[str, Any],
        locations: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        shared: Dict[str, Any] = {}
        if mapped.get("InsuredName"):
            shared["InsuredName"] = mapped["InsuredName"]

        normalized_locations = [location for location in locations if isinstance(location, dict)]
        if not normalized_locations:
            single_location = {
                "location_number": mapped.get("LocationNumber"),
                "address": mapped.get("LocationAddressLine1"),
                "year_built": mapped.get("BuiltYear"),
                "square_feet": mapped.get("BuildingArea"),
                "building_value": mapped.get("BuildingValue"),
                "contents_value": mapped.get("ContentsLimit"),
                "business_income": mapped.get("BusinessIncomeLimit"),
                "construction": mapped.get("ConstructionType"),
                "stories": mapped.get("NumberOfStories"),
                "sprinkler": mapped.get("SprinklerIndicator"),
                "fire_alarm": mapped.get("FireAlarmIndicator"),
                "burglar_alarm": mapped.get("BurglarAlarmIndicator"),
            }
            if any(value not in ("", None) for value in single_location.values()):
                normalized_locations = [single_location]

        if normalized_locations:
            shared["Location"] = normalized_locations
            total_insured_value = 0.0
            saw_value = False
            for location in normalized_locations:
                for key in ("building_value", "contents_value", "business_income"):
                    raw_value = location.get(key)
                    if raw_value in ("", None):
                        continue
                    try:
                        total_insured_value += float(str(raw_value).replace(",", "").replace("$", ""))
                        saw_value = True
                    except (TypeError, ValueError):
                        continue
            if saw_value:
                shared["TotalInsuredValue"] = total_insured_value

        return shared

    def _map_table_columns(self, headers: List[str]) -> Dict[int, str]:
        mapping: Dict[int, str] = {}
        for index, header in enumerate(headers):
            normalized = (header or "").strip().lower()
            if not normalized:
                continue
            if "location" in normalized and ("number" in normalized or "#" in normalized or normalized == "loc"):
                mapping[index] = "location_number"
            elif "address" in normalized:
                mapping[index] = "address"
            elif "building" in normalized and ("value" in normalized or "limit" in normalized):
                mapping[index] = "building_value"
            elif "contents" in normalized:
                mapping[index] = "contents_value"
            elif "business" in normalized and "income" in normalized:
                mapping[index] = "business_income"
            elif "construction" in normalized:
                mapping[index] = "construction"
            elif "year" in normalized and "built" in normalized:
                mapping[index] = "year_built"
            elif "square" in normalized or "sq" in normalized:
                mapping[index] = "square_feet"
            elif "stor" in normalized:
                mapping[index] = "stories"
            elif "sprinkler" in normalized:
                mapping[index] = "sprinkler"
        return mapping

    def _row_to_location(self, row: List[Any], column_map: Dict[int, str]) -> Dict[str, Any]:
        if column_map:
            location: Dict[str, Any] = {}
            for index, field_name in column_map.items():
                if index >= len(row):
                    continue
                value = row[index]
                if value in (None, ""):
                    continue
                location[field_name] = value
            return location

        return {
            "location_number": row[0] if len(row) > 0 else "",
            "building_value": row[1] if len(row) > 1 else "",
            "contents_value": row[2] if len(row) > 2 else "",
        }
    
    def __repr__(self) -> str:
        return "Acord140Extractor()"
