"""
Universal file loader with MIME-based detection and registry routing.

Uses magic bytes to detect true file type, then routes to appropriate
reader via registry pattern (no if/else chains).
"""

import os
import magic
from typing import Optional, Dict, Any
from .document import Document, DocumentStatus


class FileTypeRegistry:
    """
    Registry for file type handlers.
    
    Allows readers to self-register for MIME types they support.
    Uses decorator pattern for clean registration.
    """
    
    def __init__(self):
        """Initialize registry."""
        self._handlers: Dict[str, type] = {}
        self._mime_aliases: Dict[str, str] = {
            # Handle MIME type variations
            'application/x-pdf': 'application/pdf',
            'image/jpg': 'image/jpeg',
        }
    
    def register(self, *mime_types: str):
        """
        Decorator to register a reader for specific MIME types.
        
        Usage:
            @registry.register('application/pdf')
            class PdfReader:
                def read(self, file_path) -> Document:
                    ...
        
        Args:
            *mime_types: One or more MIME types this reader handles
        """
        def decorator(reader_class):
            for mime_type in mime_types:
                normalized = self._normalize_mime(mime_type)
                self._handlers[normalized] = reader_class
            return reader_class
        return decorator
    
    def get(self, mime_type: str) -> Optional[type]:
        """
        Get reader class for a MIME type.
        
        Args:
            mime_type: MIME type to look up
            
        Returns:
            Reader class or None if not found
        """
        normalized = self._normalize_mime(mime_type)
        return self._handlers.get(normalized)
    
    def has(self, mime_type: str) -> bool:
        """Check if a handler exists for MIME type."""
        normalized = self._normalize_mime(mime_type)
        return normalized in self._handlers
    
    def _normalize_mime(self, mime_type: str) -> str:
        """Normalize MIME type (handle aliases)."""
        return self._mime_aliases.get(mime_type, mime_type)
    
    def get_supported_types(self) -> list[str]:
        """Get list of all supported MIME types."""
        return list(self._handlers.keys())
    
    def __repr__(self) -> str:
        """String representation."""
        return f"FileTypeRegistry(handlers={len(self._handlers)})"


# Global registry instance
reader_registry = FileTypeRegistry()


class MimeDetector:
    """
    MIME type detector using magic bytes.
    
    Detects true file type by examining file content,
    not by trusting file extensions.
    """
    
    # Allowlist of safe MIME types
    ALLOWED_MIME_TYPES = {
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # xlsx
        'application/vnd.ms-excel',  # xls
        'text/csv',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/tiff',
        'image/gif',
        'image/bmp',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # docx
        'application/msword',  # doc
    }
    
    # Blocklist of dangerous MIME types
    DANGEROUS_MIME_TYPES = {
        'application/x-executable',
        'application/x-dosexec',
        'application/x-msdownload',
        'application/x-sh',
        'application/x-shellscript',
        'application/x-python',
        'text/x-shellscript',
    }
    
    def __init__(self):
        """Initialize MIME detector."""
        self.magic = magic.Magic(mime=True)
    
    def detect(self, file_path: str) -> tuple[str, bool, str]:
        """
        Detect MIME type from file content.
        
        Args:
            file_path: Path to file
            
        Returns:
            Tuple of (mime_type, is_safe, message)
        """
        if not os.path.exists(file_path):
            return 'unknown', False, 'File not found'
        
        try:
            # Detect MIME type from magic bytes
            detected_mime = self.magic.from_file(file_path)
            
            # Security check
            if detected_mime in self.DANGEROUS_MIME_TYPES:
                return detected_mime, False, f'Dangerous file type: {detected_mime}'
            
            # Allowlist check
            if detected_mime not in self.ALLOWED_MIME_TYPES:
                return detected_mime, False, f'Unsupported file type: {detected_mime}'
            
            # Check extension mismatch
            extension = os.path.splitext(file_path)[1].lower()
            is_extension_match = self._check_extension_match(detected_mime, extension)
            
            if not is_extension_match:
                message = f'Extension mismatch: {extension} vs {detected_mime}'
            else:
                message = 'OK'
            
            return detected_mime, True, message
            
        except Exception as e:
            return 'unknown', False, f'Detection error: {str(e)}'
    
    def _check_extension_match(self, mime_type: str, extension: str) -> bool:
        """Check if extension matches MIME type."""
        # Expected extensions per MIME type
        mime_to_ext = {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv'],
            'text/plain': ['.txt'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/tiff': ['.tif', '.tiff'],
            'image/gif': ['.gif'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/msword': ['.doc'],
        }
        
        expected = mime_to_ext.get(mime_type, [])
        return extension in expected or extension == ''


class UniversalFileLoader:
    """
    Universal file loader with MIME-based routing.
    
    Workflow:
    1. Detect true MIME type (magic bytes)
    2. Security validation
    3. Look up reader in registry
    4. Load file with appropriate reader
    5. Return unified Document object
    
    Usage:
        loader = UniversalFileLoader()
        document = loader.load('/path/to/file.pdf')
    """
    
    def __init__(
        self,
        mime_detector: Optional[MimeDetector] = None,
        registry: Optional[FileTypeRegistry] = None
    ):
        """
        Initialize file loader.
        
        Args:
            mime_detector: MIME type detector (default: MimeDetector)
            registry: Reader registry (default: global reader_registry)
        """
        self.mime_detector = mime_detector or MimeDetector()
        self.registry = registry or reader_registry
    
    def load(self, file_path: str) -> Document:
        """
        Load file with MIME-based routing.
        
        Args:
            file_path: Path to file
            
        Returns:
            Document object with loaded content
            
        Raises:
            ValueError: If file is unsafe or unsupported
            FileNotFoundError: If file doesn't exist
        """
        # Validate file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Extract file info
        file_name = os.path.basename(file_path)
        file_extension = os.path.splitext(file_path)[1].lower()
        
        # Detect MIME type
        mime_type, is_safe, message = self.mime_detector.detect(file_path)
        
        # Security check
        if not is_safe:
            raise ValueError(f"File rejected: {message}")
        
        # Create document
        document = Document(
            file_path=file_path,
            file_name=file_name,
            mime_type=mime_type,
            file_extension=file_extension
        )
        
        # Log extension mismatch warning
        if message != 'OK':
            document.add_warning(message)
        
        # Look up reader in registry
        reader_class = self.registry.get(mime_type)
        
        if reader_class is None:
            # No specific reader, use generic
            document.add_warning(f"No specific reader for {mime_type}, using generic")
            reader_class = self.registry.get('generic')
            
            if reader_class is None:
                raise ValueError(f"No reader available for {mime_type}")
        
        # Instantiate reader and load file
        try:
            reader = reader_class()
            reader.read(file_path, document)
            document.set_status(DocumentStatus.LOADED)
            
        except Exception as e:
            document.add_error(f"Failed to load file: {str(e)}")
            document.set_status(DocumentStatus.FAILED)
            raise ValueError(f"Failed to load file: {str(e)}")
        
        return document
    
    def can_load(self, file_path: str) -> tuple[bool, str]:
        """
        Check if file can be loaded without actually loading it.
        
        Args:
            file_path: Path to file
            
        Returns:
            Tuple of (can_load, message)
        """
        if not os.path.exists(file_path):
            return False, "File not found"
        
        mime_type, is_safe, message = self.mime_detector.detect(file_path)
        
        if not is_safe:
            return False, message
        
        if not self.registry.has(mime_type) and not self.registry.has('generic'):
            return False, f"No reader for {mime_type}"
        
        return True, "OK"
    
    def get_supported_types(self) -> list[str]:
        """Get list of supported MIME types."""
        return self.mime_detector.ALLOWED_MIME_TYPES
    
    def __repr__(self) -> str:
        """String representation."""
        return f"UniversalFileLoader(supported={len(self.get_supported_types())})"
