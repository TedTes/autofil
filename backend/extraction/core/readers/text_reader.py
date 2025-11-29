"""
Text file reader implementation.

Auto-registers for text MIME types.
"""

from .base_reader import BaseReader
from ..document import Document
from ..file_loader import reader_registry


@reader_registry.register('text/plain')
class TextReader(BaseReader):
    """
    Plain text file reader.
    
    Reads text files and populates document.
    Auto-registered for text MIME types.
    """
    
    def read(self, file_path: str, document: Document) -> None:
        """
        Read text file and populate document.
        
        Args:
            file_path: Path to text file
            document: Document object to populate
        """
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                document.raw_text = f.read()
            
            # Store metadata
            line_count = document.raw_text.count('\n') + 1
            char_count = len(document.raw_text)
            word_count = len(document.raw_text.split())
            
            document.metadata['line_count'] = line_count
            document.metadata['char_count'] = char_count
            document.metadata['word_count'] = word_count
            document.structure.page_count = 1
            
        except Exception as e:
            document.add_error(f"Failed to read text file: {str(e)}")
            raise