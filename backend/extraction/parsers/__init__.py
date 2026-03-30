"""
PDF parsers for extracting raw field data.

This module provides various parsers for different document types:
- PdfFieldParser: Extract fillable PDF fields
- OcrParser: Extract text from scanned documents/images via OCR
- TableParser: Extract tables from PDFs
- ExcelParser: Extract data from spreadsheets
- ImageParser: Extract text and metadata from images

All parsers implement the IParser interface.
"""

import logging

from .registry import ParserRegistry, parser_registry
from .utils import (
    get_file_extension,
    validate_file_exists,
    get_file_size_mb,
    is_file_too_large,
    clean_extracted_text,
    truncate_text,
    estimate_processing_time
)

logger = logging.getLogger(__name__)

__all__ = []


def _optional_import(module_name: str, *export_names: str) -> None:
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=list(export_names))
        for export_name in export_names:
            globals()[export_name] = getattr(module, export_name)
            __all__.append(export_name)
    except Exception as exc:
        for export_name in export_names:
            globals()[export_name] = None
            if export_name not in __all__:
                __all__.append(export_name)
        logger.warning("failed to import parser module %s: %s", module_name, exc)


_optional_import("pdf_field_parser", "PdfFieldParser")
_optional_import("ocr_parser", "OcrParser", "OcrFallbackParser")
_optional_import("table_parser", "TableParser")
_optional_import("excel_parser", "ExcelParser")
_optional_import("image_parser", "ImageParser")

__all__.extend([
    'ParserRegistry',
    'parser_registry',
    'get_file_extension',
    'validate_file_exists',
    'get_file_size_mb',
    'is_file_too_large',
    'clean_extracted_text',
    'truncate_text',
    'estimate_processing_time',
    'get_parser_for_file',
    'list_available_parsers',
    'get_supported_extensions'
])

# Version info
__version__ = '1.0.0'

# Parser capabilities summary
PARSER_CAPABILITIES = {
    'PdfFieldParser': {
        'file_types': ['.pdf'],
        'fillable_forms': True,
        'scanned_docs': False,
        'tables': False
    },
    'OcrParser': {
        'file_types': ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'],
        'fillable_forms': False,
        'scanned_docs': True,
        'tables': False
    },
    'TableParser': {
        'file_types': ['.pdf'],
        'fillable_forms': False,
        'scanned_docs': False,
        'tables': True
    },
    'ExcelParser': {
        'file_types': ['.xlsx', '.xls', '.xlsm', '.csv', '.tsv'],
        'fillable_forms': False,
        'scanned_docs': False,
        'tables': True
    },
    'ImageParser': {
        'file_types': ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.webp'],
        'fillable_forms': False,
        'scanned_docs': True,
        'tables': False
    }
}


def get_parser_for_file(file_path: str):
    """
    Get appropriate parser for a file.
    
    Args:
        file_path: Path to file
        
    Returns:
        Parser class instance or None
        
    Example:
        parser = get_parser_for_file('document.pdf')
        result = parser.extract_fields('document.pdf')
    """
    parser_class = parser_registry.get_parser_for_file(file_path)
    if parser_class:
        return parser_class()
    return None


def list_available_parsers() -> list:
    """
    Get list of available parsers.
    
    Returns:
        List of parser names
    """
    return parser_registry.list_parsers()


def get_supported_extensions() -> list:
    """
    Get list of all supported file extensions.
    
    Returns:
        List of file extensions
    """
    extensions = set()
    for capabilities in PARSER_CAPABILITIES.values():
        extensions.update(capabilities['file_types'])
    return sorted(list(extensions))
