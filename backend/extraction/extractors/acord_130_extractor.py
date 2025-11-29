"""
ACORD 130 extractor for Workers Compensation Application forms.

Extracts workers compensation specific information.
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


class ACORD130Extractor(IExtractor):
    """
    Extractor for ACORD 130 Workers Compensation Application forms.
    
    Extracts:
    - Employer information
    - Classification codes and payroll
    - Experience modification
    - Prior coverage and losses
    """
    
    def __init__(self):
        """Initialize ACORD 130 extractor."""
        self.pdf_parser = PdfFieldParser()
        self.table_parser = TableParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(
            base_dir=self.template_loader.base_dir
        )
    
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
            template_config: Optional[TemplateConfig] = None
            raw_fields = {}
            if self.pdf_parser.is_fillable(document.file_path):
                raw_fields = self.pdf_parser.extract_fields(document.file_path)
                if raw_fields:
                    template_id = self.template_recognizer.detect(raw_fields.keys())
                    if template_id:
                        template_config = self.template_loader.load(template_id)
                result = self._extract_from_fillable(raw_fields, template_config)
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
    
    def _extract_from_fillable(
        self, raw_fields: Dict[str, Any], template_config: Optional[TemplateConfig]
    ) -> ExtractionResult:
        """Extract from fillable fields."""
        mapped = self._map_fields(raw_fields, template_config)
        return ExtractionResult(success=True, data=mapped, confidence=0.8)
    
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
    
    def _map_fields(
        self, raw_fields: Dict[str, Any], template_config: Optional[TemplateConfig]
    ) -> Dict[str, Any]:
        """Map raw fields."""
        mapped: Dict[str, Any] = {}
        if template_config:
            pdf_to_canonical = template_config.pdf_to_canonical
            for pdf_name, canonical in pdf_to_canonical.items():
                if pdf_name in raw_fields:
                    mapped[canonical] = raw_fields[pdf_name]
            return mapped

        # fallback: alias-based mapping
        for standard_field, possible_names in self.FIELD_MAPPINGS.items():
            for possible_name in possible_names:
                if possible_name in raw_fields:
                    mapped[standard_field] = raw_fields[possible_name]
                    break
        return mapped
    
    def __repr__(self) -> str:
        return "ACORD130Extractor()"
    FIELD_MAPPINGS = {
        # Employer Information
        "EmployerName": ["Named Insured", "Employer Name"],
        "EmployerAddressLine1": ["Address", "Mailing Address"],
        "EmployerAddressLine2": ["Address Line 2"],
        "EmployerCity": ["City"],
        "EmployerState": ["State"],
        "EmployerPostalCode": ["Zip"],
        "FederalID": ["FEIN", "Federal ID"],
        "StateID": ["State ID", "State Employer ID"],
        # Coverage
        "EffectiveDate": ["Effective Date", "Policy Period From"],
        "ExpirationDate": ["Expiration Date", "Policy Period To"],
        "CoverageStates": ["States", "Coverage States"],
        # Experience Modification
        "ExperienceModFactor": ["Experience Mod", "Experience Modification", "Mod Factor"],
        "ExperienceModEffectiveDate": ["Mod Effective Date"],
        # Prior Coverage
        "PriorCarrierName": ["Prior Carrier", "Current Carrier"],
        "PriorPolicyNumber": ["Prior Policy Number"],
        # Total Payroll
        "TotalEstimatedPayroll": ["Total Estimated Annual Payroll", "Total Payroll"],
    }
