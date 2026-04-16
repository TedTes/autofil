"""
Financial Statement extractor for balance sheets and income statements.

Extracts financial data from:
- Balance Sheets (Assets, Liabilities, Equity)
- Income Statements (Revenue, Expenses, Net Income)
- Cash Flow Statements
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..core.schema import Metadata
from ..models.extraction_result import ExtractionResult
from ..parsers import TableParser, ExcelParser
from ..utils.canonical_output_builder import (
    SectionPayload,
    build_generic_canonical_output,
)


class FinancialStatementExtractor(IExtractor):
    """
    Extractor for Financial Statement documents.
    
    Extracts financial data including:
    - Balance Sheet items (Assets, Liabilities, Equity)
    - Income Statement items (Revenue, Expenses, Net Income)
    - Cash Flow items (Operating, Investing, Financing)
    - Period information and totals
    
    Supports PDF tables and Excel formats.
    """
    
    # Financial statement categories
    BALANCE_SHEET_CATEGORIES = {
        'assets': {
            'patterns': [
                r'(?:total\s+)?assets',
                r'current\s+assets',
                r'fixed\s+assets',
                r'cash',
                r'accounts\s+receivable',
                r'inventory',
                r'property.*equipment',
            ],
            'type': 'asset'
        },
        'liabilities': {
            'patterns': [
                r'(?:total\s+)?liabilities',
                r'current\s+liabilities',
                r'long.*term.*liabilities',
                r'accounts\s+payable',
                r'notes\s+payable',
                r'debt',
            ],
            'type': 'liability'
        },
        'equity': {
            'patterns': [
                r'(?:shareholders?\s+|stockholders?\s+)?equity',
                r'retained\s+earnings',
                r'common\s+stock',
                r'capital',
            ],
            'type': 'equity'
        }
    }
    
    INCOME_STATEMENT_CATEGORIES = {
        'revenue': {
            'patterns': [
                r'(?:total\s+)?revenue',
                r'(?:gross\s+)?sales',
                r'income',
                r'earnings',
            ],
            'type': 'revenue'
        },
        'expenses': {
            'patterns': [
                r'(?:total\s+)?expenses',
                r'cost.*(?:goods\s+sold|sales)',
                r'operating\s+expenses',
                r'(?:selling|general|administrative).*expenses',
                r'depreciation',
                r'interest\s+expense',
            ],
            'type': 'expense'
        },
        'net_income': {
            'patterns': [
                r'net\s+income',
                r'net\s+(?:profit|loss)',
                r'(?:net\s+)?earnings',
            ],
            'type': 'net_income'
        }
    }
    
    # Column patterns
    COLUMN_PATTERNS = {
        'account': [
            r'account',
            r'description',
            r'item',
            r'category',
        ],
        'amount': [
            r'amount',
            r'balance',
            r'value',
        ],
        'current_year': [
            r'(?:current\s+)?year',
            r'20\d{2}',
            r'ytd',
        ],
        'prior_year': [
            r'prior.*year',
            r'previous.*year',
            r'comparative',
        ],
    }
    
    def __init__(self):
        """Initialize Financial Statement extractor."""
        self.table_parser = TableParser(flavor='auto', min_confidence=60.0) if TableParser else None
        self.excel_parser = ExcelParser() if ExcelParser else None
    
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract financial statement data from document.
        
        Args:
            document: Document object with financial statement content
            
        Returns:
            ExtractionResult with extracted financial data
        """
        try:
            # Verify document type
            if document.document_type != DocumentType.FINANCIAL_STATEMENT:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected FINANCIAL_STATEMENT, got {document.document_type.value}"]
                )
            
            # Extract from tables (PDF)
            if document.tables:
                result = self._extract_from_tables(document)
                if result.success:
                    return result
            
            # Extract from Excel
            if document.file_extension in ['.xlsx', '.xls', '.csv']:
                result = self._extract_from_excel(document)
                if result.success:
                    return result
            
            return ExtractionResult(
                success=False,
                data={},
                errors=["No extractable financial data found"]
            )
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract from document."""
        return (
            document.document_type == DocumentType.FINANCIAL_STATEMENT and
            (bool(document.tables) or document.file_extension in ['.xlsx', '.xls', '.csv'])
        )
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported document types."""
        return [DocumentType.FINANCIAL_STATEMENT]
    
    def _extract_from_tables(self, document: Document) -> ExtractionResult:
        """Extract financial data from table data."""
        line_items = []
        warnings = []
        
        # Determine statement type
        statement_type = self._detect_statement_type(document)
        
        for table_idx, table in enumerate(document.tables):
            # Map columns to fields
            column_map = self._map_columns(table.headers)
            
            if not column_map:
                warnings.append(f"Table {table_idx}: Could not map columns")
                continue
            
            # Extract line items from rows
            for row_idx, row in enumerate(table.rows):
                try:
                    item = self._extract_line_item(row, column_map, statement_type)
                    if item and self._is_valid_line_item(item):
                        item['_source'] = {
                            'table_index': table_idx,
                            'row_index': row_idx
                        }
                        line_items.append(item)
                except Exception as e:
                    warnings.append(f"Table {table_idx}, Row {row_idx}: {str(e)}")
        
        if not line_items:
            return ExtractionResult(
                success=False,
                data={},
                errors=["No valid financial line items found"]
            )
        
        # Organize by category
        categorized = self._categorize_line_items(line_items, statement_type)
        
        # Calculate totals
        totals = self._calculate_totals(categorized, statement_type)
        
        # Extract statement metadata
        metadata = self._extract_statement_metadata(document)
        
        data = {
            'document_type': 'financial_statement',
            'extraction_date': datetime.utcnow().isoformat(),
            'statement_type': statement_type,
            'statement_metadata': metadata,
            'line_items': categorized,
            'totals': totals,
            'item_count': len(line_items),
        }

        canonical = build_generic_canonical_output(
            document,
            section_payloads=[
                SectionPayload(
                    key="financial_statement",
                    display_name="Financial Statement",
                    description=f"{statement_type.replace('_', ' ').title()} summary",
                    fields={
                        "statementType": statement_type,
                        "statementMetadata": metadata,
                        "lineItems": categorized,
                        "totals": totals,
                        "itemCount": len(line_items),
                        "extractionDate": data["extraction_date"],
                    },
                )
            ],
            extraction_method="table_parser",
            metadata=Metadata(
                form_type_detected="FINANCIAL_STATEMENT",
                line_of_business=document.metadata.get("line_of_business")
                if document.metadata
                else None,
            ),
            raw=data,
        )
        
        return ExtractionResult(
            success=True,
            data=canonical.to_dict(),
            warnings=warnings,
            confidence=self._calculate_confidence(line_items, warnings)
        )
    
    def _extract_from_excel(self, document: Document) -> ExtractionResult:
        """Extract financial data from Excel file."""
        if not self.excel_parser:
            return ExtractionResult(
                success=False,
                data={},
                errors=["Excel parser is not available"]
            )

        excel_result = self.excel_parser.extract_fields(document.file_path)
        
        if not excel_result.get('sheets'):
            return ExtractionResult(
                success=False,
                data={},
                errors=["No sheets found in Excel file"]
            )
        
        # Use first sheet
        sheet_data = excel_result['sheets'][0]
        headers = sheet_data.get('headers', [])
        rows = sheet_data.get('rows', [])
        
        if not headers or not rows:
            return ExtractionResult(
                success=False,
                data={},
                errors=["No data found in Excel sheet"]
            )
        
        # Determine statement type from headers/content
        statement_type = self._detect_statement_type_from_text(' '.join(headers))
        
        # Map columns
        column_map = self._map_columns(headers)
        
        if not column_map:
            return ExtractionResult(
                success=False,
                data={},
                errors=["Could not map Excel columns"]
            )
        
        # Extract line items
        line_items = []
        warnings = []
        
        for row_idx, row in enumerate(rows):
            try:
                item = self._extract_line_item(row, column_map, statement_type)
                if item and self._is_valid_line_item(item):
                    item['_source'] = {
                        'sheet_index': 0,
                        'row_index': row_idx
                    }
                    line_items.append(item)
            except Exception as e:
                warnings.append(f"Row {row_idx}: {str(e)}")
        
        if not line_items:
            return ExtractionResult(
                success=False,
                data={},
                errors=["No valid line items found in Excel"]
            )
        
        # Organize and calculate
        categorized = self._categorize_line_items(line_items, statement_type)
        totals = self._calculate_totals(categorized, statement_type)
        
        data = {
            'document_type': 'financial_statement',
            'extraction_date': datetime.utcnow().isoformat(),
            'statement_type': statement_type,
            'statement_metadata': {},
            'line_items': categorized,
            'totals': totals,
            'item_count': len(line_items),
        }

        canonical = build_generic_canonical_output(
            document,
            section_payloads=[
                SectionPayload(
                    key="financial_statement",
                    display_name="Financial Statement",
                    description=f"{statement_type.replace('_', ' ').title()} summary",
                    fields={
                        "statementType": statement_type,
                        "lineItems": categorized,
                        "totals": totals,
                        "itemCount": len(line_items),
                        "extractionDate": data["extraction_date"],
                    },
                )
            ],
            extraction_method="excel_parser",
            metadata=Metadata(
                form_type_detected="FINANCIAL_STATEMENT",
                line_of_business=document.metadata.get("line_of_business")
                if document.metadata
                else None,
            ),
            raw=data,
        )

        return ExtractionResult(
            success=True,
            data=canonical.to_dict(),
            warnings=warnings,
            confidence=self._calculate_confidence(line_items, warnings)
        )
    
    def _detect_statement_type(self, document: Document) -> str:
        """Detect type of financial statement."""
        text = document.raw_text.lower() if document.raw_text else ''
        
        # Check for balance sheet indicators
        balance_sheet_terms = ['balance sheet', 'assets', 'liabilities', 'equity']
        if any(term in text for term in balance_sheet_terms):
            return 'balance_sheet'
        
        # Check for income statement indicators
        income_terms = ['income statement', 'profit and loss', 'revenue', 'expenses']
        if any(term in text for term in income_terms):
            return 'income_statement'
        
        # Check for cash flow indicators
        cash_flow_terms = ['cash flow', 'operating activities', 'investing activities']
        if any(term in text for term in cash_flow_terms):
            return 'cash_flow'
        
        return 'unknown'
    
    def _detect_statement_type_from_text(self, text: str) -> str:
        """Detect statement type from text content."""
        text_lower = text.lower()
        
        if any(term in text_lower for term in ['balance sheet', 'assets', 'liabilities']):
            return 'balance_sheet'
        elif any(term in text_lower for term in ['income statement', 'revenue', 'expenses']):
            return 'income_statement'
        elif any(term in text_lower for term in ['cash flow', 'operating activities']):
            return 'cash_flow'
        
        return 'unknown'
    
    def _map_columns(self, headers: List[str]) -> Dict[str, int]:
        """Map table columns to fields."""
        column_map = {}
        headers_lower = [h.lower() for h in headers]
        
        for field, patterns in self.COLUMN_PATTERNS.items():
            for col_idx, header in enumerate(headers_lower):
                for pattern in patterns:
                    import re
                    if re.search(pattern, header, re.IGNORECASE):
                        column_map[field] = col_idx
                        break
                if field in column_map:
                    break
        
        return column_map
    
    def _extract_line_item(
        self,
        row: List[str],
        column_map: Dict[str, int],
        statement_type: str
    ) -> Optional[Dict[str, Any]]:
        """Extract line item from row."""
        item = {}
        
        # Extract account/description
        if 'account' in column_map:
            col_idx = column_map['account']
            if col_idx < len(row):
                account = str(row[col_idx]).strip() if row[col_idx] else ''
                if account:
                    item['account'] = account
        
        # Extract amount
        if 'amount' in column_map:
            col_idx = column_map['amount']
            if col_idx < len(row):
                amount = self._parse_amount(row[col_idx])
                if amount is not None:
                    item['amount'] = amount
        
        # Extract current year
        if 'current_year' in column_map:
            col_idx = column_map['current_year']
            if col_idx < len(row):
                amount = self._parse_amount(row[col_idx])
                if amount is not None:
                    item['current_year'] = amount
        
        # Extract prior year
        if 'prior_year' in column_map:
            col_idx = column_map['prior_year']
            if col_idx < len(row):
                amount = self._parse_amount(row[col_idx])
                if amount is not None:
                    item['prior_year'] = amount
        
        # Categorize the line item
        if 'account' in item:
            item['category'] = self._categorize_account(item['account'], statement_type)
        
        return item if item else None
    
    def _is_valid_line_item(self, item: Dict[str, Any]) -> bool:
        """Check if line item is valid."""
        has_account = bool(item.get('account'))
        has_amount = bool(
            item.get('amount') is not None or
            item.get('current_year') is not None
        )
        return has_account and has_amount
    
    def _categorize_account(self, account: str, statement_type: str) -> str:
        """Categorize account based on name."""
        account_lower = account.lower()
        
        if statement_type == 'balance_sheet':
            categories = self.BALANCE_SHEET_CATEGORIES
        elif statement_type == 'income_statement':
            categories = self.INCOME_STATEMENT_CATEGORIES
        else:
            return 'other'
        
        for category_name, category_info in categories.items():
            for pattern in category_info['patterns']:
                import re
                if re.search(pattern, account_lower, re.IGNORECASE):
                    return category_name
        
        return 'other'
    
    def _categorize_line_items(
        self,
        line_items: List[Dict[str, Any]],
        statement_type: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Organize line items by category."""
        categorized = {}
        
        for item in line_items:
            category = item.get('category', 'other')
            if category not in categorized:
                categorized[category] = []
            categorized[category].append(item)
        
        return categorized
    
    def _calculate_totals(
        self,
        categorized: Dict[str, List[Dict[str, Any]]],
        statement_type: str
    ) -> Dict[str, Any]:
        """Calculate totals by category."""
        totals = {}
        
        for category, items in categorized.items():
            category_total = 0.0
            for item in items:
                amount = item.get('amount') or item.get('current_year') or 0.0
                category_total += amount
            
            totals[f'{category}_total'] = category_total
        
        # Calculate net for income statements
        if statement_type == 'income_statement':
            revenue = totals.get('revenue_total', 0.0)
            expenses = totals.get('expenses_total', 0.0)
            totals['net_income'] = revenue - expenses
        
        # Calculate equity for balance sheets
        elif statement_type == 'balance_sheet':
            assets = totals.get('assets_total', 0.0)
            liabilities = totals.get('liabilities_total', 0.0)
            equity = totals.get('equity_total', 0.0)
            
            # Verify accounting equation: Assets = Liabilities + Equity
            expected_assets = liabilities + equity
            if abs(assets - expected_assets) > 1.0:  # Allow $1 rounding difference
                totals['balance_check'] = {
                    'balanced': False,
                    'difference': assets - expected_assets
                }
            else:
                totals['balance_check'] = {'balanced': True}
        
        return totals
    
    def _extract_statement_metadata(self, document: Document) -> Dict[str, Any]:
        """Extract statement metadata."""
        metadata = {}
        
        if document.raw_text:
            text = document.raw_text
            
            # Extract company name
            import re
            company_match = re.search(
                r'(?:company|corporation|inc|llc)[:\s]+([^\n]+)',
                text,
                re.IGNORECASE
            )
            if company_match:
                metadata['company_name'] = company_match.group(1).strip()
            
            # Extract period ending
            period_match = re.search(
                r'(?:period|year).*ending[:\s]+([0-9/\-]+)',
                text,
                re.IGNORECASE
            )
            if period_match:
                metadata['period_ending'] = period_match.group(1).strip()
            
            # Extract fiscal year
            year_match = re.search(r'fiscal\s+year[:\s]+(\d{4})', text, re.IGNORECASE)
            if year_match:
                metadata['fiscal_year'] = year_match.group(1)
        
        return metadata
    
    def _parse_amount(self, amount_str: Any) -> Optional[float]:
        """Parse amount string to float."""
        if amount_str is None:
            return None
        
        amount_str = str(amount_str)
        
        # Remove currency symbols, commas, whitespace
        import re
        cleaned = re.sub(r'[$,\s]', '', amount_str)
        
        # Handle parentheses as negative
        if '(' in cleaned and ')' in cleaned:
            cleaned = '-' + cleaned.replace('(', '').replace(')', '')
        
        try:
            return float(cleaned)
        except ValueError:
            return None
    
    def _calculate_confidence(
        self,
        line_items: List[Dict[str, Any]],
        warnings: List[str]
    ) -> float:
        """Calculate extraction confidence."""
        if not line_items:
            return 0.0
        
        confidence = 0.7
        
        # Bonus for multiple items
        if len(line_items) >= 5:
            confidence += 0.1
        
        # Bonus for categorized items
        categorized_items = sum(1 for item in line_items if item.get('category') != 'other')
        if line_items:
            category_ratio = categorized_items / len(line_items)
            confidence += category_ratio * 0.1
        
        # Penalty for warnings
        confidence -= len(warnings) * 0.05
        
        return max(0.0, min(1.0, confidence))
    
    def __repr__(self) -> str:
        return "FinancialStatementExtractor()"
