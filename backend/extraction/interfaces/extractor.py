"""
Interface for document extractors.
"""

from abc import ABC, abstractmethod
from typing import List
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult


class IExtractor(ABC):
    """
    Interface for document extractors.
    
    Implementations orchestrate the extraction workflow:
    parsing PDF, mapping to canonical format, validation, etc.
    """
    
    @abstractmethod
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract data from PDF and return structured result.
        
        Args:
            document: Loaded document object
            
        Returns:
            ExtractionResult containing:
            - json: Canonical JSON structure
            - confidence: Extraction confidence (0.0 to 1.0)
            - warnings: List of warning messages
            - metadata: Additional extraction information
            
        Raises:
            FileNotFoundError: If PDF file doesn't exist
            ValueError: If extraction fails
        """
        pass
    
    @abstractmethod
    def can_extract(self, document: Document) -> bool:
        """
        Check if this extractor can handle the given PDF.
        
        Args:
            document: Loaded document object
            
        Returns:
            True if this extractor can process the PDF
        """
        pass
    
    @abstractmethod
    def get_supported_types(self) -> List[DocumentType]:
        """Return the document types supported by this extractor."""
        pass
