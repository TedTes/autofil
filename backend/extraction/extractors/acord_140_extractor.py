"""
ACORD 140 extractor for Property Section forms.

Extracts property insurance specific information.
"""

from typing import Dict, Any, List
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser, TableParser


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
        # Named Insured
        'insured_name': ['Named Insured'],
        
        # Location
        'location_number': ['Location Number', 'Loc #'],
        'location_address': ['Location Address', 'Address'],
        'city': ['City'],
        'state': ['State'],
        'zip': ['ZIP'],
        
        # Building
        'building_number': ['Building Number', 'Bldg #'],
        'building_value': ['Building Limit', 'Building Value'],
        'contents_value': ['Contents Limit', 'Personal Property'],
        'business_income': ['Business Income', 'BI Limit'],
        
        # Construction
        'construction_type': ['Construction Type', 'Construction'],
        'year_built': ['Year Built'],
        'number_of_stories': ['Number of Stories', 'Stories'],
        'square_footage': ['Square Footage', 'Area'],
        
        # Protection
        'sprinkler_system': ['Sprinkler', 'Automatic Sprinkler'],
        'fire_alarm': ['Fire Alarm', 'Alarm'],
        'burglar_alarm': ['Burglar Alarm'],
        
        # Occupancy
        'occupancy': ['Occupancy Type', 'Occupancy'],
    }
    
    def __init__(self):
        """Initialize ACORD 140 extractor."""
        self.pdf_parser = PdfFieldParser()
        self.table_parser = TableParser()
    
    def extract(self, document: Document) -> ExtractionResult:
        """Extract ACORD 140 data."""
        try:
            if document.document_type != DocumentType.ACORD_140:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected ACORD_140, got {document.document_type.value}"]
                )
            
            # Extract from fillable fields
            if self.pdf_parser.is_fillable(document.file_path):
                result = self._extract_from_fillable(document)
                if result.success:
                    return result
            
            # Extract from tables
            if document.tables:
                result = self._extract_from_tables(document)
                return result
            
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
    
    def _extract_from_fillable(self, document: Document) -> ExtractionResult:
        """Extract from fillable fields."""
        raw_fields = self.pdf_parser.extract_fields(document.file_path)
        mapped = self._map_fields(raw_fields)
        
        data = {
            'document_type': 'acord_140',
            'extraction_date': datetime.utcnow().isoformat(),
            'insured_name': mapped.get('insured_name', ''),
            'location': {
                'number': mapped.get('location_number', ''),
                'address': mapped.get('location_address', ''),
                'city': mapped.get('city', ''),
                'state': mapped.get('state', ''),
                'zip': mapped.get('zip', ''),
            },
            'building': {
                'number': mapped.get('building_number', ''),
                'value': mapped.get('building_value', ''),
                'contents_value': mapped.get('contents_value', ''),
                'business_income': mapped.get('business_income', ''),
            },
            'construction': {
                'type': mapped.get('construction_type', ''),
                'year_built': mapped.get('year_built', ''),
                'stories': mapped.get('number_of_stories', ''),
                'square_footage': mapped.get('square_footage', ''),
            },
            'protection': {
                'sprinkler': bool(mapped.get('sprinkler_system')),
                'fire_alarm': bool(mapped.get('fire_alarm')),
                'burglar_alarm': bool(mapped.get('burglar_alarm')),
            },
            'occupancy': mapped.get('occupancy', ''),
        }
        
        return ExtractionResult(
            success=True,
            data=data,
            confidence=0.8
        )
    
    def _extract_from_tables(self, document: Document) -> ExtractionResult:
        """Extract from tables."""
        # Similar to SOV extraction
        locations = []
        
        for table in document.tables:
            headers_lower = [h.lower() for h in table.headers]
            
            if any('location' in h or 'building' in h for h in headers_lower):
                for row in table.rows:
                    if len(row) >= 2:
                        locations.append({
                            'location': row[0],
                            'building_value': row[1] if len(row) > 1 else '',
                            'contents_value': row[2] if len(row) > 2 else '',
                        })
        
        data = {
            'document_type': 'acord_140',
            'extraction_date': datetime.utcnow().isoformat(),
            'locations': locations,
        }
        
        return ExtractionResult(
            success=True,
            data=data,
            confidence=0.75
        )
    
    def _map_fields(self, raw_fields: Dict[str, Any]) -> Dict[str, Any]:
        """Map raw fields."""
        mapped = {}
        for standard_field, possible_names in self.FIELD_MAPPINGS.items():
            for possible_name in possible_names:
                if possible_name in raw_fields:
                    mapped[standard_field] = raw_fields[possible_name]
                    break
        return mapped
    
    def __repr__(self) -> str:
        return "Acord140Extractor()"