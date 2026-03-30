"""
Complete extraction pipeline orchestrator.

Manages the end-to-end document processing workflow:
1. Load file
2. Classify document type
3. Extract data
4. Validate and format results
"""

from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime
from .core.file_loader import UniversalFileLoader
from .core.document import Document, DocumentType
from .classifiers.registry import classifier_registry
from .extractors.factory import ExtractorFactory
from .models.extraction_result import ExtractionResult
from .support import assess_document_support


class ExtractionPipeline:
    """
    Complete document extraction pipeline.
    
    Orchestrates the entire extraction process from file loading
    to data extraction with automatic classification and error handling.
    
    Example:
        pipeline = ExtractionPipeline()
        result = pipeline.process('document.pdf')
        print(result.data)
    """
    
    def __init__(
        self,
        use_classification: bool = True,
        classification_strategy: str = 'highest_confidence',
        min_classification_confidence: float = 0.5,
    ):
        """
        Initialize extraction pipeline.
        
        Args:
            use_classification: Whether to classify documents before extraction
            classification_strategy: Classification aggregation strategy
            min_classification_confidence: Minimum confidence threshold
        """
        self.use_classification = use_classification
        self.classification_strategy = classification_strategy
        self.min_classification_confidence = min_classification_confidence
        
        # Initialize components
        self.file_loader = UniversalFileLoader()
        self.classifier = None
        
        if self.use_classification:
            self.classifier = classifier_registry.create_composite(
                classifier_names=['mime', 'keyword', 'table'],
                strategy=classification_strategy
            )
    
    def process(
        self,
        file_path: str,
        override_document_type: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Process a file through the complete extraction pipeline.
        
        Args:
            file_path: Path to document file
            
        Returns:
            ExtractionResult with extracted data and metadata
        """
        try:
            # Step 1: Load file
            document = self._load_file(file_path)
            
            # Step 2: Apply override or classify document type
            if override_document_type:
                document.set_document_type(self._coerce_document_type(override_document_type), 1.0)
                document.metadata['document_type_override'] = override_document_type
            elif self.use_classification:
                document = self._classify_document(document)

            support = assess_document_support(document)
            if support['should_block_extraction']:
                return self._build_blocked_result(document, support)
            
            # Step 3: Extract data
            result = self._extract_data(document)
            
            # Step 4: Add pipeline metadata
            result = self._add_pipeline_metadata(result, document)
            
            return result
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Pipeline processing failed: {str(e)}"]
            )

    def _coerce_document_type(self, document_type: str) -> DocumentType:
        normalized = document_type.strip().lower()
        for candidate in DocumentType:
            if candidate.value == normalized:
                return candidate
        return DocumentType.UNKNOWN
    
    def process_batch(
        self,
        file_paths: List[str],
        continue_on_error: bool = True
    ) -> List[ExtractionResult]:
        """
        Process multiple files through pipeline.
        
        Args:
            file_paths: List of file paths
            continue_on_error: Continue processing if one file fails
            
        Returns:
            List of ExtractionResult objects
        """
        results = []
        
        for file_path in file_paths:
            try:
                result = self.process(file_path)
                results.append(result)
            except Exception as e:
                if continue_on_error:
                    results.append(ExtractionResult(
                        success=False,
                        data={'file_path': file_path},
                        errors=[f"Failed to process: {str(e)}"]
                    ))
                else:
                    raise
        
        return results
    
    def _load_file(self, file_path: str) -> Document:
        """Load file into Document object."""
        return self.file_loader.load(file_path)
    
    def _classify_document(self, document: Document) -> Document:
        """Classify document type."""
        if self.classifier and self.classifier.can_classify(document):
            doc_type, confidence = self.classifier.classify(document)
            
            # Only apply classification if confidence meets threshold
            if confidence >= self.min_classification_confidence:
                document.set_document_type(doc_type, confidence)
            else:
                # Low confidence - keep as UNKNOWN
                document.set_document_type(DocumentType.UNKNOWN, confidence)
                if document.metadata is None:
                    document.metadata = {}
                document.metadata['low_classification_confidence'] = True
        
        return document
    
    def _extract_data(self, document: Document) -> ExtractionResult:
        """Extract data from document."""
        return ExtractorFactory.extract(document)

    def _build_blocked_result(
        self,
        document: Document,
        support: Dict[str, Any],
    ) -> ExtractionResult:
        return ExtractionResult(
            success=False,
            data={},
            confidence=document.confidence,
            warnings=support.get('review_reasons', []),
            errors=[support['message']],
            metadata={
                'document_type': document.document_type.value,
                'document_support': support,
                'review_required': support['needs_review'],
                'recommended_action': support['recommended_action'],
                'file_name': document.file_name,
            },
        )
    
    def _add_pipeline_metadata(
        self,
        result: ExtractionResult,
        document: Document
    ) -> ExtractionResult:
        """Add pipeline processing metadata to result."""
        if result.metadata is None:
            result.metadata = {}
        
        result.metadata['pipeline'] = {
            'version': '1.0.0',
            'processing_date': datetime.utcnow().isoformat(),
            'file_name': document.file_name,
            'file_path': document.file_path,
            'document_type': document.document_type.value,
            'classification_confidence': document.confidence,
            'classification_used': self.use_classification,
        }
        result.metadata['document_support'] = assess_document_support(document)
        result.metadata['review_required'] = result.metadata['document_support']['needs_review']
        result.metadata['recommended_action'] = result.metadata['document_support']['recommended_action']

        return result
    
    def get_pipeline_info(self) -> Dict[str, Any]:
        """
        Get information about pipeline configuration.
        
        Returns:
            Dictionary with pipeline info
        """
        return {
            'use_classification': self.use_classification,
            'classification_strategy': self.classification_strategy,
            'min_classification_confidence': self.min_classification_confidence,
            'available_classifiers': classifier_registry.list_classifiers() if self.use_classification else [],
            'available_extractors': list(ExtractorFactory.get_available_extractors().keys()),
        }


class SimplePipeline:
    """
    Simplified pipeline for quick extraction without configuration.
    
    Example:
        result = SimplePipeline.extract('document.pdf')
    """
    
    _default_pipeline: Optional[ExtractionPipeline] = None
    
    @classmethod
    def extract(cls, file_path: str) -> ExtractionResult:
        """
        Extract data from file using default pipeline.
        
        Args:
            file_path: Path to document file
            
        Returns:
            ExtractionResult with extracted data
        """
        if cls._default_pipeline is None:
            cls._default_pipeline = ExtractionPipeline()
        
        return cls._default_pipeline.process(file_path)
    
    @classmethod
    def extract_batch(cls, file_paths: List[str]) -> List[ExtractionResult]:
        """
        Extract data from multiple files.
        
        Args:
            file_paths: List of file paths
            
        Returns:
            List of ExtractionResult objects
        """
        if cls._default_pipeline is None:
            cls._default_pipeline = ExtractionPipeline()
        
        return cls._default_pipeline.process_batch(file_paths)


class ExtractionPipelineBuilder:
    """
    Builder for creating configured extraction pipelines.
    
    Example:
        pipeline = (ExtractionPipelineBuilder()
            .with_classification(strategy='voting')
            .with_min_confidence(0.7)
            .build())
        result = pipeline.process('document.pdf')
    """
    
    def __init__(self):
        """Initialize builder with defaults."""
        self._use_classification = True
        self._classification_strategy = 'highest_confidence'
        self._min_confidence = 0.5
    
    def with_classification(self, strategy: str = 'highest_confidence') -> 'ExtractionPipelineBuilder':
        """
        Enable classification with specified strategy.
        
        Args:
            strategy: Classification strategy ('highest_confidence', 'voting', 'weighted_average')
        """
        self._use_classification = True
        self._classification_strategy = strategy
        return self
    
    def without_classification(self) -> 'ExtractionPipelineBuilder':
        """Disable automatic classification."""
        self._use_classification = False
        return self
    
    def with_min_confidence(self, confidence: float) -> 'ExtractionPipelineBuilder':
        """
        Set minimum classification confidence threshold.
        
        Args:
            confidence: Minimum confidence (0.0 to 1.0)
        """
        self._min_confidence = max(0.0, min(1.0, confidence))
        return self
    
    def build(self) -> ExtractionPipeline:
        """
        Build configured pipeline.
        
        Returns:
            ExtractionPipeline instance
        """
        return ExtractionPipeline(
            use_classification=self._use_classification,
            classification_strategy=self._classification_strategy,
            min_classification_confidence=self._min_confidence,
        )


# Convenience function
def extract_from_file(file_path: str) -> ExtractionResult:
    """
    Convenience function for extracting data from a file.
    
    Args:
        file_path: Path to document file
        
    Returns:
        ExtractionResult with extracted data
        
    Example:
        from extraction import extract_from_file
        
        result = extract_from_file('document.pdf')
        if result.success:
            print(result.data)
    """
    return SimplePipeline.extract(file_path)
