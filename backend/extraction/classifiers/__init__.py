"""
Document classifiers for content-based type detection.

Classifiers analyze document content to determine type:
- MimeClassifier: Fast initial classification based on file type
- KeywordClassifier: Searches for document type indicators (next commit)
- TableClassifier: Analyzes table structure (next commit)
- MLClassifier: Uses machine learning (future)
"""

from .mime_classifier import MimeClassifier
from .registry import ClassifierRegistry, classifier_registry
from .table_classifier import TableClassifier
from .keyword_classifier import KeywordClassifier
from .ml_classifier import MLClassifier, LayoutLMClassifier, DonutClassifier
__all__ = [
    'MimeClassifier',
    'KeywordClassifier',
    'ClassifierRegistry',
    'TableClassifier',
    'classifier_registry',
    'MLClassifier',  
    'LayoutLMClassifier', 
    'DonutClassifier'
]

__version__ = '1.0.0'