"""
PDF reader implementation with enhanced extraction.

Auto-registers for PDF MIME types.
"""

import os
from pypdf import PdfReader as PyPdfReader
import pdfplumber
from .base_reader import BaseReader
from ..document import Document, TableData
from ..file_loader import reader_registry


@reader_registry.register('application/pdf')
class PdfReader(BaseReader):
    """
    Enhanced PDF file reader.
    
    Extracts text, tables, metadata, and structure from PDF files.
    Uses multiple libraries for robust extraction.
    Auto-registered for 'application/pdf' MIME type.
    """
    
    def read(self, file_path: str, document: Document) -> None:
        """
        Read PDF file and populate document.
        
        Args:
            file_path: Path to PDF file
            document: Document object to populate
        """
        try:
            # Use pypdf for metadata and basic text
            self._extract_with_pypdf(file_path, document)
            
            # Use pdfplumber for tables and enhanced text
            self._extract_with_pdfplumber(file_path, document)
            
        except Exception as e:
            document.add_error(f"Failed to read PDF: {str(e)}")
            raise
    
    def _extract_with_pypdf(self, file_path: str, document: Document):
        """Extract metadata and text using pypdf."""
        try:
            reader = PyPdfReader(file_path)
            
            # Extract metadata
            if reader.metadata:
                document.metadata['title'] = reader.metadata.get('/Title', '')
                document.metadata['author'] = reader.metadata.get('/Author', '')
                document.metadata['subject'] = reader.metadata.get('/Subject', '')
                document.metadata['creator'] = reader.metadata.get('/Creator', '')
                document.metadata['producer'] = reader.metadata.get('/Producer', '')
                
                if '/CreationDate' in reader.metadata:
                    document.metadata['creation_date'] = str(reader.metadata['/CreationDate'])
                if '/ModDate' in reader.metadata:
                    document.metadata['modification_date'] = str(reader.metadata['/ModDate'])
            
            # Extract structure info
            document.structure.page_count = len(reader.pages)
            
            # Check for fillable fields
            fields = reader.get_fields()
            if fields:
                document.structure.has_fillable_fields = True
                document.metadata['field_count'] = len(fields)
                document.metadata['field_names'] = list(fields.keys())[:50]  # TODO:First 50 field names
            
            # Extract text from all pages
            text_content = []
            for page_num, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_content.append(f"=== Page {page_num + 1} ===\n{page_text}")
                except Exception as e:
                    document.add_warning(f"Failed to extract text from page {page_num + 1}: {e}")
            
            document.raw_text = '\n\n'.join(text_content)
            
            # Check if PDF has text content
            if not document.raw_text.strip():
                document.add_warning("PDF contains no text - may be scanned document requiring OCR")
                document.metadata['requires_ocr'] = True
            else:
                document.metadata['requires_ocr'] = False
                
        except Exception as e:
            document.add_warning(f"pypdf extraction failed: {e}")
    
    def _extract_with_pdfplumber(self, file_path: str, document: Document):
        """Extract tables and enhanced text using pdfplumber."""
        try:
            with pdfplumber.open(file_path) as pdf:
                # Extract tables from all pages
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    
                    for table_idx, table in enumerate(tables):
                        if not table or len(table) < 2:
                            continue
                        
                        # First row as headers
                        headers = [str(cell).strip() if cell else '' for cell in table[0]]
                        
                        # Remaining rows as data
                        rows = []
                        for row in table[1:]:
                            row_data = [str(cell).strip() if cell else '' for cell in row]
                            if any(row_data):  # Skip empty rows
                                rows.append(row_data)
                        
                        if rows:
                            table_data = TableData(
                                headers=headers,
                                rows=rows,
                                metadata={
                                    'page': page_num + 1,
                                    'table_index': table_idx,
                                    'row_count': len(rows),
                                    'column_count': len(headers)
                                }
                            )
                            document.add_table(table_data)
                
                # Store page dimensions
                if pdf.pages:
                    first_page = pdf.pages[0]
                    document.metadata['page_width'] = first_page.width
                    document.metadata['page_height'] = first_page.height
                
        except Exception as e:
            document.add_warning(f"pdfplumber extraction failed: {e}")