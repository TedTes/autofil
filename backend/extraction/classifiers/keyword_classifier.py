"""
Keyword-based document classifier.

Searches document content for keywords and patterns that indicate document type.
"""

import re
from typing import List, Dict, Any, Tuple
from ..interfaces.classifier import IClassifier
from ..core.document import Document, DocumentType


class KeywordClassifier(IClassifier):
    """
    Keyword-based classifier for document type detection.
    
    Analyzes document text for keywords and patterns that indicate
    document type (ACORD forms, Loss Runs, SOVs, etc.).
    
    High confidence when multiple indicators found.
    """
    
    # Keyword patterns for each document type
    KEYWORD_PATTERNS = {
        DocumentType.ACORD_25: {
            'required': [
                r'acord\s*25',
                r'certificate\s+of\s+liability\s+insurance',
            ],
            'strong': [
                r'certificate\s+holder',
                r'producer',
                r'insurer',
                r'cancellation',
                r'authorized\s+representative',
            ],
            'weak': [
                r'policy\s+number',
                r'general\s+liability',
                r'automobile\s+liability',
                r'workers?\s+compensation',
            ]
        },
        DocumentType.ACORD_27: {
            'required': [
                r'acord\s*27',
                r'evidence\s+of\s+property\s+insurance',
            ],
            'strong': [
                r'evidence\s+of\s+property',
                r'additional\s+interest',
                r'property\s+information',
                r'coverage\s+information',
                r'authorized\s+representative',
            ],
            'weak': [
                r'policy\s+number',
                r'effective\s+date',
                r'expiration\s+date',
                r'building',
            ]
        },
        DocumentType.ACORD_28: {
            'required': [
                r'acord\s*28',
                r'evidence\s+of\s+commercial\s+property\s+insurance',
            ],
            'strong': [
                r'commercial\s+property',
                r'additional\s+interest',
                r'mortgagee',
                r'lender',
                r'building\s+coverage',
                r'business\s+personal\s+property',
            ],
            'weak': [
                r'policy\s+number',
                r'effective\s+date',
                r'expiration\s+date',
                r'blanket\s+coverage',
            ]
        },
        DocumentType.ACORD_101: {
            'required': [
                r'acord\s*101',
                r'additional\s+remarks\s+schedule',
            ],
            'strong': [
                r'additional\s+remarks',
                r'applicant',
                r'agency',
                r'policy\s+number',
            ],
            'weak': [
                r'effective\s+date',
                r'page\s+\d+\s+of\s+\d+',
            ]
        },
        DocumentType.ACORD_126: {
            'required': [
                r'acord\s*126',
                r'commercial\s+general\s+liability',
            ],
            'strong': [
                r'named\s+insured',
                r'general\s+aggregate',
                r'products\s+completed\s+operations',
                r'each\s+occurrence',
                r'personal\s+advertising\s+injury',
            ],
            'weak': [
                r'premises\s+operations',
                r'medical\s+expense',
                r'fire\s+damage',
                r'policy\s+period',
            ]
        },
        DocumentType.ACORD_125: {
            'required': [
                r'acord\s*125',
                r'commercial\s+insurance',
            ],
            'strong': [
                r'general\s+liability',
                r'automobile\s+liability',
                r'umbrella\s+liability',
                r'workers\s+compensation',
            ],
            'weak': [
                r'certificate\s+holder',
                r'policy\s+number',
            ]
        },
        DocumentType.ACORD_130: {
            'required': [
                r'acord\s*130',
                r'workers\s+compensation',
            ],
            'strong': [
                r'experience\s+modification',
                r'classification\s+code',
                r'payroll',
            ],
            'weak': []
        },
        DocumentType.ACORD_140: {
            'required': [
                r'acord\s*140',
                r'property\s+section',
            ],
            'strong': [
                r'building\s+value',
                r'contents\s+value',
                r'business\s+income',
            ],
            'weak': []
        },
        DocumentType.LOSS_RUN: {
            'required': [
                r'(loss\s+run|claim\s+(?:history|listing|summary)|loss\s+history)',
                r'claim\s+number',
                r'date\s+of\s+loss',
            ],
            'strong': [
                r'claimant',
                r'(total\s+)?paid',
                r'(total\s+)?incurred',
                r'reserve',
                r'status',
                r'date\s+reported',
                r'description\s+of\s+loss',
            ],
            'weak': [
                r'policy\s+(number|period)',
                r'adjuster',
                r'loss\s+location',
                r'total\s+(paid|incurred)',
            ]
        },
        DocumentType.SOV: {
            'required': [
                r'(schedule|statement)\s+of\s+values',
                r'(total\s+insured\s+value|\btiv\b)',
            ],
            'strong': [
                r'(building|property|structure)\s+(value|limit|amount)',
                r'contents\s+(value|limit|amount)',
                r'business\s+income',
                r'location\s+#',
                r'premises\s+address',
                r'construction\s+type',
                r'occupancy',
            ],
            'weak': [
                r'year\s+built',
                r'square\s+feet',
                r'number\s+of\s+stories',
                r'sprinkler',
                r'roof\s+type',
            ]
        },
        DocumentType.FINANCIAL_STATEMENT: {
            'required': [
                r'(balance\s+sheet|income\s+statement|financial\s+statement|profit\s+(?:and|&)\s+loss|\bp\s*&\s*l\b|cash\s+flow\s+statement)',
            ],
            'strong': [
                r'(assets|liabilities|equity)',
                r'revenue',
                r'expenses',
                r'net\s+income',
                r'total\s+assets',
                r'total\s+liabilities',
                r'shareholders\s+equity',
                r'operating\s+activities',
                r'investing\s+activities',
                r'financing\s+activities',
            ],
            'weak': [
                r'fiscal\s+year',
                r'cash\s+flow',
                r'retained\s+earnings',
            ]
        }
    }
    
    # Confidence weights
    CONFIDENCE_WEIGHTS = {
        'required': 0.35,   # Each required keyword
        'strong': 0.1,      # Each strong keyword
        'weak': 0.03        # Each weak keyword
    }
    
    def __init__(self, min_confidence: float = 0.5):
        """
        Initialize keyword classifier.
        
        Args:
            min_confidence: Minimum confidence threshold (default: 0.5)
        """
        self.min_confidence = min_confidence
    
    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        """
        Classify document based on keywords found.
        
        Args:
            document: Document with text content
            
        Returns:
            Tuple of (DocumentType, confidence)
        """
        if not document.raw_text:
            return DocumentType.UNKNOWN, 0.0
        
        text = document.raw_text.lower()
        
        # Score each document type
        scores = {}
        for doc_type in self.KEYWORD_PATTERNS.keys():
            score = self._score_document_type(text, doc_type, document)
            if score > 0:
                scores[doc_type] = score
        
        if not scores:
            return DocumentType.UNKNOWN, 0.0
        
        # Return highest scoring type
        best_type = max(scores.items(), key=lambda x: x[1])
        confidence = min(1.0, best_type[1])
        if confidence < self.min_confidence:
            return DocumentType.UNKNOWN, 0.0
        return best_type[0], confidence
    
    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        """Get keywords found for classification."""
        if not document.raw_text:
            return []
        
        text = document.raw_text.lower()
        indicators = []
        
        for doc_type, patterns in self.KEYWORD_PATTERNS.items():
            for category, pattern_list in patterns.items():
                for pattern in pattern_list:
                    matches = re.findall(pattern, text, re.IGNORECASE)
                    if matches:
                        indicators.append({
                            'type': 'keyword',
                            'category': category,
                            'value': pattern,
                            'matches': len(matches),
                            'confidence': self.CONFIDENCE_WEIGHTS[category],
                            'document_type': doc_type.value
                        })
        
        return indicators
    
    def can_classify(self, document: Document) -> bool:
        """Can classify if document has text content."""
        return bool(document.raw_text)
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get all types with keyword patterns."""
        return list(self.KEYWORD_PATTERNS.keys())
    
    def get_priority(self) -> int:
        """Medium priority - runs after MIME."""
        return 30
    
    def _score_document_type(self, text: str, doc_type: DocumentType, document: Document) -> float:
        """Calculate confidence score for document type."""
        patterns = self.KEYWORD_PATTERNS.get(doc_type, {})
        score = 0.0
        
        # Check required keywords
        required = patterns.get('required', [])
        required_found = sum(
            1 for pattern in required
            if re.search(pattern, text, re.IGNORECASE)
        )
        
        if required and required_found < len(required):
            return 0.0
        
        score += required_found * self.CONFIDENCE_WEIGHTS['required']
        
        # Check strong keywords
        strong = patterns.get('strong', [])
        strong_found = sum(
            1 for pattern in strong
            if re.search(pattern, text, re.IGNORECASE)
        )
        score += strong_found * self.CONFIDENCE_WEIGHTS['strong']
        
        # Check weak keywords
        weak = patterns.get('weak', [])
        weak_found = sum(
            1 for pattern in weak
            if re.search(pattern, text, re.IGNORECASE)
        )
        score += weak_found * self.CONFIDENCE_WEIGHTS['weak']
        
        ext = (document.file_extension or '').lower()
        mime = (document.mime_type or '').lower()
        is_tabular = any(ext.endswith(suffix) for suffix in ['.csv', '.xls', '.xlsx'])
        is_pdf = ext == '.pdf' or mime == 'application/pdf'

        if is_tabular and doc_type in (
            DocumentType.ACORD_25,
            DocumentType.ACORD_27,
            DocumentType.ACORD_28,
            DocumentType.ACORD_101,
            DocumentType.ACORD_125,
            DocumentType.ACORD_126,
            DocumentType.ACORD_130,
            DocumentType.ACORD_140,
        ):
            score *= 0.4
        if is_tabular and doc_type in (DocumentType.LOSS_RUN, DocumentType.SOV):
            score *= 1.25
        if is_tabular and doc_type == DocumentType.FINANCIAL_STATEMENT:
            score *= 1.15
        if is_pdf and doc_type == DocumentType.LOSS_RUN:
            score *= 0.9

        return score
    
    def __repr__(self) -> str:
        return f"KeywordClassifier(min_confidence={self.min_confidence})"
