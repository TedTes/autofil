"""
Table structure classifier.

Analyzes table structure and column headers to determine document type.
Particularly effective for Loss Runs and SOVs.
"""

import re
from typing import List, Dict, Any, Tuple, Set
from ..interfaces.classifier import IClassifier
from ..core.document import Document, DocumentType


class TableClassifier(IClassifier):
    """
    Table structure-based classifier.
    
    Analyzes tables in document to determine type:
    - Loss Runs: Tables with claim-related columns
    - SOVs: Tables with property/location columns
    - Financial Statements: Tables with financial columns
    
    High confidence when table structure strongly matches pattern.
    """
    
    # Column header patterns for each document type
    TABLE_PATTERNS = {
        DocumentType.LOSS_RUN: {
            'required_columns': [
                r'claim.*(number|no|#|id)',
                r'(date|dt).*(loss|accident|occurrence)',
            ],
            'strong_columns': [
                r'(paid|incurred|reserve)',
                r'total.*paid',
                r'total.*incurred',
                r'status',
                r'claimant',
                r'description',
                r'policy.*(number|no)',
                r'date.*reported',
            ],
            'weak_columns': [
                r'adjuster',
                r'carrier',
                r'coverage',
                r'loss\s+location',
            ],
            'min_columns': 4,
            'min_rows': 2
        },
        DocumentType.SOV: {
            'required_columns': [
                r'(location|loc|site|premises)',
                r'(building|property|structure).*(value|limit|amount|tiv)',
            ],
            'strong_columns': [
                r'address',
                r'city',
                r'state',
                r'zip',
                r'contents.*(value|limit|amount)',
                r'business.*(income|interruption)',
                r'construction',
                r'occupancy',
                r'(total|combined).*(value|limit|tiv|insured)',
                r'(tiv|total.*insured.*value)',
                r'year.*built',
            ],
            'weak_columns': [
                r'stories',
                r'square.*feet',
                r'sprinkler',
                r'roof',
                r'seismic',
            ],
            'min_columns': 3,
            'min_rows': 2
        },
        DocumentType.FINANCIAL_STATEMENT: {
            'required_columns': [
                r'(account|category)',
                r'(amount|balance|value)',
            ],
            'strong_columns': [
                r'(assets|liabilities)',
                r'(debit|credit)',
                r'(revenue|expense)',
                r'total',
                r'(current|prior).*year',
            ],
            'weak_columns': [
                r'description',
                r'notes',
                r'percentage',
            ],
            'min_columns': 2,
            'min_rows': 3
        }
    }
    
    # Confidence weights
    CONFIDENCE_WEIGHTS = {
        'required': 0.35,
        'strong': 0.08,
        'weak': 0.02,
        'structure_bonus': 0.15,  # Bonus if table structure is good
        'coverage_bonus': 0.12,
    }
    
    def __init__(self, min_confidence: float = 0.6):
        """
        Initialize table classifier.
        
        Args:
            min_confidence: Minimum confidence threshold
        """
        self.min_confidence = min_confidence
    
    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        """
        Classify document based on table structure.
        
        Args:
            document: Document with tables
            
        Returns:
            Tuple of (DocumentType, confidence)
        """
        if not document.tables:
            return DocumentType.UNKNOWN, 0.0
        
        # Score each document type
        scores = {}
        
        for doc_type in self.TABLE_PATTERNS.keys():
         
            score = self._score_document_type(document, doc_type)
            if score > 0:
                scores[doc_type] = score
        
        if not scores:
            return DocumentType.UNKNOWN, 0.0
        
        # Return highest scoring type
        best_type = max(scores.items(), key=lambda x: x[1])
        return best_type[0], min(1.0, best_type[1])
    
    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        """Get table structure indicators."""
        if not document.tables:
            return []
        
        indicators = []
        
        for table_idx, table in enumerate(document.tables):
            # Analyze headers
            headers_lower = [h.lower() for h in table.headers]
            
            for doc_type, patterns in self.TABLE_PATTERNS.items():
                matches = self._find_matching_columns(headers_lower, patterns)
                
                if matches['required'] or matches['strong']:
                    indicators.append({
                        'type': 'table_structure',
                        'table_index': table_idx,
                        'row_count': table.metadata.get('row_count', len(table.rows)),
                        'column_count': len(table.headers),
                        'required_matches': matches['required'],
                        'strong_matches': matches['strong'],
                        'weak_matches': matches['weak'],
                        'document_type': doc_type.value,
                        'confidence': self._calculate_table_confidence(matches, table)
                    })
        
        return indicators
    
    def can_classify(self, document: Document) -> bool:
        """Can classify if document has tables."""
        return bool(document.tables)
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get types with table patterns."""
        return list(self.TABLE_PATTERNS.keys())
    
    def get_priority(self) -> int:
        """Medium-high priority - runs after keywords."""
        return 40
    
    def _score_document_type(self, document: Document, doc_type: DocumentType) -> float:
        """Calculate confidence score for document type."""
        patterns = self.TABLE_PATTERNS.get(doc_type)
        if not patterns:
            return 0.0
        
        max_score = 0.0
        
        # Check each table
        for table in document.tables:
            headers_lower = [h.lower() for h in table.headers]
            
            # Find matching columns
            matches = self._find_matching_columns(headers_lower, patterns)
            
            # Must have required columns
            if len(matches['required']) == 0:
                continue
            
            # Calculate score
            score = 0.0
            score += len(matches['required']) * self.CONFIDENCE_WEIGHTS['required']
            score += len(matches['strong']) * self.CONFIDENCE_WEIGHTS['strong']
            score += len(matches['weak']) * self.CONFIDENCE_WEIGHTS['weak']
            
            # Structure bonus
            if self._has_good_structure(table, patterns):
                score += self.CONFIDENCE_WEIGHTS['structure_bonus']
            
            max_score = max(max_score, score)
        
        return max_score
    
    def _find_matching_columns(
        self,
        headers: List[str],
        patterns: Dict[str, Any]
    ) -> Dict[str, List[str]]:
        """Find which column patterns match the headers."""
        matches = {
            'required': [],
            'strong': [],
            'weak': []
        }
        
        for category in ['required_columns', 'strong_columns', 'weak_columns']:
            pattern_list = patterns.get(category, [])
            category_key = category.replace('_columns', '')
            
            for pattern in pattern_list:
                for header in headers:
                    if re.search(pattern, header, re.IGNORECASE):
                        matches[category_key].append(header)
                        break  # Only count pattern once
        
        return matches
    
    def _has_good_structure(self, table, patterns: Dict[str, Any]) -> bool:
        """Check if table has good structure (enough rows/columns)."""
        min_columns = patterns.get('min_columns', 2)
        min_rows = patterns.get('min_rows', 2)
        
        col_count = len(table.headers)
        row_count = table.metadata.get('row_count', len(table.rows))
        
        return col_count >= min_columns and row_count >= min_rows
    
    def _calculate_table_confidence(
        self,
        matches: Dict[str, List[str]],
        table
    ) -> float:
        """Calculate confidence for a single table."""
        score = 0.0
        score += len(matches['required']) * self.CONFIDENCE_WEIGHTS['required']
        score += len(matches['strong']) * self.CONFIDENCE_WEIGHTS['strong']
        score += len(matches['weak']) * self.CONFIDENCE_WEIGHTS['weak']
        header_count = max(1, len(table.headers))
        coverage = len(set(matches['required'] + matches['strong'])) / header_count
        score += coverage * self.CONFIDENCE_WEIGHTS['coverage_bonus']
        return min(1.0, score)
    
    def get_table_type_hints(self, document: Document) -> Dict[int, List[Tuple[DocumentType, float]]]:
        """
        Get document type hints for each table.
        
        Args:
            document: Document with tables
            
        Returns:
            Dict mapping table index to list of (DocumentType, confidence) tuples
        """
        hints = {}
        
        for table_idx, table in enumerate(document.tables):
            headers_lower = [h.lower() for h in table.headers]
            table_hints = []
            
            for doc_type, patterns in self.TABLE_PATTERNS.items():
                matches = self._find_matching_columns(headers_lower, patterns)
                
                if matches['required']:
                    confidence = self._calculate_table_confidence(matches, table)
                    if self._has_good_structure(table, patterns):
                        confidence += self.CONFIDENCE_WEIGHTS['structure_bonus']
                    
                    table_hints.append((doc_type, min(1.0, confidence)))
            
            if table_hints:
                hints[table_idx] = sorted(table_hints, key=lambda x: x[1], reverse=True)
        
        return hints
    
    def __repr__(self) -> str:
        return f"TableClassifier(min_confidence={self.min_confidence})"
