"""
Complete extraction pipeline orchestrator.

Manages the end-to-end document processing workflow:
1. Load file
2. Classify document type
3. Extract data
4. Validate and format results
"""

import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime
from .core.file_loader import UniversalFileLoader
from .core.document import Document, DocumentType
from .classifiers.registry import classifier_registry
from .extractors.factory import ExtractorFactory
from .models.extraction_result import ExtractionResult
from .core.schema import CanonicalOutput
from .support import assess_document_support
from .validation.validator import ExtractionValidationError, validate

logger = logging.getLogger(__name__)


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
        enable_ocr_enrichment: bool = True,
        ocr_text_threshold: int = 50,
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
        self.enable_ocr_enrichment = enable_ocr_enrichment
        self.ocr_text_threshold = ocr_text_threshold
        self._ocr_parser = None
        
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
            document = self._load_file(file_path)
            document = self._maybe_enrich_with_ocr(document)
            document = self._apply_document_typing(document, override_document_type)

            support = assess_document_support(document)
            if support['should_block_extraction']:
                return self._build_blocked_result(document, support)

            result = self._extract_data(document)
            result = self._validate_result(result, document)
            result = self._add_pipeline_metadata(result, document)
            logger.info(
                "extraction_pipeline processed file=%s type=%s success=%s review_required=%s method=%s low_confidence=%s validation_warnings=%s",
                document.file_name,
                document.document_type.value,
                result.success,
                result.metadata.get('review_required'),
                (result.data.get('source') or {}).get('extraction_method') if isinstance(result.data, dict) else None,
                result.metadata.get('low_confidence_field_count'),
                result.metadata.get('validation_warning_count'),
            )
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

    def _maybe_enrich_with_ocr(self, document: Document) -> Document:
        """
        Run OCR centrally before classification when the reader indicates it is needed.
        """
        if not self.enable_ocr_enrichment:
            return document

        requires_ocr = bool(document.metadata.get('requires_ocr'))
        has_enough_text = bool(document.raw_text and len(document.raw_text.strip()) >= self.ocr_text_threshold)

        if not requires_ocr or has_enough_text:
            return document

        try:
            ocr_result = self._perform_ocr(document.file_path)
            ocr_text = (ocr_result.get('text') or '').strip()

            if ocr_text:
                document.raw_text = ocr_text
                document.metadata['ocr_applied'] = True
                document.metadata['ocr_confidence'] = ocr_result.get('confidence')
                document.metadata['ocr_page_count'] = ocr_result.get('page_count')
                document.metadata['ocr_language'] = ocr_result.get('language')
                document.metadata['requires_ocr'] = False

            for warning in ocr_result.get('warnings', []):
                document.add_warning(f"OCR: {warning}")

        except Exception as exc:
            document.metadata['ocr_applied'] = False
            document.metadata['ocr_error'] = str(exc)
            document.add_warning(f"OCR enrichment failed: {str(exc)}")
            logger.warning("extraction_pipeline OCR enrichment failed for %s: %s", document.file_name, exc)

        return document

    def _perform_ocr(self, file_path: str) -> Dict[str, Any]:
        if self._ocr_parser is None:
            from .parsers.ocr_parser import OcrParser

            self._ocr_parser = OcrParser()
        return self._ocr_parser.extract_fields(file_path)

    def _apply_document_typing(
        self,
        document: Document,
        override_document_type: Optional[str],
    ) -> Document:
        """Apply explicit document type override or run classification."""
        if override_document_type:
            document.set_document_type(self._coerce_document_type(override_document_type), 1.0)
            document.metadata['document_type_override'] = override_document_type
            return document

        if self.use_classification:
            return self._classify_document(document)

        return document
    
    def _classify_document(self, document: Document) -> Document:
        """Classify document type."""
        if self.classifier and self.classifier.can_classify(document):
            if hasattr(self.classifier, 'classify_detailed'):
                classification = self.classifier.classify_detailed(document)
                doc_type = self._coerce_document_type(classification['document_type'])
                confidence = float(classification.get('confidence', 0.0))
            else:
                doc_type, confidence = self.classifier.classify(document)
                classification = {
                    'document_type': doc_type.value,
                    'confidence': confidence,
                    'strategy': self.classification_strategy,
                    'classifier_results': [],
                    'classifier_errors': [],
                    'candidate_types': [],
                    'indicators': [],
                    'conflict_detected': False,
                    'review_required': False,
                }
            
            # Only apply classification if confidence meets threshold
            if confidence >= self.min_classification_confidence:
                document.set_document_type(doc_type, confidence)
            else:
                # Low confidence - keep as UNKNOWN
                document.set_document_type(DocumentType.UNKNOWN, confidence)
                if document.metadata is None:
                    document.metadata = {}
                document.metadata['low_classification_confidence'] = True

            document.metadata['classification_timestamp'] = datetime.utcnow().isoformat()

            top_candidates = classification.get('candidate_types', [])
            document.metadata['classification'] = {
                **classification,
                'threshold': self.min_classification_confidence,
                'applied_document_type': document.document_type.value,
                'applied_confidence': document.confidence,
                'review_required': (
                    classification.get('review_required', False)
                    or confidence < self.min_classification_confidence
                ),
            }
            document.metadata['classification_training_record'] = {
                'file_name': document.file_name,
                'predicted_document_type': classification.get('document_type', DocumentType.UNKNOWN.value),
                'predicted_confidence': confidence,
                'candidate_types': top_candidates,
                'status': 'pending_review',
                'classified_at': document.metadata.get('classification_timestamp'),
            }
        
        return document
    
    def _extract_data(self, document: Document) -> ExtractionResult:
        """Extract data from document."""
        return ExtractorFactory.extract(document)

    def _validate_result(
        self,
        result: ExtractionResult,
        document: Document,
    ) -> ExtractionResult:
        """Validate canonical extractor output centrally in the pipeline."""
        if not result.success or not isinstance(result.data, dict) or not result.data:
            return result

        try:
            canonical = CanonicalOutput.model_validate(result.data)
            validated = validate(canonical)
            result.data = validated.to_dict()

            raw = result.data.get('raw') or {}
            validation_warnings = raw.get('validation_warnings', [])
            if isinstance(validation_warnings, list):
                result.warnings = self._dedupe_messages(
                    [*result.warnings, *(str(item) for item in validation_warnings)]
                )

            if result.metadata is None:
                result.metadata = {}

            result.metadata['canonical_validated'] = True
            result.metadata['validation_stage'] = 'pipeline'
            return result
        except ExtractionValidationError as exc:
            return ExtractionResult(
                success=False,
                data=result.data,
                confidence=result.confidence,
                warnings=self._dedupe_messages(result.warnings),
                errors=self._dedupe_messages([*result.errors, f"Validation failed: {str(exc)}"]),
                field_confidence=result.field_confidence,
                metadata={
                    **(result.metadata or {}),
                    'canonical_validated': False,
                    'validation_stage': 'pipeline',
                    'document_type': document.document_type.value,
                },
            )
        except Exception as exc:
            return ExtractionResult(
                success=False,
                data=result.data,
                confidence=result.confidence,
                warnings=self._dedupe_messages(result.warnings),
                errors=self._dedupe_messages([*result.errors, f"Canonical normalization failed: {str(exc)}"]),
                field_confidence=result.field_confidence,
                metadata={
                    **(result.metadata or {}),
                    'canonical_validated': False,
                    'validation_stage': 'pipeline',
                    'document_type': document.document_type.value,
                },
            )

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
            'ocr_enrichment_enabled': self.enable_ocr_enrichment,
            'ocr_applied': bool(document.metadata.get('ocr_applied')),
        }
        result.metadata['document_support'] = assess_document_support(document)
        classification_metadata = document.metadata.get('classification', {})
        document_support = result.metadata['document_support']
        low_confidence_fields = result.get_low_confidence_fields()
        validation_warning_count = len(result.warnings)

        review_reasons = self._dedupe_messages([
            *(document_support.get('review_reasons') or []),
            *(
                ['Classifier disagreement requires review before relying on this result.']
                if classification_metadata.get('conflict_detected')
                else []
            ),
            *(
                [f"{len(low_confidence_fields)} extracted field(s) are below the confidence threshold."]
                if low_confidence_fields
                else []
            ),
            *(
                [f"{validation_warning_count} validation warning(s) were generated during extraction."]
                if validation_warning_count
                else []
            ),
        ])

        review_required = any([
            document_support.get('needs_review', False),
            classification_metadata.get('review_required', False),
            bool(low_confidence_fields),
            validation_warning_count > 0,
            not result.success,
        ])

        recommended_action = document_support.get('recommended_action', 'extract')
        if review_required and recommended_action == 'extract':
            recommended_action = 'review_then_extract'

        result.metadata['review_required'] = review_required
        result.metadata['recommended_action'] = recommended_action
        result.metadata['review_reasons'] = review_reasons
        result.metadata['classification'] = classification_metadata
        result.metadata['classification_training_record'] = document.metadata.get(
            'classification_training_record',
            {},
        )
        result.metadata['low_confidence_field_count'] = len(low_confidence_fields)
        result.metadata['low_confidence_fields'] = [
            {'field_id': field_id, 'confidence': confidence}
            for field_id, confidence in low_confidence_fields
        ]
        result.metadata['validation_warning_count'] = validation_warning_count
        result.metadata['extraction_method'] = (
            (result.data.get('source') or {}).get('extraction_method')
            if isinstance(result.data, dict)
            else None
        )
        result.metadata['support_status'] = result.metadata['document_support'].get('support_level')
        result.metadata['stages'] = [
            'load',
            'ocr_enrichment' if self.enable_ocr_enrichment else 'ocr_skipped',
            'classify' if self.use_classification else 'classify_skipped',
            'support_gate',
            'extract',
            'validate',
            'normalize_metadata',
        ]
        result.warnings = self._dedupe_messages(result.warnings)
        result.errors = self._dedupe_messages(result.errors)

        return result

    def _dedupe_messages(self, messages: List[str]) -> List[str]:
        seen = set()
        deduped: List[str] = []
        for message in messages:
            if not message:
                continue
            if message in seen:
                continue
            deduped.append(message)
            seen.add(message)
        return deduped
    
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
            'enable_ocr_enrichment': self.enable_ocr_enrichment,
            'ocr_text_threshold': self.ocr_text_threshold,
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
