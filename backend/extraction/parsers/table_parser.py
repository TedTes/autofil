"""
Table extraction parser for PDFs and images.

The parser prefers lightweight built-in extraction and treats heavier engines
as optional integrations. If Camelot or Tabula are not installed, the parser
falls back cleanly to ``pdfplumber`` instead of failing at import time.
"""

import os
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
import importlib
import pdfplumber
from ..interfaces.parser import IParser


@dataclass
class TableExtractionResult:
    """Result from table extraction."""
    tables: List[Dict[str, Any]]
    method: str
    confidence: float
    warnings: List[str]


class TableParser(IParser):
    """
    Multi-library table extraction parser.
    
    Tries multiple extraction methods in order:
    1. Camelot (lattice mode) - for bordered tables
    2. Camelot (stream mode) - for borderless tables
    3. Tabula - for stream-based tables
    4. pdfplumber - for complex layouts
    
    Features:
    - Automatic method selection
    - Confidence scoring
    - Header detection
    - Data type inference
    - Empty row filtering
    """
    
    # Minimum confidence threshold for accepting results
    MIN_CONFIDENCE = 60.0
    
    # Minimum table size (rows x cols)
    MIN_TABLE_SIZE = (2, 2)  # At least 2 rows and 2 columns
    
    def __init__(
        self,
        flavor: str = 'auto',
        min_confidence: float = MIN_CONFIDENCE,
        detect_headers: bool = True
    ):
        """
        Initialize table parser.
        
        Args:
            flavor: Extraction method ('auto', 'camelot', 'tabula', 'pdfplumber')
            min_confidence: Minimum confidence to accept results (0-100)
            detect_headers: Whether to auto-detect table headers
        """
        self.flavor = flavor
        self.min_confidence = min_confidence
        self.detect_headers = detect_headers

    @staticmethod
    def _optional_import(module_name: str):
        try:
            return importlib.import_module(module_name)
        except ImportError:
            return None
    
    def extract_fields(self, pdf_path: str) -> Dict[str, Any]:
        """
        Extract tables from PDF document.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            Dictionary with extracted tables and metadata
            {
                'tables': [
                    {
                        'headers': ['col1', 'col2', ...],
                        'rows': [[val1, val2, ...], ...],
                        'page': 1,
                        'table_index': 0,
                        'confidence': 85.5
                    },
                    ...
                ],
                'table_count': 3,
                'method': 'camelot_lattice',
                'confidence': 82.3,
                'warnings': []
            }
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"File not found: {pdf_path}")
        
        if self.flavor == 'auto':
            return self._extract_auto(pdf_path)
        elif self.flavor == 'camelot':
            return self._extract_with_camelot(pdf_path)
        elif self.flavor == 'tabula':
            return self._extract_with_tabula(pdf_path)
        elif self.flavor == 'pdfplumber':
            return self._extract_with_pdfplumber(pdf_path)
        else:
            raise ValueError(f"Unknown flavor: {self.flavor}")
    
    def _extract_auto(self, pdf_path: str) -> Dict[str, Any]:
        """
        Auto-select best extraction method.
        
        Tries methods in order of reliability:
        1. Camelot lattice (bordered tables)
        2. Camelot stream (borderless tables)
        3. Tabula
        4. pdfplumber
        """
        methods = [
            ('camelot_lattice', lambda: self._extract_camelot_lattice(pdf_path)),
            ('camelot_stream', lambda: self._extract_camelot_stream(pdf_path)),
            ('tabula', lambda: self._extract_with_tabula(pdf_path)),
            ('pdfplumber', lambda: self._extract_with_pdfplumber(pdf_path))
        ]
        
        best_result = None
        best_confidence = 0
        all_warnings = []
        
        for method_name, method_func in methods:
            try:
                result = method_func()
                
                # Check if result meets minimum requirements
                if result['table_count'] > 0 and result['confidence'] >= self.min_confidence:
                    if result['confidence'] > best_confidence:
                        best_result = result
                        best_confidence = result['confidence']
                    
                    # If confidence is very high, stop trying
                    if result['confidence'] >= 90:
                        return result
                
                all_warnings.extend(result.get('warnings', []))
                
            except Exception as e:
                all_warnings.append(f"{method_name} failed: {str(e)}")
        
        if best_result:
            best_result['warnings'] = all_warnings
            return best_result
        
        # No method succeeded
        return {
            'tables': [],
            'table_count': 0,
            'method': 'none',
            'confidence': 0,
            'warnings': all_warnings + ['All extraction methods failed']
        }
    
    def _extract_with_camelot(self, pdf_path: str) -> Dict[str, Any]:
        """Extract using Camelot (tries both lattice and stream)."""
        # Try lattice first (for bordered tables)
        result = self._extract_camelot_lattice(pdf_path)
        
        if result['table_count'] > 0 and result['confidence'] >= self.min_confidence:
            return result
        
        # Try stream mode (for borderless tables)
        result = self._extract_camelot_stream(pdf_path)
        return result
    
    def _extract_camelot_lattice(self, pdf_path: str) -> Dict[str, Any]:
        """Extract using Camelot lattice mode (bordered tables)."""
        camelot = self._optional_import('camelot')
        if camelot is None:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'camelot_lattice',
                'confidence': 0,
                'warnings': ['Camelot not installed; skipping lattice extraction']
            }
        try:
            tables = camelot.read_pdf(
                pdf_path,
                pages='all',
                flavor='lattice',
                strip_text='\n'
            )
            
            return self._process_camelot_tables(tables, 'camelot_lattice')
            
        except Exception as e:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'camelot_lattice',
                'confidence': 0,
                'warnings': [f"Camelot lattice failed: {str(e)}"]
            }
    
    def _extract_camelot_stream(self, pdf_path: str) -> Dict[str, Any]:
        """Extract using Camelot stream mode (borderless tables)."""
        camelot = self._optional_import('camelot')
        if camelot is None:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'camelot_stream',
                'confidence': 0,
                'warnings': ['Camelot not installed; skipping stream extraction']
            }
        try:
            tables = camelot.read_pdf(
                pdf_path,
                pages='all',
                flavor='stream',
                strip_text='\n'
            )
            
            return self._process_camelot_tables(tables, 'camelot_stream')
            
        except Exception as e:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'camelot_stream',
                'confidence': 0,
                'warnings': [f"Camelot stream failed: {str(e)}"]
            }
    
    def _process_camelot_tables(
        self,
        tables: 'camelot.core.TableList',
        method: str
    ) -> Dict[str, Any]:
        """Process Camelot table results."""
        extracted_tables = []
        total_confidence = 0
        warnings = []
        
        for idx, table in enumerate(tables):
            # Get table data
            df = table.df
            
            # Skip empty tables
            if df.empty or df.shape[0] < self.MIN_TABLE_SIZE[0] or df.shape[1] < self.MIN_TABLE_SIZE[1]:
                continue
            
            # Extract headers and rows
            headers, rows = self._extract_headers_and_rows(df)
            
            # Get Camelot's accuracy score
            confidence = table.parsing_report.get('accuracy', 0)
            
            extracted_tables.append({
                'headers': headers,
                'rows': rows,
                'page': table.page,
                'table_index': idx,
                'confidence': round(confidence, 2),
                'row_count': len(rows),
                'column_count': len(headers)
            })
            
            total_confidence += confidence
        
        avg_confidence = total_confidence / len(extracted_tables) if extracted_tables else 0
        
        return {
            'tables': extracted_tables,
            'table_count': len(extracted_tables),
            'method': method,
            'confidence': round(avg_confidence, 2),
            'warnings': warnings
        }
    
    def _extract_with_tabula(self, pdf_path: str) -> Dict[str, Any]:
        """Extract using Tabula."""
        tabula = self._optional_import('tabula')
        if tabula is None:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'tabula',
                'confidence': 0,
                'warnings': ['Tabula not installed; skipping extraction']
            }
        try:
            # Read all tables from PDF
            dfs = tabula.read_pdf(
                pdf_path,
                pages='all',
                multiple_tables=True,
                pandas_options={'header': None}
            )
            
            extracted_tables = []
            warnings = []
            
            for idx, df in enumerate(dfs):
                # Skip empty tables
                if df.empty or df.shape[0] < self.MIN_TABLE_SIZE[0] or df.shape[1] < self.MIN_TABLE_SIZE[1]:
                    continue
                
                # Extract headers and rows
                headers, rows = self._extract_headers_and_rows(df)
                
                # Tabula doesn't provide confidence, estimate based on completeness
                confidence = self._estimate_confidence(df)
                
                extracted_tables.append({
                    'headers': headers,
                    'rows': rows,
                    'page': idx + 1,  # Approximation
                    'table_index': idx,
                    'confidence': confidence,
                    'row_count': len(rows),
                    'column_count': len(headers)
                })
            
            avg_confidence = sum(t['confidence'] for t in extracted_tables) / len(extracted_tables) if extracted_tables else 0
            
            return {
                'tables': extracted_tables,
                'table_count': len(extracted_tables),
                'method': 'tabula',
                'confidence': round(avg_confidence, 2),
                'warnings': warnings
            }
            
        except Exception as e:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'tabula',
                'confidence': 0,
                'warnings': [f"Tabula failed: {str(e)}"]
            }
    
    def _extract_with_pdfplumber(self, pdf_path: str) -> Dict[str, Any]:
        """Extract using pdfplumber."""
        try:
            extracted_tables = []
            warnings = []
            
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    tables = page.extract_tables()
                    
                    for table_idx, table in enumerate(tables):
                        if not table or len(table) < self.MIN_TABLE_SIZE[0]:
                            continue
                        
                        # Convert to list format
                        table_data = [[cell if cell else '' for cell in row] for row in table]
                        
                        # Extract headers and rows
                        headers = [str(cell).strip() for cell in table_data[0]]
                        rows = [[str(cell).strip() for cell in row] for row in table_data[1:]]
                        
                        # Filter empty rows
                        rows = [row for row in rows if any(row)]
                        
                        if not rows:
                            continue
                        
                        # Estimate confidence
                        confidence = self._estimate_table_confidence(headers, rows)
                        
                        extracted_tables.append({
                            'headers': headers,
                            'rows': rows,
                            'page': page_num,
                            'table_index': table_idx,
                            'confidence': confidence,
                            'row_count': len(rows),
                            'column_count': len(headers)
                        })
            
            avg_confidence = sum(t['confidence'] for t in extracted_tables) / len(extracted_tables) if extracted_tables else 0
            
            return {
                'tables': extracted_tables,
                'table_count': len(extracted_tables),
                'method': 'pdfplumber',
                'confidence': round(avg_confidence, 2),
                'warnings': warnings
            }
            
        except Exception as e:
            return {
                'tables': [],
                'table_count': 0,
                'method': 'pdfplumber',
                'confidence': 0,
                'warnings': [f"pdfplumber failed: {str(e)}"]
            }
    
    def _extract_headers_and_rows(self, df) -> Tuple[List[str], List[List[str]]]:
        """
        Extract headers and data rows from DataFrame.
        
        Args:
            df: pandas DataFrame
            
        Returns:
            Tuple of (headers, rows)
        """
        if self.detect_headers:
            # First row as headers
            headers = [str(val).strip() for val in df.iloc[0]]
            rows = df.iloc[1:].values.tolist()
        else:
            # Use column indices as headers
            headers = [f"col_{i}" for i in range(len(df.columns))]
            rows = df.values.tolist()
        
        # Convert all values to strings and strip
        rows = [[str(val).strip() for val in row] for row in rows]
        
        # Filter out empty rows
        rows = [row for row in rows if any(val for val in row)]
        
        return headers, rows
    
    def _estimate_confidence(self, df) -> float:
        """
        Estimate table extraction confidence based on data completeness.
        
        Args:
            df: pandas DataFrame
            
        Returns:
            Confidence score (0-100)
        """
        if df.empty:
            return 0
        
        # Calculate percentage of non-empty cells
        total_cells = df.size
        non_empty = df.count().sum()
        completeness = (non_empty / total_cells) * 100
        
        # Penalize if too few rows
        if len(df) < 3:
            completeness *= 0.7
        
        # Penalize if too few columns
        if len(df.columns) < 2:
            completeness *= 0.7
        
        return min(100, completeness)
    
    def _estimate_table_confidence(self, headers: List[str], rows: List[List[str]]) -> float:
        """
        Estimate confidence based on headers and rows.
        
        Args:
            headers: Table headers
            rows: Table data rows
            
        Returns:
            Confidence score (0-100)
        """
        if not rows:
            return 0
        
        # Calculate cell completeness
        total_cells = len(rows) * len(headers)
        non_empty_cells = sum(1 for row in rows for cell in row if cell and cell.strip())
        completeness = (non_empty_cells / total_cells) * 100
        
        # Bonus for meaningful headers (not just numbers or single chars)
        meaningful_headers = sum(1 for h in headers if len(h) > 2 and not h.isdigit())
        header_bonus = (meaningful_headers / len(headers)) * 10
        
        confidence = min(100, completeness + header_bonus)
        return round(confidence, 2)
    
    def is_fillable(self, pdf_path: str) -> bool:
        """
        Table parser doesn't work with fillable fields.
        
        Args:
            pdf_path: Path to PDF
            
        Returns:
            Always False
        """
        return False
    
    def find_table_by_headers(
        self,
        result: Dict[str, Any],
        header_keywords: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Find a table by header keywords.
        
        Args:
            result: Extraction result from extract_fields()
            header_keywords: Keywords to match in headers (case-insensitive)
            
        Returns:
            First matching table or None
        """
        for table in result['tables']:
            headers_lower = [h.lower() for h in table['headers']]
            
            # Check if all keywords are found in headers
            if all(
                any(keyword.lower() in h for h in headers_lower)
                for keyword in header_keywords
            ):
                return table
        
        return None
    
    def find_tables_on_page(
        self,
        result: Dict[str, Any],
        page_num: int
    ) -> List[Dict[str, Any]]:
        """
        Get all tables from a specific page.
        
        Args:
            result: Extraction result from extract_fields()
            page_num: Page number (1-indexed)
            
        Returns:
            List of tables on that page
        """
        return [
            table for table in result['tables']
            if table['page'] == page_num
        ]
    
    def __repr__(self) -> str:
        """String representation."""
        return (
            f"TableParser(flavor='{self.flavor}', "
            f"min_confidence={self.min_confidence})"
        )
