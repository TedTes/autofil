"""
Interface for document classifiers.

Classifiers determine the document type from content analysis,
not filename or extension.
"""

from abc import ABC, abstractmethod
import logging
from typing import Dict, Any, List, Optional, Tuple
from ..core.document import Document, DocumentType

logger = logging.getLogger(__name__)


class IClassifier(ABC):
    """
    Interface for document classifiers.
    
    Implementations analyze document content to determine type:
    - MIME-based classification
    - Keyword/pattern matching
    - Table structure analysis
    - ML-based classification (future)
    
    Returns document type with confidence score.
    """
    
    @abstractmethod
    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        """
        Classify document and return type with confidence.
        
        Args:
            document: Document object with loaded content
            
        Returns:
            Tuple of (DocumentType, confidence)
            - DocumentType: Classified type (ACORD_126, LOSS_RUN, etc.)
            - confidence: Classification confidence (0.0 to 1.0)
            
        Example:
            doc_type, confidence = classifier.classify(document)
            if confidence > 0.8:
                print(f"High confidence: {doc_type}")
        """
        pass
    
    @abstractmethod
    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        """
        Get classification indicators/signals found in document.
        
        Args:
            document: Document object
            
        Returns:
            List of indicators with details
            [
                {
                    'type': 'keyword',
                    'value': 'ACORD 126',
                    'location': 'page 1',
                    'confidence': 0.9
                },
                ...
            ]
        """
        pass
    
    @abstractmethod
    def can_classify(self, document: Document) -> bool:
        """
        Check if this classifier can handle the document.
        
        Args:
            document: Document object
            
        Returns:
            True if classifier can analyze this document type
        """
        pass
    
    @abstractmethod
    def get_supported_types(self) -> List[DocumentType]:
        """
        Get list of document types this classifier can identify.
        
        Returns:
            List of DocumentType enums
        """
        pass
    
    def get_name(self) -> str:
        """
        Get classifier name.
        
        Returns:
            Human-readable classifier name
        """
        return self.__class__.__name__
    
    def get_priority(self) -> int:
        """
        Get classifier priority (lower = higher priority).
        
        Used when multiple classifiers are available.
        Lower numbers run first.
        
        Returns:
            Priority level (0-100)
        """
        return 50  # Default medium priority


class ClassificationResult:
    """
    Result from document classification.
    
    Contains document type, confidence, and supporting indicators.
    """
    
    def __init__(
        self,
        document_type: DocumentType,
        confidence: float,
        classifier_name: str,
        indicators: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize classification result.
        
        Args:
            document_type: Classified document type
            confidence: Classification confidence (0.0 to 1.0)
            classifier_name: Name of classifier that produced result
            indicators: List of classification indicators
            metadata: Additional metadata
        """
        self.document_type = document_type
        self.confidence = max(0.0, min(1.0, confidence))
        self.classifier_name = classifier_name
        self.indicators = indicators or []
        self.metadata = metadata or {}
    
    def is_confident(self, threshold: float = 0.7) -> bool:
        """
        Check if classification confidence exceeds threshold.
        
        Args:
            threshold: Minimum confidence (default: 0.7)
            
        Returns:
            True if confidence >= threshold
        """
        return self.confidence >= threshold
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary.
        
        Returns:
            Dictionary representation
        """
        return {
            'document_type': self.document_type.value,
            'confidence': self.confidence,
            'classifier': self.classifier_name,
            'indicators': self.indicators,
            'metadata': self.metadata
        }
    
    def __repr__(self) -> str:
        """String representation."""
        return (
            f"ClassificationResult("
            f"type={self.document_type.value}, "
            f"confidence={self.confidence:.2f}, "
            f"classifier={self.classifier_name})"
        )


class CompositeClassifier(IClassifier):
    """
    Composite classifier that combines multiple classifiers.
    
    Runs multiple classifiers and aggregates results using
    various strategies (voting, weighted average, highest confidence, etc.).
    """
    
    def __init__(self, classifiers: List[IClassifier], strategy: str = 'highest_confidence'):
        """
        Initialize composite classifier.
        
        Args:
            classifiers: List of classifier instances
            strategy: Aggregation strategy
                - 'highest_confidence': Use result with highest confidence
                - 'weighted_average': Weight by classifier confidence
                - 'voting': Majority vote with confidence as tiebreaker
        """
        self.classifiers = sorted(classifiers, key=lambda classifier: classifier.get_priority())
        self.strategy = strategy
        self.last_errors: List[Dict[str, str]] = []
        self.last_results: List[Dict[str, Any]] = []
    
    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        """
        Classify using multiple classifiers and aggregate results.
        
        Args:
            document: Document to classify
            
        Returns:
            Tuple of (DocumentType, confidence)
        """
        results = self._run_classifiers(document)
        return self._aggregate_results(results)

    def classify_detailed(self, document: Document) -> Dict[str, Any]:
        results = self._run_classifiers(document, include_indicators=True)
        indicators = self.get_indicators(document)

        if not results:
            return {
                'document_type': DocumentType.UNKNOWN.value,
                'confidence': 0.0,
                'strategy': self.strategy,
                'classifier_results': [],
                'classifier_errors': list(self.last_errors),
                'candidate_types': [],
                'indicators': indicators,
                'conflict_detected': False,
                'review_required': bool(self.last_errors),
            }

        chosen_type, chosen_confidence = self._aggregate_results(results)
        candidate_types = self._build_candidate_types(results)
        conflict_detected = self._has_conflict(candidate_types)

        return {
            'document_type': chosen_type.value,
            'confidence': chosen_confidence,
            'strategy': self.strategy,
            'classifier_results': list(self.last_results),
            'classifier_errors': list(self.last_errors),
            'candidate_types': candidate_types,
            'indicators': indicators,
            'conflict_detected': conflict_detected,
            'review_required': conflict_detected or bool(self.last_errors),
        }

    def _aggregate_results(self, results: List[Tuple[DocumentType, float, str]]) -> Tuple[DocumentType, float]:
        if not results:
            return DocumentType.UNKNOWN, 0.0
        if self.strategy == 'highest_confidence':
            return self._highest_confidence(results)
        if self.strategy == 'weighted_average':
            return self._weighted_average(results)
        if self.strategy == 'voting':
            return self._voting(results)
        return self._highest_confidence(results)
    
    def _highest_confidence(self, results: List[Tuple[DocumentType, float, str]]) -> Tuple[DocumentType, float]:
        """Return result with highest confidence."""
        best = max(results, key=lambda x: x[1])
        return best[0], best[1]
    
    def _weighted_average(self, results: List[Tuple[DocumentType, float, str]]) -> Tuple[DocumentType, float]:
        """Calculate weighted average confidence per document type."""
        type_confidences = {}
        
        for doc_type, confidence, _ in results:
            if doc_type not in type_confidences:
                type_confidences[doc_type] = []
            type_confidences[doc_type].append(confidence)
        
        # Average confidence per type
        type_avg = {
            doc_type: sum(confs) / len(confs)
            for doc_type, confs in type_confidences.items()
        }
        
        # Return type with highest average confidence
        best_type = max(type_avg.items(), key=lambda x: x[1])
        return best_type[0], best_type[1]
    
    def _voting(self, results: List[Tuple[DocumentType, float, str]]) -> Tuple[DocumentType, float]:
        """Majority voting with confidence as tiebreaker."""
        from collections import Counter
        
        # Count votes per type
        votes = Counter(doc_type for doc_type, _, _ in results)
        
        # Get types with most votes
        max_votes = max(votes.values())
        tied_types = [doc_type for doc_type, count in votes.items() if count == max_votes]
        
        if len(tied_types) == 1:
            # Clear winner
            winner = tied_types[0]
            # Average confidence for winner
            winner_confidences = [conf for doc_type, conf, _ in results if doc_type == winner]
            avg_confidence = sum(winner_confidences) / len(winner_confidences)
            return winner, avg_confidence
        else:
            # Tie - use highest confidence among tied types
            tied_results = [
                (doc_type, conf, name) for doc_type, conf, name in results
                if doc_type in tied_types
            ]
            return self._highest_confidence(tied_results)
    
    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        """Get indicators from all classifiers."""
        all_indicators = []
        
        for classifier in self.classifiers:
            if classifier.can_classify(document):
                try:
                    indicators = classifier.get_indicators(document)
                    for indicator in indicators:
                        indicator['classifier'] = classifier.get_name()
                    all_indicators.extend(indicators)
                except Exception as e:
                    self.last_errors.append({
                        'classifier': classifier.get_name(),
                        'error': str(e),
                    })
                    logger.warning(
                        "classifier %s failed during indicator collection: %s",
                        classifier.get_name(),
                        e,
                    )
        
        return all_indicators

    def _run_classifiers(self, document: Document, include_indicators: bool = False) -> List[Tuple[DocumentType, float, str]]:
        results: List[Tuple[DocumentType, float, str]] = []
        self.last_errors = []
        self.last_results = []

        for classifier in self.classifiers:
            if not classifier.can_classify(document):
                continue
            try:
                doc_type, confidence = classifier.classify(document)
                results.append((doc_type, confidence, classifier.get_name()))
                classifier_result = {
                    'classifier': classifier.get_name(),
                    'priority': classifier.get_priority(),
                    'document_type': doc_type.value,
                    'confidence': confidence,
                }
                if include_indicators:
                    classifier_result['indicators'] = classifier.get_indicators(document)
                self.last_results.append(classifier_result)
            except Exception as e:
                self.last_errors.append({
                    'classifier': classifier.get_name(),
                    'error': str(e),
                })
                logger.warning(
                    "classifier %s failed during classify: %s",
                    classifier.get_name(),
                    e,
                )
        return results

    @staticmethod
    def _build_candidate_types(results: List[Tuple[DocumentType, float, str]]) -> List[Dict[str, Any]]:
        grouped: Dict[DocumentType, Dict[str, Any]] = {}
        for doc_type, confidence, classifier_name in results:
            grouped.setdefault(
                doc_type,
                {
                    'document_type': doc_type.value,
                    'votes': 0,
                    'confidences': [],
                    'classifiers': [],
                },
            )
            grouped[doc_type]['votes'] += 1
            grouped[doc_type]['confidences'].append(confidence)
            grouped[doc_type]['classifiers'].append(classifier_name)

        candidates = []
        for item in grouped.values():
            avg_confidence = sum(item['confidences']) / len(item['confidences'])
            candidates.append(
                {
                    'document_type': item['document_type'],
                    'votes': item['votes'],
                    'avg_confidence': avg_confidence,
                    'max_confidence': max(item['confidences']),
                    'classifiers': item['classifiers'],
                }
            )
        return sorted(
            candidates,
            key=lambda item: (item['votes'], item['avg_confidence'], item['max_confidence']),
            reverse=True,
        )

    @staticmethod
    def _has_conflict(candidate_types: List[Dict[str, Any]], confidence_gap: float = 0.15) -> bool:
        if len(candidate_types) <= 1:
            return False
        top = candidate_types[0]
        second = candidate_types[1]
        same_votes = top['votes'] == second['votes']
        close_confidence = abs(top['avg_confidence'] - second['avg_confidence']) <= confidence_gap
        return same_votes or close_confidence
    
    def can_classify(self, document: Document) -> bool:
        """Can classify if any sub-classifier can."""
        return any(c.can_classify(document) for c in self.classifiers)
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get all types supported by any classifier."""
        all_types = set()
        for classifier in self.classifiers:
            all_types.update(classifier.get_supported_types())
        return list(all_types)
    
    def get_name(self) -> str:
        """Get composite classifier name."""
        return f"CompositeClassifier({len(self.classifiers)} classifiers)"
