"""
Interface for document extractors.
"""

from abc import ABC, abstractmethod
from typing import Optional
from ..models.extraction_result import ExtractionResult


class IExtractor(ABC):
    """
    Interface for document extractors.
    
    Implementations orchestrate the extraction workflow:
    parsing PDF, mapping to canonical format, validation, etc.
    """
    
    @abstractmethod
    def extract(self, pdf_path: str) -> ExtractionResult:
        """
        Extract data from PDF and return structured result.
        
        Args:
            pdf_path: Path to PDF file
            
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
    def can_extract(self, pdf_path: str) -> bool:
        """
        Check if this extractor can handle the given PDF.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            True if this extractor can process the PDF
        """
        pass
    
    def get_supported_form_type(self) -> str:
        """
        Return the form type this extractor supports.
        
        Returns:
            Form type identifier (e.g., "126", "125", "140")
        """
        # Default implementation - subclasses can override
        return self.__class__.__name__.replace('Extractor', '').lower()