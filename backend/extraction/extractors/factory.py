"""
Extractor factory for creating appropriate extractors.

Provides high-level interface for document extraction with
automatic extractor selection.
"""

from typing import Any, Dict, Optional
from ..core.document import Document, DocumentType
from ..core.schema import CanonicalOutput
from ..models.extraction_result import ExtractionResult
from ..interfaces.extractor import IExtractor
from ..utils.semantic_section_builder import SemanticSectionBuilder
from .registry import extractor_registry


class ExtractorFactory:
    """
    Factory for creating and using extractors.
    
    Simplifies extraction process by automatically selecting
    the appropriate extractor based on document type.
    """
    
    @staticmethod
    def create_extractor(document_type: DocumentType) -> Optional[IExtractor]:
        """
        Create extractor for document type.
        
        Args:
            document_type: Document type
            
        Returns:
            Extractor instance
        """
        return extractor_registry.get_extractor(document_type)
    
    @staticmethod
    def create_extractor_for_document(document: Document) -> IExtractor:
        """
        Create appropriate extractor for document.
        
        Args:
            document: Document object
            
        Returns:
            Extractor instance (never None - returns GenericExtractor as fallback)
        """
        return extractor_registry.get_extractor_for_document(document)
    
    @staticmethod
    def extract(document: Document) -> ExtractionResult:
        """
        Extract data from document using appropriate extractor.
        
        This is the main entry point for document extraction.
        
        Args:
            document: Document object to extract from
            
        Returns:
            ExtractionResult with extracted data
            
        Example:
            from extraction.core import UniversalFileLoader
            from extraction.extractors import ExtractorFactory
            
            loader = UniversalFileLoader()
            document = loader.load('acord_126.pdf')
            
            result = ExtractorFactory.extract(document)
            if result.success:
                print(result.data)
        """
        # Get appropriate extractor
        extractor = ExtractorFactory.create_extractor_for_document(document)
        
        # Extract data
        try:
            result = extractor.extract(document)
            result = ExtractorFactory._normalize_result(result, document)
            
            # Add extractor info to result
            if result.metadata is None:
                result.metadata = {}
            result.metadata['extractor_used'] = extractor.__class__.__name__
            result.metadata['document_type'] = document.document_type.value
            
            return result
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Extraction failed with {extractor.__class__.__name__}: {str(e)}"]
            )

    @staticmethod
    def _normalize_result(result: Any, document: Document) -> ExtractionResult:
        if isinstance(result, CanonicalOutput):
            result = ExtractionResult(success=True, data=result.to_dict())

        if not isinstance(result, ExtractionResult):
            raise TypeError(f"Extractor returned unsupported result type: {type(result)}")

        canonical = result.data if isinstance(result.data, dict) else {}
        semantic_sections = canonical.get("semantic_sections") or canonical.get("semanticSections") or []

        if semantic_sections:
            entity_map = SemanticSectionBuilder.flatten(semantic_sections)
            if not result.field_confidence:
                result.field_confidence = {
                    field_id: max(
                        (
                            float(value.get("confidence", 0.0))
                            for value in values
                            if isinstance(value, dict)
                        ),
                        default=0.0,
                    )
                    for field_id, values in entity_map.items()
                }

            if result.metadata is None:
                result.metadata = {}

            if "field_provenance" not in result.metadata:
                source_info = canonical.get("source") or {}
                source_file = source_info.get("file_name")
                extraction_method = source_info.get("extraction_method")
                raw = canonical.get("raw") or {}
                field_evidence = raw.get("field_evidence", {}) if isinstance(raw, dict) else {}
                result.metadata["field_provenance"] = {
                    field_id: [
                        {
                            **source,
                            **(
                                {"source_file": source_file}
                                if source_file
                                else {}
                            ),
                            **(
                                {"extraction_method": extraction_method}
                                if extraction_method
                                else {}
                            ),
                            **(
                                {"evidence_snippet": field_evidence.get(field_id)}
                                if field_evidence.get(field_id)
                                else {}
                            ),
                        }
                        for source in (
                            value.get("source")
                            for value in values
                            if isinstance(value, dict)
                        )
                        if isinstance(source, dict) and source
                    ]
                    for field_id, values in entity_map.items()
                }

            if result.confidence == 0.0 and result.field_confidence:
                result.confidence = sum(result.field_confidence.values()) / len(result.field_confidence)

        return result
    
    @staticmethod
    def can_extract(document: Document) -> bool:
        """
        Check if document can be extracted.
        
        Args:
            document: Document object
            
        Returns:
            True if extractor is available for document type
        """
        extractor = extractor_registry.get_extractor_for_document(document)
        return extractor is not None and extractor.can_extract(document)
    
    @staticmethod
    def get_available_extractors() -> dict:
        """
        Get information about available extractors.
        
        Returns:
            Dictionary with extractor information
        """
        return extractor_registry.get_extractor_info()


# Convenience function
def extract_from_document(document: Document) -> ExtractionResult:
    """
    Convenience function for extracting data from document.
    
    Args:
        document: Document object
        
    Returns:
        ExtractionResult with extracted data
    """
    return ExtractorFactory.extract(document)
