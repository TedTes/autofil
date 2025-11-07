"""
Extractor registry for managing and selecting extractors.

Provides centralized access to extractors and automatic selection
based on document type.
"""

from typing import Dict, Type, Optional, List
from ..core.document import Document, DocumentType

# Import all extractors explicitly
from ..extractors.acord_125_extractor import ACORD125Extractor
from ..extractors.acord_126_extractor import ACORD126Extractor
from ..extractors.acord_130_extractor import ACORD130Extractor
from ..extractors.acord_140_extractor import ACORD140Extractor
from ..extractors.loss_run_extractor import LossRunExtractor
from ..extractors.sov_extractor import SovExtractor
from ..extractors.financial_statement_extractor import FinancialStatementExtractor
from ..extractors.supplemental_extractor import SupplementalExtractor
from ..extractors.generic_extractor import GenericExtractor


class ExtractorRegistry:
    """
    Registry for document extractors.
    
    Maps DocumentType → Extractor class.
    Single source of truth. No decorators. No try/except.
    """
    
    _registry: Dict[DocumentType, Type] = {}

    @classmethod
    def _register_defaults(cls):
        """Register all known extractors."""
        cls._registry.update({
            DocumentType.ACORD_125: ACORD125Extractor,
            DocumentType.ACORD_126: ACORD126Extractor,
            DocumentType.ACORD_130: ACORD130Extractor,
            DocumentType.ACORD_140: ACORD140Extractor,
            DocumentType.LOSS_RUN: LossRunExtractor,
            DocumentType.SOV: SovExtractor,
            DocumentType.FINANCIAL_STATEMENT: FinancialStatementExtractor,
            DocumentType.SUPPLEMENTAL: SupplementalExtractor,
            DocumentType.GENERIC: GenericExtractor,
            DocumentType.UNKNOWN: GenericExtractor,
        })

    @classmethod
    def register(cls, document_type: DocumentType, extractor_class: Type):
        """Register an extractor."""
        cls._registry[document_type] = extractor_class

    @classmethod
    def get(cls, document_type: DocumentType) -> Optional[Type]:
        """Get extractor class."""
        return cls._registry.get(document_type)

    @classmethod
    def get_extractor(cls, document_type: DocumentType) -> Optional[object]:
        """Get extractor instance."""
        extractor_class = cls.get(document_type)
        return extractor_class() if extractor_class else None

    @classmethod
    def get_extractor_for_document(cls, document: Document) -> object:
        """Get best extractor for a document."""
        extractor = cls.get_extractor(document.document_type)
        if extractor and getattr(extractor, "can_extract", lambda d: True)(document):
            return extractor
        return GenericExtractor()

    @classmethod
    def has_extractor(cls, document_type: DocumentType) -> bool:
        """Check if extractor exists."""
        return document_type in cls._registry

    @classmethod
    def list_extractors(cls) -> List[DocumentType]:
        """List all registered types."""
        return list(cls._registry.keys())

    @classmethod
    def get_info(cls) -> Dict[str, Dict]:
        """Get registry metadata."""
        return {
            dt.value: {
                "extractor": cls._registry[dt].__name__,
                "supports": [t.value for t in cls._registry[dt]().get_supported_types()]
            }
            for dt in cls._registry
        }

    @classmethod
    def __repr__(cls):
        return f"ExtractorRegistry({len(cls._registry)} extractors)"


# Initialize registry at import time
ExtractorRegistry._register_defaults()

# Global instance
extractor_registry = ExtractorRegistry