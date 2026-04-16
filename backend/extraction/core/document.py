"""
Unified Document class for universal document representation.

This class provides a standard structure for all extracted content,
regardless of file type or source.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

class DocumentType(Enum):
    """Enumeration of supported document types."""
    ACORD_25 = "acord_25"
    ACORD_27 = "acord_27"
    ACORD_28 = "acord_28"
    ACORD_101 = "acord_101"
    ACORD_126 = "acord_126"
    ACORD_125 = "acord_125"
    ACORD_130 = "acord_130"
    ACORD_140 = "acord_140"
    LOSS_RUN = "loss_run"
    SOV = "sov"
    FINANCIAL_STATEMENT = "financial_statement"
    SUPPLEMENTAL = "supplemental"
    GENERIC = "generic"
    UNKNOWN = "unknown"


class DocumentStatus(Enum):
    """Document processing status."""
    PENDING = "pending"
    LOADED = "loaded"
    CLASSIFIED = "classified"
    EXTRACTED = "extracted"
    VALIDATED = "validated"
    FAILED = "failed"


@dataclass
class TableData:
    """Structured table representation."""
    headers: List[str]
    rows: List[List[Any]]
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert table to dictionary format."""
        return {
            'headers': self.headers,
            'rows': self.rows,
            'metadata': self.metadata,
            'row_count': len(self.rows),
            'column_count': len(self.headers)
        }


@dataclass
class ImageData:
    """Image content representation."""
    data: bytes
    format: str  # jpg, png, tiff, etc.
    width: Optional[int] = None
    height: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert image metadata to dictionary."""
        return {
            'format': self.format,
            'width': self.width,
            'height': self.height,
            'size_bytes': len(self.data),
            'metadata': self.metadata
        }


@dataclass
class StructureInfo:
    """Document structural information."""
    page_count: int = 0
    has_fillable_fields: bool = False
    has_tables: bool = False
    has_images: bool = False
    sections: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert structure info to dictionary."""
        return {
            'page_count': self.page_count,
            'has_fillable_fields': self.has_fillable_fields,
            'has_tables': self.has_tables,
            'has_images': self.has_images,
            'sections': self.sections,
            'metadata': self.metadata
        }


class Document:
    """
    Unified document representation.
    
    This class provides a common structure for all documents
    regardless of their original format (PDF, Excel, Image, etc.).
    
    Attributes:
        id: Unique document identifier
        file_path: Original file path
        file_name: Original filename
        mime_type: MIME type of the file
        file_extension: File extension
        document_type: Classified document type
        status: Current processing status
        raw_text: All extractable text content
        tables: List of extracted tables
        images: List of extracted images
        metadata: File metadata (creation date, author, etc.)
        structure: Structural information
        confidence: Classification confidence (0.0 to 1.0)
        created_at: Document creation timestamp
        updated_at: Last update timestamp
        errors: List of error messages
        warnings: List of warning messages
    """
    
    def __init__(
        self,
        file_path: str,
        file_name: str,
        mime_type: Optional[str] = None,
        file_extension: Optional[str] = None
    ):
        """
        Initialize document.
        
        Args:
            file_path: Path to the file
            file_name: Name of the file
            mime_type: MIME type (optional)
            file_extension: File extension (optional)
        """
        self.id: Optional[str] = None
        self.job_id: str = str(uuid.uuid4())
        self.file_path: str = file_path
        self.file_name: str = file_name
        self.mime_type: Optional[str] = mime_type
        self.file_extension: Optional[str] = file_extension
        
        # Classification
        self.document_type: DocumentType = DocumentType.UNKNOWN
        self.status: DocumentStatus = DocumentStatus.PENDING
        self.confidence: float = 0.0
        
        # Content
        self.raw_text: str = ""
        self.tables: List[TableData] = []
        self.images: List[ImageData] = []
        
        # Metadata
        self.metadata: Dict[str, Any] = {}
        self.structure: StructureInfo = StructureInfo()
        
        # Tracking
        self.created_at: datetime = datetime.utcnow()
        self.updated_at: datetime = datetime.utcnow()
        
        # Issues
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    def set_document_type(self, doc_type: DocumentType, confidence: float = 1.0):
        """
        Set the document type and classification confidence.
        
        Args:
            doc_type: Classified document type
            confidence: Classification confidence (0.0 to 1.0)
        """
        self.document_type = doc_type
        self.confidence = max(0.0, min(1.0, confidence))
        self.updated_at = datetime.utcnow()
    
    def set_status(self, status: DocumentStatus):
        """
        Update document processing status.
        
        Args:
            status: New status
        """
        self.status = status
        self.updated_at = datetime.utcnow()
    
    def add_table(self, table: TableData):
        """Add a table to the document."""
        self.tables.append(table)
        self.structure.has_tables = True
        self.updated_at = datetime.utcnow()
    
    def add_image(self, image: ImageData):
        """Add an image to the document."""
        self.images.append(image)
        self.structure.has_images = True
        self.updated_at = datetime.utcnow()
    
    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        self.updated_at = datetime.utcnow()
    
    def add_warning(self, warning: str):
        """Add a warning message."""
        self.warnings.append(warning)
        self.updated_at = datetime.utcnow()
    
    def has_errors(self) -> bool:
        """Check if document has errors."""
        return len(self.errors) > 0
    
    def has_warnings(self) -> bool:
        """Check if document has warnings."""
        return len(self.warnings) > 0
    
    def is_classified(self) -> bool:
        """Check if document has been classified."""
        return self.document_type != DocumentType.UNKNOWN
    
    def is_successful(self) -> bool:
        """Check if document processing was successful."""
        return (
            self.status in [DocumentStatus.EXTRACTED, DocumentStatus.VALIDATED]
            and not self.has_errors()
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert document to dictionary representation.
        
        Returns:
            Dictionary with all document data
        """
        return {
            'id': self.id,
            'file_path': self.file_path,
            'file_name': self.file_name,
            'mime_type': self.mime_type,
            'file_extension': self.file_extension,
            'document_type': self.document_type.value,
            'status': self.status.value,
            'confidence': self.confidence,
            'raw_text': self.raw_text,
            'tables': [table.to_dict() for table in self.tables],
            'images': [image.to_dict() for image in self.images],
            'metadata': self.metadata,
            'structure': self.structure.to_dict(),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'errors': self.errors,
            'warnings': self.warnings
        }
    def classify_as(self, doc_type: DocumentType, confidence: float, classifier_name: str = 'unknown'):
        """
        Classify document with confidence and classifier info.
        
        Args:
            doc_type: Document type
            confidence: Classification confidence (0.0 to 1.0)
            classifier_name: Name of classifier
        """
        self.set_document_type(doc_type, confidence)
        self.metadata['classifier'] = classifier_name
        self.metadata['classification_timestamp'] = datetime.utcnow().isoformat()
    
    def get_classification_info(self) -> Dict[str, Any]:
        """
        Get classification information.
        
        Returns:
            Dictionary with classification details
        """
        return {
            'document_type': self.document_type.value,
            'confidence': self.confidence,
            'classifier': self.metadata.get('classifier', 'unknown'),
            'timestamp': self.metadata.get('classification_timestamp'),
            'is_classified': self.is_classified()
        }
    
    def __repr__(self) -> str:
        """String representation."""
        return (
            f"Document(file_name='{self.file_name}', "
            f"type={self.document_type.value}, "
            f"status={self.status.value}, "
            f"confidence={self.confidence:.2f})"
        )
