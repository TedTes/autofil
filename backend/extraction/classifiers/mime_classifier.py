"""
MIME-based document classifier.

Uses file MIME type and extension to provide initial classification hints.
This is a fast, lightweight classifier that runs first.
"""

import os
import re
from typing import List, Dict, Any, Tuple, Optional, Iterable

import yaml
from ..interfaces.classifier import IClassifier
from ..core.document import Document, DocumentType


class MimeClassifier(IClassifier):
    """
    MIME-based document classifier.
    
    Provides initial classification based on file type.
    Used as first-pass classifier before content analysis.
    
    Classification rules:
    - PDF files → Could be ACORD forms, Loss Runs, etc.
    - Excel files → Likely SOV or Financial Statement
    - Images → Likely supplemental documents
    - Unknown types → Generic
    
    Note: This classifier provides LOW confidence because
    MIME type alone can't determine document content.
    """
    
    # MIME type to likely document type mapping
    MIME_TYPE_HINTS = {
        'application/pdf': [
            DocumentType.ACORD_25,
            DocumentType.ACORD_27,
            DocumentType.ACORD_28,
            DocumentType.ACORD_101,
            DocumentType.ACORD_126,
            DocumentType.ACORD_125,
            DocumentType.ACORD_130,
            DocumentType.ACORD_140,
            DocumentType.LOSS_RUN,
            DocumentType.FINANCIAL_STATEMENT,
            DocumentType.GENERIC
        ],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
            DocumentType.SOV,
            DocumentType.FINANCIAL_STATEMENT,
            DocumentType.LOSS_RUN
        ],
        'application/vnd.ms-excel': [
            DocumentType.SOV,
            DocumentType.FINANCIAL_STATEMENT,
            DocumentType.LOSS_RUN
        ],
        'text/csv': [
            DocumentType.SOV,
            DocumentType.LOSS_RUN
        ],
        'image/jpeg': [
            DocumentType.SUPPLEMENTAL
        ],
        'image/png': [
            DocumentType.SUPPLEMENTAL
        ],
        'image/tiff': [
            DocumentType.SUPPLEMENTAL
        ],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
            DocumentType.SUPPLEMENTAL,
            DocumentType.GENERIC
        ]
    }
    
    # File extension hints (fallback if MIME unknown)
    EXTENSION_HINTS = {
        '.pdf': [
            DocumentType.ACORD_25,
            DocumentType.ACORD_27,
            DocumentType.ACORD_28,
            DocumentType.ACORD_101,
            DocumentType.ACORD_125,
            DocumentType.ACORD_130,
            DocumentType.ACORD_140,
            DocumentType.ACORD_126,
            DocumentType.LOSS_RUN,
            DocumentType.FINANCIAL_STATEMENT,
            DocumentType.GENERIC
        ],
        '.xlsx': [DocumentType.SOV, DocumentType.FINANCIAL_STATEMENT],
        '.xls': [DocumentType.SOV, DocumentType.FINANCIAL_STATEMENT],
        '.csv': [DocumentType.SOV, DocumentType.LOSS_RUN],
        '.jpg': [DocumentType.SUPPLEMENTAL],
        '.jpeg': [DocumentType.SUPPLEMENTAL],
        '.png': [DocumentType.SUPPLEMENTAL],
        '.tiff': [DocumentType.SUPPLEMENTAL],
        '.tif': [DocumentType.SUPPLEMENTAL],
        '.docx': [DocumentType.SUPPLEMENTAL, DocumentType.GENERIC],
        '.doc': [DocumentType.SUPPLEMENTAL, DocumentType.GENERIC]
    }
    
    FIELD_CONFIG_PATH = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "extractors",
        "loss_run_fields.yaml",
    )
    _LOSS_RUN_ALIASES: Optional[set[str]] = None

    def __init__(self, confidence_multiplier: float = 0.3):
        """
        Initialize MIME classifier.
        
        Args:
            confidence_multiplier: Confidence multiplier for MIME-based classification
                                  (default: 0.3 = low confidence, needs content verification)
        """
        self.confidence_multiplier = confidence_multiplier
    
    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        """
        Classify document based on MIME type and extension.
        
        Args:
            document: Document object with MIME type
            
        Returns:
            Tuple of (DocumentType, confidence)
            
        Note:
            Returns LOW confidence (0.2-0.4) because MIME type alone
            cannot determine document content accurately.
        """
        csv_hint = self._guess_csv_type(document)
        if csv_hint:
            return csv_hint, 0.85

        # Get possible document types from MIME
        possible_types = self._get_possible_types(document)
        
        if not possible_types:
            return DocumentType.UNKNOWN, 0.0
        
        tabular_hint = self._detect_tabular_hint(document)
        if tabular_hint:
            return tabular_hint, 0.8

        primary_type = possible_types[0]
        
        # Calculate confidence based on specificity
        if len(possible_types) == 1:
            # Only one possibility - slightly higher confidence
            confidence = 0.4 * self.confidence_multiplier
        else:
            # Multiple possibilities - lower confidence
            confidence = 0.2 * self.confidence_multiplier
        
        return primary_type, confidence
    
    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        """
        Get MIME-based classification indicators.
        
        Args:
            document: Document object
            
        Returns:
            List of indicators found
        """
        indicators = []
        
        # MIME type indicator
        if document.mime_type:
            indicators.append({
                'type': 'mime_type',
                'value': document.mime_type,
                'confidence': 0.3,
                'location': 'file_metadata'
            })
        
        # Extension indicator
        if document.file_extension:
            indicators.append({
                'type': 'file_extension',
                'value': document.file_extension,
                'confidence': 0.2,
                'location': 'filename'
            })
        
        # Possible document types
        possible_types = self._get_possible_types(document)
        if possible_types:
            indicators.append({
                'type': 'possible_types',
                'value': [dt.value for dt in possible_types],
                'confidence': 0.3,
                'location': 'mime_mapping'
            })
        
        return indicators
    
    def can_classify(self, document: Document) -> bool:
        """
        Check if classifier can analyze document.
        
        Args:
            document: Document object
            
        Returns:
            True if document has MIME type or extension
        """
        return bool(document.mime_type or document.file_extension)
    
    def get_supported_types(self) -> List[DocumentType]:
        """
        Get all document types this classifier can identify.
        
        Returns:
            List of all DocumentType values
        """
        all_types = set()
        
        for types in self.MIME_TYPE_HINTS.values():
            all_types.update(types)
        
        for types in self.EXTENSION_HINTS.values():
            all_types.update(types)
        
        return list(all_types)
    
    def get_priority(self) -> int:
        """
        Get classifier priority.
        
        Returns:
            10 (high priority - runs first as quick check)
        """
        return 10  # Run first
    
    def _get_possible_types(self, document: Document) -> List[DocumentType]:
        """
        Get possible document types based on MIME and extension.
        
        Args:
            document: Document object
            
        Returns:
            List of possible DocumentType values
        """
        possible_types = []
        
        # Check MIME type
        if document.mime_type and document.mime_type in self.MIME_TYPE_HINTS:
            possible_types.extend(self.MIME_TYPE_HINTS[document.mime_type])
        
        # Check extension as fallback
        if not possible_types and document.file_extension:
            ext = document.file_extension.lower()
            if ext in self.EXTENSION_HINTS:
                possible_types.extend(self.EXTENSION_HINTS[ext])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_types = []
        for dt in possible_types:
            if dt not in seen:
                seen.add(dt)
                unique_types.append(dt)
        
        return unique_types

    def _detect_tabular_hint(self, document: Document) -> Optional[DocumentType]:
        """
        Inspect tables/headers to detect common insurance CSV/Excel layouts.
        """
        if not document.tables:
            return None

        headers: List[str] = []
        for table in document.tables:
            headers.extend([str(h).lower() for h in table.headers if h])

        if not headers and document.raw_text:
            headers = [segment.strip() for segment in document.raw_text.lower().splitlines()[:5]]

        if not headers:
            return None

        def header_hits(patterns: List[str]) -> int:
            count = 0
            for token in headers:
                for pattern in patterns:
                    if re.search(pattern, token):
                        count += 1
                        break
            return count

        loss_run_patterns = [
            r'claim.*(number|no|#|id)',
            r'(date|dt).*(loss|accident|occurrence)',
            r'(paid|incurred|reserve)',
            r'status',
            r'claimant',
            r'policy.*(number|no)',
        ]
        sov_patterns = [
            r'(location|loc|site|premises)',
            r'(address|city|state|zip)',
            r'(building|property|structure).*(value|limit|amount|tiv)',
            r'contents.*(value|limit|amount)',
            r'(total|combined).*(insured|tiv|value)',
            r'occupancy',
        ]

        normalized_tokens = self._extract_normalized_tokens(headers)
        if self._count_alias_hits(
            normalized_tokens, self._get_loss_run_aliases()
        ) >= 3 or header_hits(loss_run_patterns) >= 2:
            return DocumentType.LOSS_RUN
        if header_hits(sov_patterns) >= 2:
            return DocumentType.SOV
        return None

    def _guess_csv_type(self, document: Document) -> Optional[DocumentType]:
        ext = (document.file_extension or '').lower()
        mime = (document.mime_type or '').lower()
        if ext != '.csv' and mime != 'text/csv':
            return None
        text = (document.raw_text or '')
        if not text:
            return None

        normalized_tokens = self._extract_normalized_tokens(text.splitlines())
        if self._count_alias_hits(
            normalized_tokens, self._get_loss_run_aliases()
        ) >= 3:
            return DocumentType.LOSS_RUN

        lowered = text.lower()
        if re.search(r'(loss\s*run|claim\s*history|claim\s*summary)', lowered):
            return DocumentType.LOSS_RUN
        if re.search(r'(claim\s*number|date\s*of\s*loss)', lowered):
            return DocumentType.LOSS_RUN
        if re.search(r'(schedule|statement)\s+of\s+values', lowered):
            return DocumentType.SOV
        if re.search(r'(total\s+insured\s+value|\btiv\b)', lowered):
            return DocumentType.SOV
        return None
    
    def get_likely_types_with_confidence(self, document: Document) -> List[Tuple[DocumentType, float]]:
        """
        Get all likely document types with individual confidence scores.
        
        Args:
            document: Document object
            
        Returns:
            List of (DocumentType, confidence) tuples
        """
        possible_types = self._get_possible_types(document)
        
        if not possible_types:
            return [(DocumentType.UNKNOWN, 0.0)]
        
        # Distribute confidence across possibilities
        base_confidence = 0.3 * self.confidence_multiplier
        decay_factor = 0.8  # Each subsequent type gets lower confidence
        
        results = []
        for i, doc_type in enumerate(possible_types):
            confidence = base_confidence * (decay_factor ** i)
            results.append((doc_type, confidence))
        
        return results
    
    def __repr__(self) -> str:
        """String representation."""
        return f"MimeClassifier(confidence_multiplier={self.confidence_multiplier})"

    @classmethod
    def _get_loss_run_aliases(cls) -> set[str]:
        if cls._LOSS_RUN_ALIASES is not None:
            return cls._LOSS_RUN_ALIASES
        aliases: set[str] = set()
        try:
            with open(cls.FIELD_CONFIG_PATH, "r") as fp:
                data = yaml.safe_load(fp) or {}
            for config in (data.get("fields") or {}).values():
                for alias in config.get("aliases", []):
                    norm = cls._normalize_alias(alias)
                    if norm:
                        aliases.add(norm)
        except FileNotFoundError:
            aliases = set()
        except Exception:
            aliases = set()
        cls._LOSS_RUN_ALIASES = aliases
        return cls._LOSS_RUN_ALIASES

    @staticmethod
    def _normalize_alias(value: str) -> str:
        if not value:
            return ""
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    def _extract_normalized_tokens(self, items: Iterable[str]) -> List[str]:
        tokens: List[str] = []
        for item in items:
            if not item:
                continue
            parts = re.split(r"[,\t|\r\n]+", item.lower())
            for part in parts:
                normalized = self._normalize_alias(part.strip())
                if normalized:
                    tokens.append(normalized)
        return tokens

    @staticmethod
    def _count_alias_hits(tokens: Iterable[str], alias_set: set[str]) -> int:
        if not alias_set:
            return 0
        hits = 0
        for token in tokens:
            if token in alias_set:
                hits += 1
        return hits
