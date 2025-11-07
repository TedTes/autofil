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

from .interfaces.extractor import IExtractor
from .interfaces.parser import IParser
from .interfaces.mapper import IMapper
from .interfaces.classifier import IClassifier, ClassificationResult, CompositeClassifier
from .models.extraction_result import ExtractionResult
from .strategies import FusionStrategy, DocumentGroup
from .extractors import ( 
    ACORD126Extractor,
    ACORD125Extractor,
    ACORD130Extractor,
    ACORD140Extractor,
    LossRunExtractor,
    SovExtractor,
    FinancialStatementExtractor,
    GenericExtractor,
    SupplementalExtractor,
    ExtractorFactory,
    extractor_registry,
    extract_from_document 
)
from .parsers import (
    PdfFieldParser,
    OcrParser,
    OcrFallbackParser,
    TableParser,
    ExcelParser,
    ImageParser,
    parser_registry,
    get_parser_for_file,
    list_available_parsers,
    get_supported_extensions
)
from .classifiers import (
    MimeClassifier,
    classifier_registry,
    KeywordClassifier,
    MLClassifier,
    TableClassifier
)

from .pipeline import (
    ExtractionPipeline,
    SimplePipeline,
    ExtractionPipelineBuilder,
    extract_from_file
)
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
    'ACORD126Extractor',
    'ACORD125Extractor',
    'ACORD130Extractor',
    'ACORD140Extractor',
    'LossRunExtractor',
    'SovExtractor',
    'FinancialStatementExtractor',
    'GenericExtractor',
    'SupplementalExtractor',
    'ExtractorFactory',
    'extractor_registry',
    'extract_from_document',

    # Parsers
    'PdfFieldParser',
    'OcrParser',
    'OcrFallbackParser',
    'TableParser',
    'ExcelParser',
    'ImageParser',
    
    # Parser utilities
    'parser_registry',
    'get_parser_for_file',
    'list_available_parsers',
    'get_supported_extensions',
    
    # Classifiers
    'MimeClassifier',
    'classifier_registry',
    'TableClassifier',
    'KeywordClassifier',
    'MLClassifier',


    # Pipeline
    'ExtractionPipeline',
    'SimplePipeline',
    'ExtractionPipelineBuilder',
    'extract_from_file',

    # Strategies
    'FusionStrategy',
    'DocumentGroup'
]

# Version
__version__ = '1.0.0'