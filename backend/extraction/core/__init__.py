"""
Core extraction foundation.

Provides universal document handling and canonical schemas.
"""

from .document import Document, DocumentType, DocumentStatus, TableData, ImageData, StructureInfo
from .file_loader import UniversalFileLoader, MimeDetector, FileTypeRegistry, reader_registry

# Import readers to trigger auto-registration
from .readers import (
    PdfReader, 
    ExcelReader, 
    ImageReader, 
    TextReader, 
    DocxReader,
    GenericReader
)

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
    'PdfReader',
    'ExcelReader',
    'ImageReader',
    'TextReader',
    'DocxReader',
    'GenericReader'
]