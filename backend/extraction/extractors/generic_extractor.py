"""
Generic extractor for documents without specific structure.

Falls back to basic text and metadata extraction when document type
is GENERIC or UNKNOWN.
"""

from typing import Dict, Any, List
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..core.schema import Metadata
from ..models.extraction_result import ExtractionResult
from ..utils.canonical_output_builder import (
    SectionPayload,
    build_generic_canonical_output,
)


class GenericExtractor(IExtractor):
    """
    Generic extractor for unstructured or unknown documents.
    
    Provides basic extraction:
    - Full text content
    - Tables (if any)
    - Images (if any)
    - Metadata
    - Basic text statistics
    
    Used as fallback when specific extractor not available.
    """
    
    def __init__(self):
        """Initialize Generic extractor."""
        pass
    
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract basic data from document.
        
        Args:
            document: Document object
            
        Returns:
            ExtractionResult with extracted content
        """
        try:
            data = {
                'document_type': 'generic',
                'extraction_date': datetime.utcnow().isoformat(),
                'content': self._extract_content(document),
                'tables': self._extract_tables(document),
                'images': self._extract_images(document),
                'metadata': self._extract_metadata(document),
                'statistics': self._calculate_statistics(document),
            }
            
            warnings = []
            
            # Add warning if no extractable content
            if not data['content']['text'] and not data['tables'] and not data['images']:
                warnings.append("No extractable content found")
            
            canonical = build_generic_canonical_output(
                document,
                section_payloads=[
                    SectionPayload(
                        key="generic_document",
                        display_name="Generic Extraction",
                        description="Baseline content + metadata",
                        fields={
                            "content": data["content"],
                            "tables": data["tables"],
                            "images": data["images"],
                            "metadata": data["metadata"],
                            "statistics": data["statistics"],
                            "extractionDate": data["extraction_date"],
                        },
                    )
                ],
                extraction_method="generic_extractor",
                metadata=Metadata(
                    form_type_detected=document.document_type.value.upper()
                    if document.document_type
                    else "GENERIC"
                ),
                raw=data,
            )

            return ExtractionResult(
                success=True,
                data=canonical.to_dict(),
                warnings=warnings,
                confidence=self._calculate_confidence(data)
            )
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Generic extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """
        Can extract from any document.
        
        Args:
            document: Document object
            
        Returns:
            Always True (fallback extractor)
        """
        return True
    
    def get_supported_types(self) -> List[DocumentType]:
        """
        Get supported document types.
        
        Returns:
            All document types (fallback for all)
        """
        return [
            DocumentType.GENERIC,
            DocumentType.UNKNOWN,
            DocumentType.SUPPLEMENTAL,
        ]
    
    def _extract_content(self, document: Document) -> Dict[str, Any]:
        """Extract text content."""
        content = {
            'text': document.raw_text or '',
            'has_text': bool(document.raw_text),
            'text_length': len(document.raw_text) if document.raw_text else 0,
        }
        
        # Extract first N characters as preview
        if document.raw_text:
            preview_length = 500
            content['preview'] = document.raw_text[:preview_length]
            if len(document.raw_text) > preview_length:
                content['preview'] += '...'
        else:
            content['preview'] = ''
        
        return content
    
    def _extract_tables(self, document: Document) -> List[Dict[str, Any]]:
        """Extract table data."""
        tables = []
        
        for idx, table in enumerate(document.tables):
            table_data = {
                'table_index': idx,
                'headers': table.headers,
                'row_count': len(table.rows),
                'column_count': len(table.headers),
                'rows': table.rows[:10] if table.rows else [],  # First 10 rows only
                'metadata': table.metadata,
            }
            
            # Add flag if truncated
            if len(table.rows) > 10:
                table_data['truncated'] = True
                table_data['total_rows'] = len(table.rows)
            
            tables.append(table_data)
        
        return tables
    
    def _extract_images(self, document: Document) -> List[Dict[str, Any]]:
        """Extract image metadata."""
        images = []
        
        for idx, image in enumerate(document.images):
            image_data = {
                'image_index': idx,
                'width': image.width,
                'height': image.height,
                'format': image.format,
                'metadata': image.metadata,
            }
            
            images.append(image_data)
        
        return images
    
    def _extract_metadata(self, document: Document) -> Dict[str, Any]:
        """Extract document metadata."""
        metadata = {
            'file_name': document.file_name,
            'file_extension': document.file_extension,
            'file_size': document.metadata.get('file_size'),
            'mime_type': document.mime_type,
            'page_count': document.structure.page_count,
            'document_type': document.document_type.value,
            'classification_confidence': document.confidence,
        }
        
        # Add custom metadata
        if document.metadata:
            metadata['custom'] = document.metadata
        
        # Add creation/modification dates if available
        if 'creation_date' in document.metadata:
            metadata['creation_date'] = document.metadata['creation_date']
        if 'modification_date' in document.metadata:
            metadata['modification_date'] = document.metadata['modification_date']
        
        return metadata
    
    def _calculate_statistics(self, document: Document) -> Dict[str, Any]:
        """Calculate document statistics."""
        stats = {
            'page_count': document.structure.page_count,
            'table_count': len(document.tables),
            'image_count': len(document.images),
            'has_text': bool(document.raw_text),
        }
        
        # Text statistics
        if document.raw_text:
            text = document.raw_text
            stats['character_count'] = len(text)
            stats['word_count'] = len(text.split())
            stats['line_count'] = text.count('\n') + 1
            
            # Estimate reading time (average 200 words per minute)
            stats['estimated_reading_time_minutes'] = max(1, stats['word_count'] // 200)
        else:
            stats['character_count'] = 0
            stats['word_count'] = 0
            stats['line_count'] = 0
            stats['estimated_reading_time_minutes'] = 0
        
        # Table statistics
        if document.tables:
            total_rows = sum(len(table.rows) for table in document.tables)
            stats['total_table_rows'] = total_rows
            stats['average_table_size'] = total_rows / len(document.tables)
        else:
            stats['total_table_rows'] = 0
            stats['average_table_size'] = 0
        
        return stats
    
    def _calculate_confidence(self, data: Dict[str, Any]) -> float:
        """
        Calculate extraction confidence.
        
        For generic extraction, confidence is based on amount of content extracted.
        """
        confidence = 0.5  # Base confidence for generic extraction
        
        # Bonus for having text
        if data['content']['has_text']:
            confidence += 0.2
        
        # Bonus for having tables
        if data['tables']:
            confidence += 0.15
        
        # Bonus for having images
        if data['images']:
            confidence += 0.1
        
        # Small bonus for file metadata
        if data['metadata']:
            confidence += 0.05
        
        return min(1.0, confidence)
    
    def extract_summary(self, document: Document) -> Dict[str, Any]:
        """
        Extract a brief summary of document content.
        
        Args:
            document: Document object
            
        Returns:
            Summary dictionary
        """
        summary = {
            'file_name': document.file_name,
            'document_type': document.document_type.value,
            'pages': document.structure.page_count,
            'has_tables': bool(document.tables),
            'table_count': len(document.tables),
            'has_images': bool(document.images),
            'image_count': len(document.images),
        }
        
        # Add text preview
        if document.raw_text:
            preview_length = 200
            summary['text_preview'] = document.raw_text[:preview_length]
            if len(document.raw_text) > preview_length:
                summary['text_preview'] += '...'
            summary['word_count'] = len(document.raw_text.split())
        else:
            summary['text_preview'] = ''
            summary['word_count'] = 0
        
        return summary
    
    def search_text(self, document: Document, query: str) -> List[Dict[str, Any]]:
        """
        Search for text in document.
        
        Args:
            document: Document object
            query: Search query
            
        Returns:
            List of matches with context
        """
        if not document.raw_text:
            return []
        
        matches = []
        text = document.raw_text.lower()
        query_lower = query.lower()
        
        # Find all occurrences
        import re
        pattern = re.escape(query_lower)
        
        for match in re.finditer(pattern, text):
            start = match.start()
            end = match.end()
            
            # Get context (50 chars before and after)
            context_start = max(0, start - 50)
            context_end = min(len(text), end + 50)
            
            matches.append({
                'position': start,
                'match': document.raw_text[start:end],
                'context': document.raw_text[context_start:context_end],
            })
        
        return matches
    
    def __repr__(self) -> str:
        return "GenericExtractor()"
