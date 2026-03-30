"""
Core extraction foundation.

Provides universal document handling and canonical schemas.
"""

import logging

from .document import Document, DocumentType, DocumentStatus, TableData, ImageData, StructureInfo
from .file_loader import UniversalFileLoader, MimeDetector, FileTypeRegistry, reader_registry

logger = logging.getLogger(__name__)

from . import readers as _readers  # noqa: F401

__all__ = [
    'Document',
    'DocumentType',
    'DocumentStatus',
    'TableData',
    'ImageData',
    'StructureInfo',
    'UniversalFileLoader',
    'MimeDetector',
    'FileTypeRegistry',
    'reader_registry',
]

for _name in ['PdfReader', 'ExcelReader', 'ImageReader', 'TextReader', 'DocxReader', 'GenericReader']:
    if hasattr(_readers, _name):
        globals()[_name] = getattr(_readers, _name)
        __all__.append(_name)
