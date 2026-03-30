"""
Classifier registry for managing available classifiers.

Similar to parser registry but for classifiers.
"""

import logging
from typing import Dict, List, Type, Optional
from ..interfaces.classifier import IClassifier, CompositeClassifier

logger = logging.getLogger(__name__)


class ClassifierRegistry:
    """
    Registry for document classifiers.
    
    Manages available classifiers and provides utilities for
    automatic classifier selection and composition.
    """
    
    def __init__(self):
        """Initialize classifier registry."""
        self._classifiers: Dict[str, Type[IClassifier]] = {}
        self._register_default_classifiers()
    
    def _register_default_classifiers(self):
        """Register default classifiers."""
        try:
            from .mime_classifier import MimeClassifier
            self.register('mime', MimeClassifier)
        except ImportError as exc:
            logger.warning("failed to register mime classifier: %s", exc)
        try:
            from .keyword_classifier import KeywordClassifier
            self.register('keyword', KeywordClassifier)
        except ImportError as exc:
            logger.warning("failed to register keyword classifier: %s", exc)
        try:
            from .table_classifier import TableClassifier
            self.register('table', TableClassifier)
            # ADD THIS (but don't register by default - only when model available):
            # ML classifiers are not registered by default
            # Users must manually register when model is available:
            # from .ml_classifier import MLClassifier
            # classifier_registry.register('ml', MLClassifier)
        except ImportError as exc:
            logger.warning("failed to register table classifier: %s", exc)
    
    def register(self, name: str, classifier_class: Type[IClassifier]):
        """
        Register a classifier.
        
        Args:
            name: Classifier identifier
            classifier_class: Classifier class
        """
        self._classifiers[name] = classifier_class
    
    def get(self, name: str) -> Optional[Type[IClassifier]]:
        """
        Get classifier class by name.
        
        Args:
            name: Classifier name
            
        Returns:
            Classifier class or None
        """
        return self._classifiers.get(name)
    
    def list_classifiers(self) -> List[str]:
        """
        Get list of registered classifier names.
        
        Returns:
            List of classifier names
        """
        return list(self._classifiers.keys())
    
    def has_classifier(self, name: str) -> bool:
        """
        Check if classifier is registered.
        
        Args:
            name: Classifier name
            
        Returns:
            True if registered
        """
        return name in self._classifiers
    
    def create_composite(
        self,
        classifier_names: Optional[List[str]] = None,
        strategy: str = 'highest_confidence'
    ) -> CompositeClassifier:
        """
        Create a composite classifier from multiple classifiers.
        
        Args:
            classifier_names: List of classifier names to combine
                            (None = use all registered classifiers)
            strategy: Aggregation strategy
            
        Returns:
            CompositeClassifier instance
        """
        if classifier_names is None:
            classifier_names = self.list_classifiers()
        
        classifiers = []
        for name in classifier_names:
            classifier_class = self.get(name)
            if classifier_class:
                classifiers.append(classifier_class())

        classifiers.sort(key=lambda classifier: classifier.get_priority())
        return CompositeClassifier(classifiers, strategy=strategy)
    
    def get_classifiers_by_priority(self) -> List[IClassifier]:
        """
        Get all classifiers sorted by priority.
        
        Returns:
            List of classifier instances sorted by priority
        """
        classifiers = [cls() for cls in self._classifiers.values()]
        return sorted(classifiers, key=lambda c: c.get_priority())
    
    def __repr__(self) -> str:
        """String representation."""
        return f"ClassifierRegistry(classifiers={len(self._classifiers)})"


# Global classifier registry instance
classifier_registry = ClassifierRegistry()
