"""
ACORD 140 extractor for Property Section forms.

Extracts property insurance specific information.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser, TableParser
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
        self.table_parser = TableParser()
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
            if self.pdf_parser.is_fillable(document.file_path):
                raw_fields = self.pdf_parser.extract_fields(document.file_path)
                if raw_fields:
                    template_id = self.template_recognizer.detect(raw_fields.keys())
                    if template_id:
                        template_config = self.template_loader.load(template_id)
                result = self._extract_from_fillable(raw_fields, template_config)
                if result.success:
                    locations = self._extract_locations_from_tables(document)
                    if locations:
                        result.data["locations"] = locations
                    return result

            locations = self._extract_locations_from_tables(document)
            if locations:
                return ExtractionResult(
                    success=True,
                    data={"locations": locations},
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
    
    def _extract_from_fillable(
        self, raw_fields: Dict[str, Any], template_config: Optional[TemplateConfig]
    ) -> ExtractionResult:
        """Extract from fillable fields."""
        mapped = self._map_fields(raw_fields, template_config)
        return ExtractionResult(
            success=True,
            data=mapped,
            confidence=0.8,
        )
    
    def _extract_locations_from_tables(self, document: Document) -> List[Dict[str, Any]]:
        """Extract location summary rows from tables."""
        locations: List[Dict[str, Any]] = []

        if not document.tables:
            return locations

        for table in document.tables:
            headers_lower = [h.lower() for h in table.headers]
            if any("location" in h or "building" in h for h in headers_lower):
                for row in table.rows:
                    if len(row) >= 2:
                        locations.append(
                            {
                                "location": row[0],
                                "building_value": row[1] if len(row) > 1 else "",
                                "contents_value": row[2] if len(row) > 2 else "",
                            }
                        )
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
    
    def __repr__(self) -> str:
        return "Acord140Extractor()"
