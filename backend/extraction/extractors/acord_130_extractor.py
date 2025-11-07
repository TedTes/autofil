"""
ACORD 130 extractor for Workers Compensation Application forms.

Extracts workers compensation specific information.
"""

from typing import Dict, Any, List
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser, TableParser


class ACORD130Extractor(IExtractor):
    """
    Extractor for ACORD 130 Workers Compensation Application forms.
    
    Extracts:
    - Employer information
    - Classification codes and payroll
    - Experience modification
    - Prior coverage and losses
    """
    
    FIELD_MAPPINGS = {
        # Employer Information
        'employer_name': ['Named Insured', 'Employer Name'],
        'address': ['Address', 'Mailing Address'],
        'federal_id': ['FEIN', 'Federal ID'],
        'state_id': ['State ID', 'State Employer ID'],
        
        # Coverage
        'effective_date': ['Effective Date', 'Policy Period From'],
        'expiration_date': ['Expiration Date', 'Policy Period To'],
        'states': ['States', 'Coverage States'],
        
        # Experience Modification
        'experience_mod': ['Experience Mod', 'Experience Modification', 'Mod Factor'],
        'mod_effective_date': ['Mod Effective Date'],
        
        # Prior Coverage
        'prior_carrier': ['Prior Carrier', 'Current Carrier'],
        'prior_policy_number': ['Prior Policy Number'],
        
        # Total Payroll
        'total_estimated_payroll': ['Total Estimated Annual Payroll', 'Total Payroll'],
    }
    
    def __init__(self):
        """Initialize ACORD 130 extractor."""
        self.pdf_parser = PdfFieldParser()
        self.table_parser = TableParser()
    
    def extract(self, document: Document) -> ExtractionResult:
        """Extract ACORD 130 data."""
        try:
            if document.document_type != DocumentType.ACORD_130:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected ACORD_130, got {document.document_type.value}"]
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
                errors=[f"ACORD 130 extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract."""
        return document.document_type == DocumentType.ACORD_130
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported types."""
        return [DocumentType.ACORD_130]
    
    def _extract_from_fillable(self, document: Document) -> ExtractionResult:
        """Extract from fillable fields."""
        raw_fields = self.pdf_parser.extract_fields(document.file_path)
        mapped = self._map_fields(raw_fields)
        
        data = {
            'document_type': 'acord_130',
            'extraction_date': datetime.utcnow().isoformat(),
            'employer_information': {
                'name': mapped.get('employer_name', ''),
                'address': mapped.get('address', ''),
                'federal_id': mapped.get('federal_id', ''),
                'state_id': mapped.get('state_id', ''),
            },
            'coverage_information': {
                'effective_date': mapped.get('effective_date', ''),
                'expiration_date': mapped.get('expiration_date', ''),
                'states': mapped.get('states', ''),
            },
            'experience_modification': {
                'mod_factor': mapped.get('experience_mod', ''),
                'mod_effective_date': mapped.get('mod_effective_date', ''),
            },
            'prior_coverage': {
                'carrier': mapped.get('prior_carrier', ''),
                'policy_number': mapped.get('prior_policy_number', ''),
            },
            'payroll_information': {
                'total_estimated_payroll': mapped.get('total_estimated_payroll', ''),
            },
            'classifications': [],  # Extracted from tables
        }
        
        return ExtractionResult(
            success=True,
            data=data,
            confidence=0.8
        )
    
    def _extract_from_tables(self, document: Document) -> ExtractionResult:
        """Extract classification codes and payroll from tables."""
        classifications = []
        
        for table in document.tables:
            # Look for classification table
            headers_lower = [h.lower() for h in table.headers]
            
            if any('class' in h for h in headers_lower):
                for row in table.rows:
                    if len(row) >= 2:
                        classifications.append({
                            'class_code': row[0],
                            'description': row[1] if len(row) > 1 else '',
                            'payroll': row[2] if len(row) > 2 else '',
                        })
        
        data = {
            'document_type': 'acord_130',
            'extraction_date': datetime.utcnow().isoformat(),
            'classifications': classifications,
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
        return "Acord130Extractor()"