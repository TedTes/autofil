"""
Parser registry for managing all available parsers.

Provides centralized access to parsers and their capabilities.
"""

import logging
from typing import Dict, Type, List, Optional
from ..interfaces.parser import IParser

logger = logging.getLogger(__name__)


class ParserRegistry:
    """
    Registry for all available parsers.
    
    Allows dynamic parser discovery and selection based on file type.
    """
    
    def __init__(self):
        """Initialize parser registry."""
        self._parsers: Dict[str, Type[IParser]] = {}
        self._register_default_parsers()
    
    def _register_default_parsers(self):
        """Register default parsers."""
        # Import parsers
        try:
            from .pdf_field_parser import PdfFieldParser
            self.register('pdf_field', PdfFieldParser)
        except ImportError as exc:
            logger.warning("failed to register pdf_field parser: %s", exc)
        
        try:
            from .ocr_parser import OcrParser, OcrFallbackParser
            self.register('ocr', OcrParser)
            self.register('ocr_fallback', OcrFallbackParser)
        except ImportError as exc:
            logger.warning("failed to register ocr parsers: %s", exc)
        
        try:
            from .table_parser import TableParser
            self.register('table', TableParser)
        except ImportError as exc:
            logger.warning("failed to register table parser: %s", exc)
        
        try:
            from .excel_parser import ExcelParser
            self.register('excel', ExcelParser)
        except ImportError as exc:
            logger.warning("failed to register excel parser: %s", exc)
        
        try:
            from .image_parser import ImageParser
            self.register('image', ImageParser)
        except ImportError as exc:
            logger.warning("failed to register image parser: %s", exc)
    
    def register(self, name: str, parser_class: Type[IParser]):
        """
        Register a parser.
        
        Args:
            name: Parser name/identifier
            parser_class: Parser class
        """
        self._parsers[name] = parser_class
    
    def get(self, name: str) -> Optional[Type[IParser]]:
        """
        Get parser class by name.
        
        Args:
            name: Parser name
            
        Returns:
            Parser class or None if not found
        """
        return self._parsers.get(name)
    
    def get_all(self) -> Dict[str, Type[IParser]]:
        """
        Get all registered parsers.
        
        Returns:
            Dictionary of parser name to parser class
        """
        return self._parsers.copy()
    
    def list_parsers(self) -> List[str]:
        """
        Get list of available parser names.
        
        Returns:
            List of parser names
        """
        return list(self._parsers.keys())
    
    def has_parser(self, name: str) -> bool:
        """
        Check if parser is available.
        
        Args:
            name: Parser name
            
        Returns:
            True if parser is registered
        """
        return name in self._parsers
    
    def get_parser_for_file(self, file_path: str) -> Optional[Type[IParser]]:
        """
        Get appropriate parser for file type.
        
        Args:
            file_path: Path to file
            
        Returns:
            Parser class or None if no suitable parser found
        """
        import os
        
        ext = os.path.splitext(file_path)[1].lower()
        
        # Map extensions to parsers
        extension_map = {
            '.pdf': 'pdf_field',
            '.xlsx': 'excel',
            '.xls': 'excel',
            '.xlsm': 'excel',
            '.csv': 'excel',
            '.tsv': 'excel',
            '.jpg': 'image',
            '.jpeg': 'image',
            '.png': 'image',
            '.tiff': 'image',
            '.tif': 'image',
            '.bmp': 'image',
            '.gif': 'image',
            '.webp': 'image'
        }
        
        parser_name = extension_map.get(ext)
        if parser_name:
            return self.get(parser_name)
        
        return None
    
    def get_parser_info(self) -> Dict[str, Dict[str, any]]:
        """
        Get information about all parsers.
        
        Returns:
            Dictionary with parser information
        """
        info = {}
        
        for name, parser_class in self._parsers.items():
            info[name] = {
                'name': name,
                'class': parser_class.__name__,
                'available': True,
                'description': parser_class.__doc__.split('\n')[0] if parser_class.__doc__ else ''
            }
        
        return info
    
    def __repr__(self) -> str:
        """String representation."""
        return f"ParserRegistry(parsers={len(self._parsers)})"


# Global parser registry instance
parser_registry = ParserRegistry()
