"""
Extraction service - handles file upload, classification, and extraction workflow.
Uses real extraction pipeline with classifiers and extractors.
"""

import os
import uuid
import logging
import tempfile
from datetime import datetime
from threading import Lock
from typing import Dict, List, Optional, Any
from werkzeug.utils import secure_filename

from utils.file_utils import allowed_file, get_file_extension

# Import extraction components
from extraction.core import UniversalFileLoader, Document
from extraction.classifiers import classifier_registry
from extraction.extractors import ExtractorFactory
from extraction.pipeline import ExtractionPipeline
from extraction import extract_from_file
from extraction.support import assess_document_support

logger = logging.getLogger(__name__)


class ExtractionService:
    """Service for managing extraction workflow with real extractors."""
    
    def __init__(self):
        """Initialize extraction service."""
        self.workspace_dir = tempfile.mkdtemp(prefix="fillform_extraction_")
        self.uploads_dir = os.path.join(self.workspace_dir, 'uploads')
        self.results_dir = os.path.join(self.workspace_dir, 'results')
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.results_dir, exist_ok=True)
        self._state_lock = Lock()
        
        # Initialize extraction components
        self.file_loader = UniversalFileLoader()
        
        # Create composite classifier with all available classifiers
        self.classifier = classifier_registry.create_composite(
            classifier_names=['mime', 'keyword', 'table'],
            strategy='highest_confidence'
        )
        
        # Create extraction pipeline
        self.pipeline = ExtractionPipeline(
            use_classification=True,
            classification_strategy='highest_confidence',
            min_classification_confidence=0.6
        )
        
        # Storage (persisted to disk)
        self.files: Dict[str, Dict[str, Any]] = {}
        self.classifications: Dict[str, Dict[str, Any]] = {}
        self.extractions: Dict[str, Dict[str, Any]] = {}
        self.jobs: Dict[str, Dict[str, Any]] = {}

        self._load_state()

    def _require_owned_file(self, file_id: str, current_user_id: Optional[str] = None) -> Dict[str, Any]:
        file_meta = self.files.get(file_id)
        if not file_meta:
            raise ValueError(f'File not found: {file_id}')
        owner_user_id = file_meta.get('owner_user_id')
        if current_user_id and owner_user_id and owner_user_id != current_user_id:
            raise ValueError(f'File not found: {file_id}')
        return file_meta
    
    def upload_file(
        self,
        file,
        folder_id: Optional[str] = None,
        current_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a file for extraction.
        
        Args:
            file: Werkzeug FileStorage object
            folder_id: Optional folder ID to associate with
        
        Returns:
            {
                "file_id": "uuid",
                "file_name": "document.pdf",
                "file_size": 12345,
                "mime_type": "application/pdf"
            }
        """
        # Validate file
        if not file or file.filename == '':
            raise ValueError('No file provided')
        
        if not allowed_file(file.filename):
            raise ValueError(f'File type not allowed: {file.filename}')
        
        # Generate file ID
        file_id = str(uuid.uuid4())
        
        # Secure filename
        filename = secure_filename(file.filename)
        extension = get_file_extension(filename)
        
        # Save file
        file_path = os.path.join(self.uploads_dir, f'{file_id}{extension}')
        file.save(file_path)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Store metadata
        file_metadata = {
            'file_id': file_id,
            'file_name': filename,
            'file_path': file_path,
            'file_size': file_size,
            'mime_type': file.content_type or 'application/octet-stream',
            'folder_id': folder_id,
            'owner_user_id': current_user_id,
            'uploaded_at': datetime.utcnow().isoformat(),
            'status': 'uploaded'
        }
        
        self.files[file_id] = file_metadata
        self._save_state()
        
        return {
            'file_id': file_id,
            'file_name': filename,
            'file_size': file_size,
            'mime_type': file_metadata['mime_type']
        }
    
    def classify_document(self, file_id: str, current_user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Classify a document using real classifiers.
        
        Args:
            file_id: File ID to classify
        
        Returns:
            {
                "document_type": "acord_126",
                "confidence": 0.95,
                "indicators": ["ACORD 126 header found", "..."],
                "classifier_results": [...]
            }
        """
        # Get file metadata
        file_meta = self._require_owned_file(file_id, current_user_id)
        file_path = file_meta['file_path']
        
        try:
            # Load document
            document = self.file_loader.load(file_path)

            document = self.pipeline._maybe_enrich_with_ocr(document)
            document = self.pipeline._classify_document(document)

            classification = {
                'document_type': document.document_type.value,
                'confidence': document.confidence,
                'classified_at': document.metadata.get('classification_timestamp'),
                **(document.metadata.get('classification') or {}),
            }
            classification.update(assess_document_support(document))
            
            self.classifications[file_id] = classification
            self.files[file_id]['status'] = 'classified'
            self._save_state()
            
            return classification
            
        except Exception as e:
            # Fallback classification on error
            classification = {
                'document_type': 'unknown',
                'confidence': 0.0,
                'indicators': [f'Classification failed: {str(e)}'],
                'classifier_results': [],
                'classified_at': datetime.utcnow().isoformat()
            }
            classification.update(
                assess_document_support(
                    'unknown',
                    confidence=0.0,
                    file_name=file_meta['file_name'],
                )
            )
            
            self.classifications[file_id] = classification
            self.files[file_id]['status'] = 'classification_failed'
            self._save_state()
            
            return classification
    
    def extract_document(
        self,
        file_id: str,
        document_type: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
        current_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract data from a document using real extractors.
        
        Args:
            file_id: File ID to extract from
            document_type: Document type (if known)
            options: Extraction options
        
        Returns:
            {
                "success": true,
                "data": {...},
                "confidence": 0.92,
                "warnings": [],
                "errors": [],
                "metadata": {...}
            }
        """
        # Get file metadata
        file_meta = self._require_owned_file(file_id, current_user_id)
        file_path = file_meta['file_path']
        
        try:
            # Use the extraction pipeline for complete workflow
            result = self.pipeline.process(
                file_path,
                override_document_type=document_type,
            )
            
            # Convert ExtractionResult to API format
            extraction_result = {
                'success': result.success,
                'data': result.data or {},
                'confidence': result.confidence,
                'warnings': result.warnings or [],
                'errors': result.errors or [],
                'metadata': {
                    'extractor_used': result.metadata.get('extractor_used', 'Unknown') if result.metadata else 'Unknown',
                    'document_type': result.metadata.get('document_type', 'unknown') if result.metadata else 'unknown',
                    'extraction_date': datetime.utcnow().isoformat(),
                    'file_id': file_id
                }
            }
            
            # Add any additional metadata from result
            if result.metadata:
                extraction_result['metadata'].update(result.metadata)
            
            # Store extraction
            self.extractions[file_id] = extraction_result
            
            if result.success:
                self.files[file_id]['status'] = 'extracted'
            else:
                self.files[file_id]['status'] = 'extraction_failed'
            
            self._save_state()
            
            return extraction_result
            
        except Exception as e:
            # Return error result
            error_result = {
                'success': False,
                'data': {},
                'confidence': 0.0,
                'warnings': [],
                'errors': [f'Extraction failed: {str(e)}'],
                'metadata': {
                    'extractor_used': 'None',
                    'document_type': document_type or 'unknown',
                    'extraction_date': datetime.utcnow().isoformat(),
                    'file_id': file_id
                }
            }
            
            self.extractions[file_id] = error_result
            self.files[file_id]['status'] = 'extraction_failed'
            self._save_state()
            
            return error_result
    
    def fuse_documents(
        self,
        file_ids: List[str],
        group_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
        current_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fuse data from multiple documents using fusion strategy.
        
        Args:
            file_ids: List of file IDs to fuse
            group_id: Optional group ID
            options: Fusion options
        
        Returns:
            Fused extraction result
        """
        from extraction.strategies import FusionStrategy, DocumentGroup
        
        # Extract all files if not already extracted
        documents = []
        extractions = []
        
        for file_id in file_ids:
            if file_id not in self.extractions:
                self.extract_document(file_id, current_user_id=current_user_id)
            
            try:
                file_meta = self._require_owned_file(file_id, current_user_id)
            except ValueError:
                continue
            file_path = file_meta['file_path']
            try:
                doc = self.file_loader.load(file_path)
                documents.append(doc)
                extractions.append(self.extractions.get(file_id))
            except:
                pass
        
        # Use fusion strategy
        try:
            fusion = FusionStrategy()
            doc_group = DocumentGroup(
                group_id=group_id or str(uuid.uuid4()),
                documents=documents
            )
            
            fused_result = fusion.fuse(doc_group)
            
            return {
                'success': fused_result.success,
                'data': {
                    'submission_id': doc_group.group_id,
                    'fused_data': fused_result.data
                },
                'confidence': fused_result.confidence,
                'warnings': fused_result.warnings or [],
                'errors': fused_result.errors or []
            }
            
        except Exception as e:
            # Fallback: simple merge
            fused_data = {}
            for extraction in extractions:
                if extraction and extraction.get('success'):
                    fused_data.update(extraction.get('data', {}))
            
            return {
                'success': True,
                'data': {
                    'submission_id': group_id or str(uuid.uuid4()),
                    'fused_data': fused_data
                },
                'confidence': 0.7,
                'warnings': [f'Used fallback fusion: {str(e)}'],
                'errors': []
            }
    
    def get_job_status(self, job_id: str, current_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get async job status."""
        job = self.jobs.get(job_id)
        if not job:
            return None
        owner_user_id = job.get("owner_user_id")
        if current_user_id and owner_user_id and owner_user_id != current_user_id:
            return None
        return job

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _load_state(self) -> None:
        return

    def _save_state(self) -> None:
        return
    
    def get_extraction_result(self, extraction_id: str, current_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get extraction result."""
        try:
            self._require_owned_file(extraction_id, current_user_id)
        except ValueError:
            return None
        return self.extractions.get(extraction_id)
    
    def delete_file(self, file_id: str, current_user_id: Optional[str] = None) -> None:
        """Delete a file and its associated data."""
        try:
            file_meta = self._require_owned_file(file_id, current_user_id)
        except ValueError:
            return
        if file_id in self.files:
            # Delete physical file
            file_path = file_meta['file_path']
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Delete metadata
            del self.files[file_id]
            
            if file_id in self.classifications:
                del self.classifications[file_id]
            
            if file_id in self.extractions:
                del self.extractions[file_id]
    
    def get_supported_formats(self) -> Dict[str, Any]:
        """Get supported file formats and capabilities."""
        from extraction.parsers import PARSER_CAPABILITIES
        from extraction.extractors import extractor_registry
        from extraction.core import DocumentType
        
        return {
            'file_types': ['.pdf', '.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.tiff', '.docx'],
            'document_types': [
                {'value': dt.value, 'label': dt.value.replace('_', ' ').title()}
                for dt in DocumentType
                if dt != DocumentType.UNKNOWN
            ],
            'extractors': [
                {
                    'name': name,
                    'supported_types': [dt.value for dt in info.get('supported_types', [])],
                    'description': info.get('description', '')
                }
                for name, info in extractor_registry.get_extractor_info().items()
            ],
            'parsers': [
                {
                    'name': name,
                    'supported_extensions': caps.get('file_types', []),
                    'description': f'Parses {name.replace("Parser", "")} files'
                }
                for name, caps in PARSER_CAPABILITIES.items()
            ]
        }
