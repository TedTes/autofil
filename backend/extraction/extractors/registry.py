"""
Extractor registry for managing and selecting extractors.

Provides centralized access to extractors and automatic selection
based on document type.
"""

import logging
from importlib import import_module
from typing import Dict, Type, Optional, List
from ..core.document import Document, DocumentType

from ..extractors.generic_extractor import GenericExtractor

logger = logging.getLogger(__name__)


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
            DocumentType.GENERIC: GenericExtractor,
            DocumentType.UNKNOWN: GenericExtractor,
        })
        cls._register_if_available(DocumentType.ACORD_25, ".acord_25_extractor", "ACORD25Extractor")
        cls._register_if_available(DocumentType.ACORD_27, ".acord_template_extractor", "ACORD27Extractor")
        cls._register_if_available(DocumentType.ACORD_28, ".acord_template_extractor", "ACORD28Extractor")
        cls._register_if_available(DocumentType.ACORD_101, ".acord_template_extractor", "ACORD101Extractor")
        cls._register_if_available(DocumentType.ACORD_125, ".acord_125_extractor", "ACORD125Extractor")
        cls._register_if_available(DocumentType.ACORD_126, ".acord_126_extractor", "ACORD126Extractor")
        cls._register_if_available(DocumentType.ACORD_130, ".acord_130_extractor", "ACORD130Extractor")
        cls._register_if_available(DocumentType.ACORD_140, ".acord_140_extractor", "ACORD140Extractor")
        cls._register_if_available(DocumentType.LOSS_RUN, ".loss_run_extractor", "LossRunExtractor")
        cls._register_if_available(DocumentType.SOV, ".sov_extractor", "SovExtractor")
        cls._register_if_available(DocumentType.FINANCIAL_STATEMENT, ".financial_statement_extractor", "FinancialStatementExtractor")
        cls._register_if_available(DocumentType.SUPPLEMENTAL, ".supplemental_extractor", "SupplementalExtractor")

    @classmethod
    def _register_if_available(cls, document_type: DocumentType, module_name: str, export_name: str) -> None:
        try:
            module = import_module(module_name, package=__package__)
            cls._registry[document_type] = getattr(module, export_name)
        except Exception as exc:
            logger.warning("failed to register extractor %s for %s: %s", export_name, document_type.value, exc)

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
        if not extractor_class:
            return None
        try:
            return extractor_class()
        except Exception as exc:
            logger.warning(
                "failed to instantiate extractor %s for %s: %s",
                extractor_class.__name__,
                document_type.value,
                exc,
            )
            if document_type not in (DocumentType.GENERIC, DocumentType.UNKNOWN):
                return GenericExtractor()
            return None

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
