"""
Extraction module for converting PDFs to canonical JSON format.

This module provides a complete extraction pipeline:
- Core: Document model, schema registry, file loading
- Parsers: PDF, OCR, Table, Excel, Image parsers
- Classifiers: Document type detection
- Extractors: ACORD form extractors
- Mappers: Field mapping to canonical JSON
- Interfaces: Standard interfaces for all components
"""

import logging

from .interfaces.extractor import IExtractor
from .interfaces.parser import IParser
from .interfaces.mapper import IMapper
from .interfaces.classifier import IClassifier, ClassificationResult, CompositeClassifier
from .models.extraction_result import ExtractionResult
from .extractors import ExtractorFactory, extractor_registry, extract_from_document
from .parsers import parser_registry, get_parser_for_file, list_available_parsers, get_supported_extensions
from .classifiers import classifier_registry

from .pipeline import (
    ExtractionPipeline,
    SimplePipeline,
    ExtractionPipelineBuilder,
    extract_from_file
)

logger = logging.getLogger(__name__)


def _optional_import(module_name: str, *export_names: str) -> None:
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=list(export_names))
        for export_name in export_names:
            globals()[export_name] = getattr(module, export_name)
            if export_name not in __all__:
                __all__.append(export_name)
    except Exception as exc:
        for export_name in export_names:
            globals()[export_name] = None
            if export_name not in __all__:
                __all__.append(export_name)
        logger.warning("failed to import extraction module %s: %s", module_name, exc)


__all__ = [
    # Interfaces
    'IExtractor',
    'IParser',
    'IMapper',
    'IClassifier',
    
    # Models
    'ExtractionResult',
    'ClassificationResult',
    'CompositeClassifier',
    
    # Extractors
    'ExtractorFactory',
    'extractor_registry',
    'extract_from_document',

    # Parser utilities
    'parser_registry',
    'get_parser_for_file',
    'list_available_parsers',
    'get_supported_extensions',
    
    # Classifiers
    'classifier_registry',

    # Pipeline
    'ExtractionPipeline',
    'SimplePipeline',
    'ExtractionPipelineBuilder',
    'extract_from_file',
]

_optional_import("strategies", "FusionStrategy", "DocumentGroup")
_optional_import("extractors", "ACORD126Extractor", "ACORD25Extractor", "ACORD125Extractor", "ACORD130Extractor", "ACORD140Extractor", "LossRunExtractor", "SovExtractor", "FinancialStatementExtractor", "GenericExtractor", "SupplementalExtractor")
_optional_import("parsers", "PdfFieldParser", "OcrParser", "OcrFallbackParser", "TableParser", "ExcelParser", "ImageParser")
_optional_import("classifiers", "MimeClassifier", "KeywordClassifier", "MLClassifier", "TableClassifier")

# Version
__version__ = '1.0.0'
