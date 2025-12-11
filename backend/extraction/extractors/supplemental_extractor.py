"""
Supplemental document extractor.

Handles supporting documents like:
- Driver licenses
- Certificates
- Photos
- Miscellaneous attachments
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import re
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..core.schema import Metadata
from ..models.extraction_result import ExtractionResult
from ..parsers import OcrParser
from ..utils.canonical_output_builder import (
    SectionPayload,
    build_generic_canonical_output,
)


class SupplementalExtractor(IExtractor):
    """
    Extractor for supplemental/supporting documents.
    
    Handles various types of supplemental documents:
    - Driver licenses and IDs
    - Insurance certificates
    - Photos and images
    - Supporting documentation
    
    Uses OCR for scanned documents and images.
    """
    
    # Patterns for identifying supplemental document types
    SUPPLEMENTAL_TYPES = {
        'driver_license': {
            'patterns': [
                r'driver(?:\'s)?\s+license',
                r'operator(?:\'s)?\s+license',
                r'license\s+(?:number|no)',
                r'dl\s+(?:#|number)',
                r'date\s+of\s+birth',
                r'expir(?:ation|es)',
            ],
            'fields': ['license_number', 'name', 'address', 'date_of_birth', 'expiration_date']
        },
        'certificate': {
            'patterns': [
                r'certificate\s+of\s+insurance',
                r'certificate\s+holder',
                r'this\s+certificate\s+is\s+issued',
                r'acord\s+(?:25|27|28)',
            ],
            'fields': ['certificate_number', 'insured_name', 'effective_date', 'expiration_date']
        },
        'photo': {
            'patterns': [
                # Photos are identified by being primarily images with little text
            ],
            'fields': ['description', 'location', 'date_taken']
        },
        'receipt': {
            'patterns': [
                r'receipt',
                r'invoice',
                r'total\s+amount',
                r'payment',
            ],
            'fields': ['receipt_number', 'date', 'amount', 'vendor']
        },
        'generic': {
            'patterns': [],
            'fields': []
        }
    }
    
    def __init__(self):
        """Initialize Supplemental extractor."""
        self.ocr_parser = None  # Lazy load
    
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract data from supplemental document.
        
        Args:
            document: Document object
            
        Returns:
            ExtractionResult with extracted data
        """
        try:
            # Verify document type
            if document.document_type != DocumentType.SUPPLEMENTAL:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected SUPPLEMENTAL document, got {document.document_type.value}"]
                )
            
            # Detect supplemental type
            supplemental_type = self._detect_supplemental_type(document)
            
            # Extract based on type
            if supplemental_type == 'driver_license':
                extracted_data = self._extract_driver_license(document)
            elif supplemental_type == 'certificate':
                extracted_data = self._extract_certificate(document)
            elif supplemental_type == 'photo':
                extracted_data = self._extract_photo(document)
            elif supplemental_type == 'receipt':
                extracted_data = self._extract_receipt(document)
            else:
                extracted_data = self._extract_generic_supplemental(document)
            
            data = {
                'document_type': 'supplemental',
                'supplemental_type': supplemental_type,
                'extraction_date': datetime.utcnow().isoformat(),
                'data': extracted_data,
                'raw_text': document.raw_text or '',
                'metadata': self._extract_metadata(document),
            }
            
            warnings = []
            if not extracted_data:
                warnings.append(f"Limited data extracted from {supplemental_type}")
            
            canonical = build_generic_canonical_output(
                document,
                section_payloads=[
                    SectionPayload(
                        key="supplemental",
                        display_name="Supplemental Document",
                        description=f"Detected type: {supplemental_type}",
                        fields={
                            "supplementalType": supplemental_type,
                            "extractedData": extracted_data,
                            "rawText": data["raw_text"],
                            "metadata": data["metadata"],
                            "extractionDate": data["extraction_date"],
                        },
                    )
                ],
                extraction_method="supplemental_extractor",
                metadata=Metadata(
                    form_type_detected=document.document_type.value.upper(),
                    line_of_business=document.metadata.get("line_of_business")
                    if document.metadata
                    else None,
                ),
                raw=data,
            )

            return ExtractionResult(
                success=True,
                data=canonical.to_dict(),
                warnings=warnings,
                confidence=self._calculate_confidence(extracted_data, supplemental_type)
            )
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Supplemental extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract from document."""
        return document.document_type == DocumentType.SUPPLEMENTAL
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported document types."""
        return [DocumentType.SUPPLEMENTAL]
    
    def _detect_supplemental_type(self, document: Document) -> str:
        """Detect the specific type of supplemental document."""
        text = document.raw_text.lower() if document.raw_text else ''
        
        # Check patterns for each type
        for supp_type, info in self.SUPPLEMENTAL_TYPES.items():
            if supp_type == 'generic':
                continue
            
            patterns = info['patterns']
            matches = sum(1 for pattern in patterns if re.search(pattern, text, re.IGNORECASE))
            
            # If multiple patterns match, confident it's this type
            if matches >= 2:
                return supp_type
        
        # Check if primarily image (photo)
        if document.images and len(document.images) > 0:
            text_length = len(text)
            if text_length < 100:  # Very little text = likely a photo
                return 'photo'
        
        return 'generic'
    
    def _extract_driver_license(self, document: Document) -> Dict[str, Any]:
        """Extract driver license information."""
        data = {}
        text = document.raw_text or ''
        
        # Extract license number
        license_match = re.search(
            r'(?:license|dl).*(?:number|no|#)[:\s]*([A-Z0-9\-]+)',
            text,
            re.IGNORECASE
        )
        if license_match:
            data['license_number'] = license_match.group(1).strip()
        
        # Extract name
        name_match = re.search(
            r'(?:name|ln)[:\s]*([A-Z\s]+)',
            text,
            re.IGNORECASE | re.MULTILINE
        )
        if name_match:
            data['name'] = name_match.group(1).strip()
        
        # Extract date of birth
        dob_match = re.search(
            r'(?:dob|date\s+of\s+birth|birth\s+date)[:\s]*([0-9/\-]+)',
            text,
            re.IGNORECASE
        )
        if dob_match:
            data['date_of_birth'] = dob_match.group(1).strip()
        
        # Extract expiration date
        exp_match = re.search(
            r'(?:exp|expir)[:\s]*([0-9/\-]+)',
            text,
            re.IGNORECASE
        )
        if exp_match:
            data['expiration_date'] = exp_match.group(1).strip()
        
        # Extract address (multi-line)
        address_match = re.search(
            r'(?:address|addr)[:\s]*([^\n]+(?:\n[^\n]+)?)',
            text,
            re.IGNORECASE
        )
        if address_match:
            data['address'] = address_match.group(1).strip()
        
        return data
    
    def _extract_certificate(self, document: Document) -> Dict[str, Any]:
        """Extract insurance certificate information."""
        data = {}
        text = document.raw_text or ''
        
        # Extract certificate number
        cert_match = re.search(
            r'certificate.*(?:number|no|#)[:\s]*([A-Z0-9\-]+)',
            text,
            re.IGNORECASE
        )
        if cert_match:
            data['certificate_number'] = cert_match.group(1).strip()
        
        # Extract insured name
        insured_match = re.search(
            r'(?:named\s+)?insured[:\s]*([^\n]+)',
            text,
            re.IGNORECASE
        )
        if insured_match:
            data['insured_name'] = insured_match.group(1).strip()
        
        # Extract certificate holder
        holder_match = re.search(
            r'certificate\s+holder[:\s]*([^\n]+)',
            text,
            re.IGNORECASE
        )
        if holder_match:
            data['certificate_holder'] = holder_match.group(1).strip()
        
        # Extract effective date
        effective_match = re.search(
            r'effective[:\s]*([0-9/\-]+)',
            text,
            re.IGNORECASE
        )
        if effective_match:
            data['effective_date'] = effective_match.group(1).strip()
        
        # Extract expiration date
        exp_match = re.search(
            r'expir(?:ation|es)[:\s]*([0-9/\-]+)',
            text,
            re.IGNORECASE
        )
        if exp_match:
            data['expiration_date'] = exp_match.group(1).strip()
        
        return data
    
    def _extract_photo(self, document: Document) -> Dict[str, Any]:
        """Extract photo metadata and description."""
        data = {
            'type': 'photo',
            'images': []
        }
        
        # Extract image metadata
        for idx, image in enumerate(document.images):
            image_data = {
                'image_index': idx,
                'width': image.width,
                'height': image.height,
                'format': image.format,
                'page': image.page,
            }
            
            # Add EXIF data if available
            if image.metadata:
                image_data['metadata'] = image.metadata
            
            data['images'].append(image_data)
        
        # Extract any caption/description from text
        if document.raw_text:
            data['description'] = document.raw_text.strip()
        
        return data
    
    def _extract_receipt(self, document: Document) -> Dict[str, Any]:
        """Extract receipt information."""
        data = {}
        text = document.raw_text or ''
        
        # Extract receipt number
        receipt_match = re.search(
            r'(?:receipt|invoice).*(?:number|no|#)[:\s]*([A-Z0-9\-]+)',
            text,
            re.IGNORECASE
        )
        if receipt_match:
            data['receipt_number'] = receipt_match.group(1).strip()
        
        # Extract date
        date_match = re.search(
            r'date[:\s]*([0-9/\-]+)',
            text,
            re.IGNORECASE
        )
        if date_match:
            data['date'] = date_match.group(1).strip()
        
        # Extract total amount
        amount_match = re.search(
            r'total[:\s]*\$?([0-9,\.]+)',
            text,
            re.IGNORECASE
        )
        if amount_match:
            data['total_amount'] = amount_match.group(1).strip()
        
        # Extract vendor/merchant
        vendor_match = re.search(
            r'^([A-Z][^\n]+)(?=\n)',
            text,
            re.MULTILINE
        )
        if vendor_match:
            data['vendor'] = vendor_match.group(1).strip()
        
        return data
    
    def _extract_generic_supplemental(self, document: Document) -> Dict[str, Any]:
        """Extract generic supplemental document data."""
        data = {
            'type': 'generic',
            'content': document.raw_text or '',
        }
        
        # Add basic document info
        if document.tables:
            data['has_tables'] = True
            data['table_count'] = len(document.tables)
        
        if document.images:
            data['has_images'] = True
            data['image_count'] = len(document.images)
        
        # Try to extract any dates
        if document.raw_text:
            dates = re.findall(
                r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
                document.raw_text
            )
            if dates:
                data['dates_found'] = dates
        
        return data
    
    def _extract_metadata(self, document: Document) -> Dict[str, Any]:
        """Extract document metadata."""
        metadata = {
            'file_name': document.file_name,
            'file_extension': document.file_extension,
            'mime_type': document.mime_type,
            'file_size': document.file_size,
            'page_count': document.structure.page_count,
        }
        
        # Add custom metadata
        if document.metadata:
            metadata.update(document.metadata)
        
        return metadata
    
    def _calculate_confidence(
        self,
        extracted_data: Dict[str, Any],
        supplemental_type: str
    ) -> float:
        """Calculate extraction confidence."""
        # Base confidence
        confidence = 0.6
        
        # Bonus for specific type detection
        if supplemental_type != 'generic':
            confidence += 0.1
        
        # Bonus for extracted fields
        if extracted_data:
            field_count = len([v for v in extracted_data.values() if v])
            confidence += min(0.2, field_count * 0.05)
        
        return min(1.0, confidence)
    
    def _ensure_ocr_parser(self):
        """Lazy load OCR parser."""
        if self.ocr_parser is None:
            try:
                self.ocr_parser = OcrParser()
            except ImportError:
                pass  # OCR not available
    
    def __repr__(self) -> str:
        return "SupplementalExtractor()"
