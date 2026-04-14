"""
Submission service - orchestrates extraction and filling workflow.
"""

import copy
import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from enum import Enum

from extraction.classifiers import classifier_registry
from extraction.core.document import Document, DocumentType
from extraction.extractors.mfc import MFC
from filling.fillers import *  # noqa: F401,F403 - ensure fillers register themselves
from filling.fillers.base_filler import BaseFiller
from lib.submission_templates import TEMPLATES, get_template
from services.client_service import ClientService
from services.comparison_service import ComparisonService
from services.export_service import ExportService
from dataclasses import dataclass, field as dataclass_field
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from services.submission_file_store import SubmissionFileStore
from services.submission_extraction_coordinator import SubmissionExtractionCoordinator
from services.submission_fill_coordinator import SubmissionFillCoordinator
from services.submission_merge_coordinator import SubmissionMergeCoordinator
from services.submission_query_service import SubmissionQueryService
from services.submission_repository import SubmissionRepository
from services.version_service import VersionService

logger = logging.getLogger(__name__)


class MergeStrategy(Enum):
    """
    Strategy for resolving conflicts when merging entity values.
    """
    HIGHEST_CONFIDENCE = "highest_confidence"  # Pick value with highest confidence score
    MOST_RECENT = "most_recent"                # Pick value from most recently processed file
    PRIMARY_SOURCE = "primary_source"          # Prioritize specific document types (e.g., ACORD over supplemental)
    MANUAL_REVIEW = "manual_review"            # Flag for manual review, don't auto-resolve
    CONSENSUS = "consensus"                     # Require multiple sources to agree
    
    def __str__(self):
        return self.value
@dataclass
class MergeConfig:
    """
    Configuration for merge behavior.
    
    Example:
        config = MergeConfig(
            strategy=MergeStrategy.HIGHEST_CONFIDENCE,
            min_confidence_threshold=0.6,
            track_sources=True
    )
    """
    # Merge strategy to use
    strategy: MergeStrategy = MergeStrategy.HIGHEST_CONFIDENCE
    
    # Minimum confidence threshold (conflicts below this always flagged for manual review)
    min_confidence_threshold: float = 0.5
    
    # Similarity threshold for considering values "the same" (0-1)
    similarity_threshold: float = 0.85
    
    # Whether to track which source contributed which field
    track_sources: bool = True
    
    # Whether to log conflicts for monitoring
    log_conflicts: bool = True
    
    # Source priority for PRIMARY_SOURCE strategy (higher priority = more trusted)
    # Example: {"ACORD_126": 3, "LOSS_RUN": 2, "SUPPLEMENTAL": 1}
    source_priority: Dict[str, int] = dataclass_field(default_factory=dict)
    
    # For CONSENSUS strategy: minimum number of sources that must agree
    consensus_threshold: int = 2
    
    def __post_init__(self):
        """Validate configuration."""
        if not 0 <= self.min_confidence_threshold <= 1:
            raise ValueError("min_confidence_threshold must be between 0 and 1")
        if not 0 <= self.similarity_threshold <= 1:
            raise ValueError("similarity_threshold must be between 0 and 1")
        if self.consensus_threshold < 2:
            raise ValueError("consensus_threshold must be at least 2")

@dataclass
class MergeConflict:
    """
    Represents a conflict when merging entity values from multiple sources.
    """
    field_id: str
    values: List[Dict[str, Any]]
    selected_value: Optional[Any] = None
    resolution_strategy: Optional[str] = None
    resolution_reason: Optional[str] = None  # Note: Why this value was chosen
    confidence: float = 0.0
    
    def __repr__(self) -> str:
        return f"MergeConflict(field={self.field_id}, values={len(self.values)}, selected={self.selected_value})"



class IntelligentMerger:
    """
    Intelligent merger that resolves conflicts using configurable strategies.
    
    Handles:
    - Conflict detection
    - Confidence-based value selection
    - Source attribution tracking
    - Merge metadata generation
    
    Example:
        merger = IntelligentMerger(config=merge_config, service=submission_service)
        result = merger.merge_entities(existing_entities, incoming_entities, incoming_source_info)
    """
    
    def __init__(self, config: MergeConfig, service: 'SubmissionService'):
        """
        Initialize merger with configuration and service reference.
        
        Args:
            config: MergeConfig with strategy and settings
            service: Reference to SubmissionService (for helper methods)
        """
        self.config = config
        self.service = service
        self.conflicts_detected: List[MergeConflict] = []
        self.source_attribution: Dict[str, List[str]] = {}  # field_id -> list of sources
        
    def merge_entities(
        self,
        existing_entities: Dict[str, List[Dict[str, Any]]],
        incoming_entities: Dict[str, List[Dict[str, Any]]],
        incoming_source_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge incoming entities into existing entities with intelligent conflict resolution.
        
        Args:
            existing_entities: Entities already in merged data (entities dict from CanonicalOutput)
            incoming_entities: New entities from file being merged
            incoming_source_info: Metadata about incoming source (filename, type, timestamp)
            
        Returns:
            Dict with:
                - merged_entities: Updated entities dict
                - conflicts: List of MergeConflict objects
                - source_attribution: Dict mapping field_id -> source list
                - metadata: Merge statistics
        """
        merged_entities = copy.deepcopy(existing_entities) if existing_entities else {}
        self.conflicts_detected = []
        self.source_attribution = copy.deepcopy(self.source_attribution) if hasattr(self, 'source_attribution') else {}
        
        # Process each field in incoming entities
        for field_id, incoming_values in incoming_entities.items():
            if not incoming_values:
                continue
            
            # Add source metadata to incoming values
            incoming_with_source = self._add_source_metadata(
                incoming_values,
                incoming_source_info
            )
            
            # Check if field exists in merged data
            if field_id not in merged_entities or not merged_entities[field_id]:
                # No conflict - just add new field
                merged_entities[field_id] = incoming_with_source
                self._track_source(field_id, incoming_source_info.get("filename", "unknown"))
                continue
            
            existing_values = merged_entities[field_id]
            
            # Detect conflicts
            conflict = self.service._detect_merge_conflicts(
                field_id,
                existing_values,
                incoming_with_source
            )
            
            if conflict:
                # Conflict detected - resolve it
                resolved = self._resolve_conflict(conflict)
                merged_entities[field_id] = resolved["values"]
                self.conflicts_detected.append(resolved["conflict"])
                
                if self.config.log_conflicts:
                    self.service._log_conflicts([resolved["conflict"]])
            else:
                # No conflict - values are similar or compatible
                # Merge lists (will be deduped later)
                merged_entities[field_id] = existing_values + incoming_with_source
                self._track_source(field_id, incoming_source_info.get("filename", "unknown"))
        
        # Calculate merge statistics
        metadata = self._build_merge_metadata(
            existing_entities,
            incoming_entities,
            merged_entities
        )
        
        return {
            "merged_entities": merged_entities,
            "conflicts": self.conflicts_detected,
            "source_attribution": self.source_attribution,
            "metadata": metadata
        }
    
    def _add_source_metadata(
        self,
        values: List[Dict[str, Any]],
        source_info: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Add source metadata to each value for tracking.
        
        Args:
            values: List of entity values
            source_info: Source metadata (filename, type, timestamp)
            
        Returns:
            Values with added source metadata
        """
        enriched = []
        for val in values:
            if isinstance(val, dict):
                enriched_val = copy.deepcopy(val)
                enriched_val["source"] = source_info.get("filename", "unknown")
                enriched_val["source_type"] = source_info.get("document_type", "UNKNOWN")
                enriched_val["timestamp"] = source_info.get("timestamp", datetime.utcnow().isoformat())
                enriched.append(enriched_val)
            else:
                # Convert primitive to dict with metadata
                enriched.append({
                    "value": val,
                    "confidence": 0.5,
                    "source": source_info.get("filename", "unknown"),
                    "source_type": source_info.get("document_type", "UNKNOWN"),
                    "timestamp": source_info.get("timestamp", datetime.utcnow().isoformat())
                })
        return enriched
    
    def _resolve_conflict(self, conflict: MergeConflict) -> Dict[str, Any]:
        """
        Resolve a conflict using configured strategy.
        
        Args:
            conflict: MergeConflict to resolve
            
        Returns:
            Dict with resolved values and updated conflict object
        """
        if self.config.strategy == MergeStrategy.MANUAL_REVIEW:
            # Don't auto-resolve - flag for manual review
            conflict.resolution_strategy = "manual_review"
            conflict.resolution_reason = "Flagged for manual review per configuration"
            return {
                "values": conflict.values,  # Keep all values
                "conflict": conflict
            }
        
        # Check if all values below confidence threshold
        max_confidence = max(v.get("confidence", 0) for v in conflict.values)
        if max_confidence < self.config.min_confidence_threshold:
            # Low confidence - flag for manual review
            conflict.resolution_strategy = "manual_review"
            conflict.resolution_reason = f"All values below confidence threshold ({self.config.min_confidence_threshold})"
            return {
                "values": conflict.values,
                "conflict": conflict
            }
        
        # Select best value using configured strategy
        selected_value, confidence, reason = self.service._select_best_value(
            conflict.values,
            strategy=self.config.strategy
        )
        
        # Update conflict with resolution
        conflict.selected_value = selected_value
        conflict.confidence = confidence
        conflict.resolution_strategy = str(self.config.strategy)
        conflict.resolution_reason = reason
        
        # Return only the selected value (wrapped in list for consistency)
        selected_entry = next(
            (v for v in conflict.values if v.get("value") == selected_value),
            conflict.values[0]  # Fallback to first if not found
        )
        
        return {
            "values": [selected_entry],
            "conflict": conflict
        }
    
    def _track_source(self, field_id: str, source: str) -> None:
        """
        Track which source contributed to which field.
        
        Args:
            field_id: Field identifier
            source: Source filename or identifier
        """
        if not self.config.track_sources:
            return
        
        if field_id not in self.source_attribution:
            self.source_attribution[field_id] = []
        
        if source not in self.source_attribution[field_id]:
            self.source_attribution[field_id].append(source)
    
    def _build_merge_metadata(
        self,
        existing_entities: Dict[str, Any],
        incoming_entities: Dict[str, Any],
        merged_entities: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Build metadata about the merge operation.
        
        Returns:
            Dict with merge statistics
        """
        return {
            "strategy_used": str(self.config.strategy),
            "conflicts_detected": len(self.conflicts_detected),
            "fields_added": len(set(incoming_entities.keys()) - set(existing_entities.keys())),
            "fields_updated": len(set(incoming_entities.keys()) & set(existing_entities.keys())),
            "total_fields": len(merged_entities),
            "merged_at": datetime.utcnow().isoformat(),
            "confidence_threshold": self.config.min_confidence_threshold,
            "similarity_threshold": self.config.similarity_threshold,
        }
class SubmissionService:
    """
    Service for managing submission workflow.
    
    Coordinates:
    - File upload and storage
    - Data extraction
    - PDF filling
    - File retrieval
    """

    
    def __init__(self, current_user_id: Optional[str] = None):
        """Initialize service dependencies."""
        self.current_user_id = current_user_id
        self.client_service = ClientService(current_user_id=current_user_id)
        self.filler_cache: Dict[str, BaseFiller] = {}

        self.version_service = VersionService(current_user_id=current_user_id)
        self.comparison_service = ComparisonService()
        self.export_service = ExportService(self)

        self.classifier = classifier_registry.create_composite(
            classifier_names=['mime', 'keyword', 'table'],
            strategy='highest_confidence'
        )
        self.file_store = SubmissionFileStore()
        self.remote_storage = self.file_store.storage
        if not self.file_store.enabled:
            raise RuntimeError("Supabase storage must be configured for file storage.")
        self.repository = SubmissionRepository(current_user_id=current_user_id)
        self.db = self.repository.db
        self.fill_coordinator = SubmissionFillCoordinator(
            repository=self.repository,
            file_store=self.file_store,
            select_filler=self._select_filler,
            merge_input_data=self._merge_input_data,
        )
        self.merge_coordinator = SubmissionMergeCoordinator(
            load_input_data=self._load_input_data,
        )
        self.extraction_coordinator = SubmissionExtractionCoordinator(
            repository=self.repository,
            file_store=self.file_store,
            client_service=self.client_service,
            version_service=self.version_service,
            merge_coordinator=self.merge_coordinator,
        )
        self.query_service = SubmissionQueryService(
            repository=self.repository,
            get_submission=self.get_submission,
        )

        self.merge_config = MergeConfig(
            strategy=MergeStrategy.HIGHEST_CONFIDENCE,
            min_confidence_threshold=0.5,
            similarity_threshold=0.85,
            track_sources=True,
            log_conflicts=True,
            source_priority={
                "ACORD_25": 3,
                "ACORD_126": 3,
                "ACORD_125": 3,
                "ACORD_130": 3,
                "ACORD_140": 3,
                "LOSS_RUN": 2,
                "SOV": 2,
                "FINANCIAL_STATEMENT": 2,
                "SUPPLEMENTAL": 1,
            },
            consensus_threshold=2
        )
        if not self.repository.enabled:
            raise RuntimeError("Supabase database must be configured for submission metadata storage.")
    def upload_and_extract(
        self,
        file,
        folder_id: Optional[str] = None,
        client_id: Optional[str] = None,
        submission_id: Optional[str] = None,
        progress_callback=None,
    ):
        """
        Upload a PDF to Supabase Storage, extract data, and persist metadata remotely.
        """
        return self.extraction_coordinator.upload_and_extract(
            file,
            folder_id=folder_id,
            client_id=client_id,
            submission_id=submission_id,
            progress_callback=progress_callback,
            on_folder_submission=self._add_submission_to_folder,
        )
    
    def get_submission_metadata(self, submission_id: str) -> Optional[Dict[str, Any]]:
        return self.repository.get(submission_id)

    def _add_submission_to_folder(self, folder_id: str, submission_id: str, filename: str) -> None:
        from services.folder_service import FolderService

        FolderService().add_submission(folder_id, submission_id, filename)

    def get_submission(
        self,
        submission_id: str,
        client_id: Optional[str] = None,
        input_id: Optional[str] = None,
    ):
        """
        Get submission data.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            Dictionary with submission details
        """
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return None
        
        if client_id and metadata.get('client_id') and metadata.get('client_id') != client_id:
            return None
        
        resolved_client_id = metadata.get('client_id')
        client_name = None
        if resolved_client_id:
            try:
                client = self.client_service.get_client(resolved_client_id)
                if client:
                    client_name = client.get('name')
            except Exception:
                client_name = None
        
        selected_input_id = None
        payload_data = metadata.get('data', {})
        filename = metadata['filename']

        if input_id:
            input_entry = next(
                (entry for entry in metadata.get('inputs', []) if entry.get('input_id') == input_id),
                None,
            )
            if not input_entry:
                return None
            payload_data = self._load_input_data(input_entry) or payload_data
            filename = input_entry.get('filename') or filename
            selected_input_id = input_entry.get('input_id')

        return {
            'submission_id': submission_id,
            'client_id': resolved_client_id,
            'client_name': client_name,
            'folder_id': metadata.get('folder_id'),
            'template_type': metadata.get('template_type'),
            'template_metadata': metadata.get('template_metadata'),
            'filename': filename,
            'status': metadata['status'],
            'uploaded_at': metadata['uploaded_at'],
            'confidence': metadata.get('confidence'),
            'warnings': metadata.get('warnings', []),
            'data': payload_data,
            'input_id': selected_input_id,
        }

    def get_submission_package(self, submission_id: str) -> Optional[Dict[str, Any]]:
        """Return submission package metadata with inputs/outputs."""
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return None

        if self._prune_duplicate_inputs(metadata):
            self._persist_submission_metadata(metadata)

        inputs = metadata.get('inputs') or []
        outputs = metadata.get('outputs') or []
        uploaded_at = metadata.get('uploaded_at') or metadata.get('created_at')
        updated_at = metadata.get('updated_at') or uploaded_at
        client_id = metadata.get('client_id')
        client_name = None
        if client_id:
            try:
                client = self.client_service.get_client(client_id)
                if client:
                    client_name = client.get('name')
            except Exception:
                client_name = None

        submission_name = metadata.get('name') or metadata.get('title') or f"Submission {submission_id[:8]}"

        return {
            'submission_id': submission_id,
            'client_id': client_id,
            'client_name': client_name,
            'name': submission_name,
            'template_type': metadata.get('template_type'),
            'template_metadata': metadata.get('template_metadata'),
            'status': metadata.get('status', 'uploaded'),
            'uploaded_at': uploaded_at,
            'updated_at': updated_at,
            'file_count': metadata.get('file_count') or len(inputs),
            'inputs': inputs,
            'outputs': outputs,
        }

    def _prune_duplicate_inputs(self, metadata: Dict[str, Any]) -> bool:
        inputs = metadata.get("inputs") or []
        if len(inputs) < 2:
            return False

        changed = False
        seen_keys = set()
        deduped_inputs: List[Dict[str, Any]] = []

        for entry in inputs:
            duplicate_key = self._input_duplicate_key(entry)
            if duplicate_key in seen_keys:
                changed = True
                continue
            seen_keys.add(duplicate_key)
            deduped_inputs.append(entry)

        if not changed:
            return False

        metadata["inputs"] = deduped_inputs
        metadata["file_count"] = len(deduped_inputs)
        metadata["updated_at"] = datetime.utcnow().isoformat()
        metadata["data"] = self._merge_input_data(deduped_inputs) if deduped_inputs else {}

        outputs = metadata.get("outputs") or []
        if outputs:
            metadata["status"] = "filled"
        elif metadata["data"]:
            metadata["status"] = "ready"
        elif deduped_inputs:
            metadata["status"] = "extracted"
        else:
            metadata["status"] = "created"

        return True

    def _input_duplicate_key(self, entry: Dict[str, Any]) -> str:
        file_hash = entry.get("file_hash")
        if file_hash:
            return f"file:{file_hash}"

        extraction_hash = entry.get("extraction_hash")
        if extraction_hash:
            return f"extract:{extraction_hash}"

        filename = (entry.get("filename") or "").strip().lower()
        file_size = entry.get("file_size")
        if filename and file_size is not None:
            return f"name-size:{filename}:{file_size}"

        data = entry.get("data")
        if data:
            payload = json.dumps(data, sort_keys=True, separators=(",", ":"))
            return f"data:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"

        return f"id:{entry.get('input_id') or filename}"
    
    def update_data(
        self,
        submission_id: str,
        data: Dict[str, Any],
        user: str = 'user',
        notes: str = ''
    ):
        """
        Update submission extracted data with versioning & audit metadata.

        - Overwrites the JSON data for this submission.
        - Does NOT change workflow/status.
        - Records a version in VersionService.
        - Updates last_edited_at / last_edited_by.
        """
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        changed_fields = self._diff_semantic_field_values(
            metadata.get("data") or {},
            data or {},
        )

        version_id = self.version_service.create_version(
            submission_id=submission_id,
            data=data,
            user=user,
            action='edit',
            notes=notes or 'Manual data update',
        )

        metadata['data'] = data
        metadata['current_version_id'] = version_id
        metadata['last_edited_at'] = datetime.utcnow().isoformat()
        metadata['last_edited_by'] = user
        if changed_fields:
            self._record_field_corrections(metadata, changed_fields)

        self._persist_submission_metadata(metadata)

        # Return fresh snapshot
        updated = self.get_submission(submission_id)
        return updated

    def delete_submission(self, submission_id: str) -> bool:
        """
        Delete a submission's files and metadata, updating folder/client references.
        """
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return False

        for input_meta in metadata.get("inputs", []):
            storage_info = input_meta.get("storage") or {}
            self.file_store.delete(storage_info)

        for output_meta in metadata.get("outputs", []):
            storage_info = output_meta.get("storage") or {}
            self.file_store.delete(storage_info)

        self.repository.delete(submission_id)

        folder_id = metadata.get("folder_id")
        if folder_id:
            try:
                from services.folder_service import FolderService
                FolderService().remove_submission(folder_id, submission_id)
            except Exception as exc:
                logger.warning("failed to update folder %s: %s", folder_id, exc)

        client_id = metadata.get("client_id")
        if client_id:
            try:
                self.client_service.remove_submission(client_id, submission_id)
            except Exception as exc:
                logger.warning("failed to update client %s: %s", client_id, exc)

        return True


    def fill_pdf(
        self,
        submission_id: str,
        input_ids: Optional[List[str]] = None,
        template_id: Optional[str] = None,
    ):
        """
        Fill PDF with data using the canonical extraction output.

        Args:
            submission_id: Submission identifier

        Returns:
            FillReport
        """
        try:
            return self.fill_coordinator.fill_submission(
                submission_id=submission_id,
                input_ids=input_ids,
                template_id=template_id,
            )
        except Exception as e:
            logger.exception("fill_pdf failed for submission_id=%s", submission_id)
            raise

    
    def _load_input_data(self, entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        data = entry.get("data")
        if data:
            return data
        data_path = entry.get("data_path")
        abs_path = self._abs_storage_path(data_path)
        if abs_path and os.path.exists(abs_path):
            try:
                with open(abs_path, "r") as f:
                    return json.load(f)
            except Exception:
                return None
        return None


    def _detect_merge_conflicts(
        self,
        field_id: str,
        existing_values: List[Dict[str, Any]],
        incoming_values: List[Dict[str, Any]]
    ) -> Optional[MergeConflict]:
        """
        Detect if merging incoming values with existing values creates a conflict.
        
        A conflict exists when:
        - Same field has different values from different sources
        - Values are not exact duplicates
        - Both have reasonable confidence (> 0.5)
        
        Args:
            field_id: The field being merged (e.g., "insured_name")
            existing_values: Values already in merged data
            incoming_values: Values from new file being merged
            
        Returns:
            MergeConflict if conflict detected, None otherwise
            
        Example:
            >>> existing = [{"value": "ABC Corp", "confidence": 0.98, "source": "file1"}]
            >>> incoming = [{"value": "ABC Corporation", "confidence": 0.65, "source": "file2"}]
            >>> conflict = service._detect_merge_conflicts("insured_name", existing, incoming)
            >>> conflict.field_id
            'insured_name'
            >>> len(conflict.values)
            2
        """
        # No conflict if either list is empty
        if not existing_values or not incoming_values:
            return None
        
        # Extract just the values for comparison
        existing_vals = [
            v.get("value") if isinstance(v, dict) else v 
            for v in existing_values
        ]
        incoming_vals = [
            v.get("value") if isinstance(v, dict) else v 
            for v in incoming_values
        ]
        
        # Normalize for comparison (case-insensitive, whitespace collapsed)
        def normalize(val):
            if val is None:
                return ""
            s = str(val).strip().lower()
            return " ".join(s.split())  # Collapse whitespace
        
        existing_normalized = {normalize(v) for v in existing_vals}
        incoming_normalized = {normalize(v) for v in incoming_vals}
        
        # Check if there are any non-overlapping values
        if existing_normalized.isdisjoint(incoming_normalized):
            # Conflict detected - values are different
            all_values = []
            
            # Add existing values with metadata
            for val in existing_values:
                if isinstance(val, dict):
                    all_values.append(val)
                else:
                    all_values.append({
                        "value": val,
                        "confidence": 0.5,  # Default confidence
                        "source": "unknown"
                    })
            
            # Add incoming values with metadata
            for val in incoming_values:
                if isinstance(val, dict):
                    all_values.append(val)
                else:
                    all_values.append({
                        "value": val,
                        "confidence": 0.5,
                        "source": "unknown"
                    })
            
            # Only report as conflict if we have at least 2 values with reasonable confidence
            high_conf_values = [v for v in all_values if v.get("confidence", 0) > 0.5]
            if len(high_conf_values) >= 2:
                return MergeConflict(
                    field_id=field_id,
                    values=all_values,
                )
        
        return None

    def _merge_input_data(self, inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Deterministically merge multiple extracted inputs into one canonical payload."""
        included_inputs = [
            entry for entry in inputs
            if entry.get("included_in_merge", True)
        ]
        return self.merge_coordinator.merge_inputs(included_inputs)

    def set_input_included(
        self,
        submission_id: str,
        input_id: str,
        included: bool,
    ) -> Dict[str, Any]:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        inputs = metadata.get("inputs") or []
        target = next((entry for entry in inputs if entry.get("input_id") == input_id), None)
        if not target:
            raise ValueError("Input file not found")

        target["included_in_merge"] = bool(included)
        metadata["updated_at"] = datetime.utcnow().isoformat()
        merged_data = self._merge_input_data(inputs)
        metadata["data"] = merged_data

        outputs = metadata.get("outputs") or []
        if outputs:
            metadata["status"] = "filled"
        elif merged_data:
            metadata["status"] = "ready"
        elif inputs:
            metadata["status"] = "extracted"
        else:
            metadata["status"] = "created"

        self._persist_submission_metadata(metadata)
        return self.get_submission_package(submission_id) or metadata

    def set_inputs_included(
        self,
        submission_id: str,
        input_ids: List[str],
        included: bool,
    ) -> Dict[str, Any]:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        requested_ids = {input_id for input_id in input_ids if input_id}
        if not requested_ids:
            raise ValueError("input_ids must include at least one input")

        inputs = metadata.get("inputs") or []
        found_ids = set()
        for entry in inputs:
            input_id = entry.get("input_id")
            if input_id in requested_ids:
                entry["included_in_merge"] = bool(included)
                found_ids.add(input_id)

        missing_ids = requested_ids - found_ids
        if missing_ids:
            raise ValueError(f"Input file not found: {', '.join(sorted(missing_ids))}")

        metadata["updated_at"] = datetime.utcnow().isoformat()
        merged_data = self._merge_input_data(inputs)
        metadata["data"] = merged_data

        outputs = metadata.get("outputs") or []
        if outputs:
            metadata["status"] = "filled"
        elif merged_data:
            metadata["status"] = "ready"
        elif inputs:
            metadata["status"] = "extracted"
        else:
            metadata["status"] = "created"

        self._persist_submission_metadata(metadata)
        return self.get_submission_package(submission_id) or metadata

    def delete_input(self, submission_id: str, input_id: str) -> bool:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return False
        inputs = metadata.get("inputs") or []
        index = next((i for i, entry in enumerate(inputs) if entry.get("input_id") == input_id), None)
        if index is None:
            return False
        entry = inputs.pop(index)

        data_path = entry.get("data_path")
        abs_data = self._abs_storage_path(data_path)
        if abs_data and os.path.exists(abs_data):
            try:
                os.remove(abs_data)
            except Exception:
                pass

        storage_info = entry.get("storage") or entry.get("upload_storage") or {}
        self.file_store.delete(storage_info)

        metadata["inputs"] = inputs
        metadata["file_count"] = len(inputs)
        if inputs:
            metadata["data"] = self._merge_input_data(inputs)
            metadata["status"] = metadata.get("status") or "extracted"
        else:
            metadata["data"] = {}
            metadata["status"] = "created"

        self._persist_submission_metadata(metadata)
        return True

    def delete_output(self, submission_id: str, output_id: str) -> bool:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return False
        outputs = metadata.get("outputs") or []

        def _matches(entry: Dict[str, Any]) -> bool:
            return (
                entry.get("output_id") == output_id
                or entry.get("input_id") == output_id
                or entry.get("filename") == output_id
            )

        index = next((i for i, entry in enumerate(outputs) if _matches(entry)), None)
        if index is None:
            return False
        entry = outputs.pop(index)

        storage_info = entry.get("storage") or {}
        self.file_store.delete(storage_info)

        local_path = entry.get("path") or entry.get("output_path")
        abs_path = self._abs_storage_path(local_path)
        if abs_path and os.path.exists(abs_path):
            try:
                os.remove(abs_path)
            except Exception:
                pass

        metadata["outputs"] = outputs
        self._persist_submission_metadata(metadata)
        return True

    def _abs_storage_path(self, path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        if os.path.isabs(path):
            return path
        backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(backend_root, path)

    def _canonicalize_value_for_hash(self, value: Any):
        if isinstance(value, dict):
            return {
                key: self._canonicalize_value_for_hash(value[key])
                for key in sorted(value.keys())
            }
        if isinstance(value, list):
            return [self._canonicalize_value_for_hash(item) for item in value]
        if isinstance(value, str):
            collapsed = re.sub(r"\s+", " ", value.strip().lower())
            numeric_candidate = re.sub(r"[,$]", "", collapsed)
            if re.fullmatch(r"[-+]?\d+(\.\d+)?", numeric_candidate):
                try:
                    return float(numeric_candidate)
                except ValueError:
                    pass
            return collapsed
        return value

    def _compute_extraction_hash(self, data: Any) -> str:
        return self.merge_coordinator.compute_extraction_hash(data)

    def _normalize_entity_value(self, value: Any) -> str:
        return self.merge_coordinator.normalize_entity_value(value)

    def _dedupe_entity_values(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.merge_coordinator.dedupe_entity_values(data)

    def _is_noise_value(self, v: Any) -> bool:
        return self.merge_coordinator.is_noise_value(v)

    def _clean_entities(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.merge_coordinator.clean_entities(data)

    def _semantic_sections_to_entity_map(self, data: Dict[str, Any]) -> Dict[str, List[Any]]:
        return self.merge_coordinator.semantic_sections_to_entity_map(data)

    def _entity_map_to_semantic_sections(
        self, entity_map: Dict[str, List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        return self.merge_coordinator.entity_map_to_semantic_sections(entity_map)


    def _debug_compare_hashes(self, data1: Any, data2: Any) -> bool:
        hash1 = self._compute_extraction_hash(data1)
        hash2 = self._compute_extraction_hash(data2)
        logger.debug("extraction hash compare hash1=%s hash2=%s", hash1, hash2)
        return hash1 == hash2

    def _field_allows_multiple(self, field_id: str) -> bool:
        return self.merge_coordinator.field_allows_multiple(field_id)

    def _deep_merge_dict(self, base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
        return self.merge_coordinator.deep_merge_dict(base, incoming)

    def _persist_submission_metadata(self, metadata: Dict[str, Any]) -> None:
        self.repository.save(metadata)

    def _select_filler(self, template_id: str):
        if not template_id:
            raise ValueError("Template ID is required to select filler.")
        filler_cls = BaseFiller.resolve_filler(template_id)
        cache_key = filler_cls.__name__
        if cache_key not in self.filler_cache:
            self.filler_cache[cache_key] = filler_cls()
        return self.filler_cache[cache_key]

    def _download_storage_entry(self, storage_info: Optional[Dict[str, Any]]) -> Optional[bytes]:
        return self.file_store.download(storage_info)

    def _get_input_storage(
        self,
        metadata: Dict[str, Any],
        input_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        storage = metadata.get("upload_storage")
        if storage and not input_id:
            return storage
        inputs = metadata.get("inputs", [])
        if input_id:
            for entry in inputs:
                if entry.get("input_id") == input_id:
                    return entry.get("storage")
        for entry in inputs:
            storage = entry.get("storage")
            if storage:
                return storage
        return None

    def _get_output_storage(self, metadata: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        storage = metadata.get("output_storage")
        if storage:
            return storage
        for entry in metadata.get("outputs", []):
            storage = entry.get("storage")
            if storage:
                return storage
        return None

    def get_original_pdf_bytes(self, submission_id: str, input_id: Optional[str] = None) -> Optional[bytes]:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return None
        storage = self._get_input_storage(metadata, input_id=input_id)
        return self._download_storage_entry(storage)

    def get_filled_pdf_bytes(self, submission_id: str) -> Optional[bytes]:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return None
        storage = self._get_output_storage(metadata)
        return self._download_storage_entry(storage)

    def create_submission(
        self,
        client_id: str,
        name: str,
        template_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a submission under a client.
        """
        submission_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()

        template_metadata = None
        if template_type and template_type in TEMPLATES:
            template = get_template(template_type)
            template_metadata = {
                "template_id": template.template_id,
                "name": template.name,
                "description": template.description,
                "expected_documents": template.expected_documents,
                "suggested_forms": template.suggested_forms,
                "expected_fields": template.expected_fields,
            }

        metadata = {
            "submission_id": submission_id,
            "client_id": client_id,
            "name": name,
            "template_type": template_type,
            "template_metadata": template_metadata,
            "created_at": timestamp,
            "updated_at": timestamp,
            "status": "created",
            "file_count": 0,
            "inputs": [],
            "outputs": [],
            "data": {},
        }

        self._persist_submission_metadata(metadata)
        self.client_service.add_submission(client_id, submission_id)
        return metadata


    def get_version_history(self, submission_id: str):
        """
        Get version history for a submission.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            List of versions
        """
        return self.version_service.list_versions(submission_id)

    def get_audit_trail(self, submission_id: str):
        """
        Get audit trail for a submission.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            Audit trail entries
        """
        return self.version_service.get_audit_trail(submission_id)


    def compare_with_original(self, submission_id: str) -> Dict[str, Any]:
        """
        Compare current data with original extracted data.
        
        Args:
            submission_id: Submission identifier
            
        Returns:
            Comparison result
        """
        # Get current data
        current_submission = self.get_submission(submission_id)
        if not current_submission:
            raise ValueError("Submission not found")
        
        current_data = current_submission['data']
        
        # Get original extraction (version 1)
        version_1 = self.version_service.get_version(submission_id, 
                                                    self.version_service.list_versions(submission_id)[0]['version_id'])
        
        if not version_1:
            raise ValueError("Original version not found")
        
        original_data = version_1['data']
        
        # Compare
        comparison = self.comparison_service.compare_data(
            source_a=original_data,
            source_b=current_data,
            source_a_label='Original Extraction',
            source_b_label='Current Data'
        )
        
        return comparison


    def generate_form(
        self,
        submission_id: str,
        include_optional: bool = True
     ) -> Dict[str, Any]:
        raise NotImplementedError("Dynamic form generation has not been implemented")


    def list_submission_summaries(
        self,
        limit: Optional[int] = None,
        offset: int = 0,
        statuses: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Return lightweight submission metadata records without loading full JSON data.
        """
        return self.query_service.list_submission_summaries(
            limit=limit,
            offset=offset,
            statuses=statuses,
        )

    def get_submission_stats_summary(self) -> Dict[str, Any]:
        """
        Return aggregate stats from lightweight submission summaries.

        This avoids the N+1 full submission loads used by get_all_submissions().
        """
        page = self.list_submission_summaries(limit=None, offset=0)
        summaries = page.get("items", [])
        by_status: Dict[str, int] = {}
        total_confidence = 0.0
        confidence_count = 0

        for summary in summaries:
            status = summary.get("status") or "unknown"
            by_status[status] = by_status.get(status, 0) + 1
            confidence = summary.get("confidence")
            if confidence is None:
                continue
            try:
                total_confidence += float(confidence)
                confidence_count += 1
            except (TypeError, ValueError):
                continue

        avg_confidence = (total_confidence / confidence_count) if confidence_count else 0
        return {
            "total_submissions": len(summaries),
            "by_status": by_status,
            "average_confidence": round(avg_confidence, 2),
        }


    def get_all_submissions(self) -> List[Dict[str, Any]]:
        """
        Get all submissions.
        
        Returns:
            List of all submissions
        """
        try: 
            return self.query_service.get_all_submissions()
        except Exception as e:
            logger.exception("get_all_submissions failed")
            raise e
    def get_submissions_by_ids(self, submission_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Get multiple submissions by IDs.
        
        Args:
            submission_ids: List of submission IDs
            
        Returns:
            List of submissions
        """
        return self.query_service.get_submissions_by_ids(submission_ids)

    def update_status(self, submission_id: str, status: str, user: str = 'system') -> dict:
        """
        Update the workflow status of a submission.

        Args:
            submission_id: Unique identifier for the submission.
            status: New workflow status (e.g., 'uploaded', 'extracted',
                'reviewing', 'saved', 'finalized', etc.).
            user: Username/email of the user making the update.

        Returns:
            Dictionary with the updated submission ID and status.

        Raises:
            ValueError: If the submission does not exist.
        """
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        metadata['status'] = status
        metadata['workflow_status'] = status  # optional alias expected by clients
        metadata['updated_at'] = datetime.utcnow().isoformat()
        metadata['updated_by'] = user

        self._persist_submission_metadata(metadata)

        return {'submission_id': submission_id, 'status': status}

    def _resolve_client_name(
        self,
        client_id: Optional[str],
        cache: Dict[str, Optional[str]],
    ) -> Optional[str]:
        if not client_id:
            return None
        if client_id in cache:
            return cache[client_id]
        try:
            client = self.client_service.get_client(client_id)
        except Exception:
            client = None
        name = client.get("name") if client else None
        cache[client_id] = name
        return name

    def _parse_iso(self, s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        try:
            # handle plain ISO and ISO with Z
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    def get_recent_submissions(
        self,
        limit: int = 20,
        offset: int = 0,
        status: Optional[List[str]] = None,
        folder_id: Optional[str] = None,
        since: Optional[str] = None,   # optional ISO string to filter by activity >= since
    ) -> Dict[str, Any]:
        """
        Returns submissions sorted by latest activity desc.
        Activity = max(uploaded_at, last_edited_at, filled_at, updated_at) that exists.
        """
        can_page_at_storage = not status and not folder_id and not since
        metadata_rows = self.repository.list_all(
            limit=limit if can_page_at_storage else None,
            offset=offset if can_page_at_storage else 0,
        )
        subs = [
            summary
            for summary in (
                self.query_service.build_submission_summary(metadata)
                for metadata in metadata_rows
            )
            if summary
            if (summary.get("file_count") or 0) > 0
        ]

        # optional filters
        if status:
            status_set = set(status)
            subs = [s for s in subs if s.get("status") in status_set]
        if folder_id:
            subs = [s for s in subs if s.get("folder_id") == folder_id]

        since_dt = self._parse_iso(since) if since else None

        def activity_dt(s: Dict[str, Any]) -> datetime:
            # try multiple fields and pick the latest that exists
            candidates = [
                self._parse_iso(s.get("last_edited_at")),
                self._parse_iso(s.get("filled_at")),
                self._parse_iso(s.get("updated_at")),
                self._parse_iso(s.get("uploaded_at")),
            ]
            # fallback very old date if none exist
            return max([c for c in candidates if c is not None] or [datetime.min.replace(tzinfo=None)])

        # annotate with activity for sorting and optional since
        annotated = []
        for s in subs:
            act = activity_dt(s)
            if since_dt and act < since_dt:
                continue
            s_copy = dict(s)
            s_copy["last_activity_at"] = act.isoformat()
            annotated.append(s_copy)

        # sort newest first
        annotated.sort(key=lambda x: x["last_activity_at"], reverse=True)

        total = len(annotated)
        page = annotated if can_page_at_storage else annotated[offset: offset + limit]

        # return compact rows (add any fields you want in the list)
        items = [
            {
                "submission_id": r.get("submission_id"),
                "client_id": r.get("client_id"),
                "filename": r.get("filename"),
                "name": r.get("name"),
                "status": r.get("status"),
                "folder_id": r.get("folder_id"),
                "uploaded_at": r.get("uploaded_at"),
                "last_edited_at": r.get("last_edited_at"),
                "filled_at": r.get("filled_at"),
                "updated_at": r.get("updated_at"),
                "last_activity_at": r.get("last_activity_at"),
                "confidence": r.get("confidence"),
                "document_type": r.get("document_type"),
                "template_type": r.get("template_type"),
                "template_metadata": r.get("template_metadata"),
            }
            for r in page
        ]

        return {"items": items, "total": total}

    def _iter_semantic_fields(
        self,
        data: Dict[str, Any],
        default_document_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Flatten semantic sections into reportable field observations."""
        if not isinstance(data, dict):
            return []

        sections = data.get("semantic_sections") or data.get("semanticSections") or []
        fields: List[Dict[str, Any]] = []
        for section in sections:
            if not isinstance(section, dict):
                continue
            for field in section.get("fields") or []:
                if not isinstance(field, dict):
                    continue
                field_id = field.get("id")
                if not field_id:
                    continue

                values = field.get("values") or []
                if not isinstance(values, list):
                    values = [values]
                if not values:
                    values = [None]

                for value_entry in values:
                    payload = value_entry if isinstance(value_entry, dict) else {"value": value_entry}
                    value = payload.get("value")
                    if value is None or (isinstance(value, str) and not value.strip()):
                        continue

                    confidence = payload.get("confidence")
                    try:
                        confidence_value = float(confidence) if confidence is not None else None
                    except (TypeError, ValueError):
                        confidence_value = None

                    fields.append({
                        "field_id": str(field_id),
                        "label": field.get("label") or str(field_id).replace("_", " ").title(),
                        "value": value,
                        "confidence": confidence_value,
                        "document_type": self._normalize_report_document_type(
                            payload.get("source_type") or default_document_type
                        ),
                    })

        return fields

    def _normalize_report_document_type(self, value: Optional[Any]) -> str:
        if value is None:
            return "unknown"
        text = str(value).strip()
        if not text:
            return "unknown"
        if "." in text:
            text = text.rsplit(".", 1)[-1]
        return text.lower()

    def _is_known_report_document_type(self, value: Optional[Any]) -> bool:
        normalized = self._normalize_report_document_type(value)
        return normalized not in {"unknown", "generic", "none", "null"}

    def _extract_nested_report_document_type(self, data: Dict[str, Any]) -> Optional[str]:
        if not isinstance(data, dict):
            return None

        candidates = [
            data.get("document_type"),
            data.get("documentType"),
            (data.get("source") or {}).get("document_type") if isinstance(data.get("source"), dict) else None,
            (data.get("source") or {}).get("documentType") if isinstance(data.get("source"), dict) else None,
            (data.get("metadata") or {}).get("document_type") if isinstance(data.get("metadata"), dict) else None,
            (data.get("metadata") or {}).get("documentType") if isinstance(data.get("metadata"), dict) else None,
        ]
        for candidate in candidates:
            if self._is_known_report_document_type(candidate):
                return self._normalize_report_document_type(candidate)
        return None

    def _infer_report_document_type_from_filename(self, filename: Optional[Any]) -> Optional[str]:
        if not filename:
            return None
        normalized = str(filename).lower()
        patterns = [
            (r"\bacord[\s_-]*25\b|\b25\s+certificate\b|certificate\s+of\s+liability", "acord_25"),
            (r"\bacord[\s_-]*126\b|\b126\b", "acord_126"),
            (r"\bacord[\s_-]*125\b|\b125\b", "acord_125"),
            (r"\bacord[\s_-]*130\b|\b130\b", "acord_130"),
            (r"\bacord[\s_-]*140\b|\b140\b", "acord_140"),
            (r"loss[\s_-]*run", "loss_run"),
            (r"\bsov\b|statement\s+of\s+values", "sov"),
        ]
        for pattern, document_type in patterns:
            if re.search(pattern, normalized):
                return document_type
        return None

    def _infer_report_document_type_from_fields(self, data: Dict[str, Any]) -> Optional[str]:
        field_ids = [
            str(field["field_id"])
            for field in self._iter_semantic_fields(data)
            if field.get("field_id")
        ]
        if not field_ids:
            return None

        tokens: set[str] = set()
        compact_ids: set[str] = set()
        for field_id in field_ids:
            spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", field_id)
            tokens.update(re.findall(r"[a-z0-9]+", spaced.lower()))
            compact_ids.add(re.sub(r"[^a-z0-9]", "", field_id.lower()))

        if (
            {"general", "liability"}.issubset(tokens)
            or "deductible" in tokens
            or "hazard" in tokens
            or any(
                compact.startswith(("generalliability", "productandcompleted", "claimsmade", "employeebenefits"))
                for compact in compact_ids
            )
        ):
            return "acord_126"
        if (
            "certificate" in tokens
            or "producer" in tokens
            or "umbrella" in tokens
            or "auto" in tokens
            or any(compact.startswith(("workerscomp", "otherpolicy")) for compact in compact_ids)
        ):
            return "acord_25"
        if {"property", "building", "location"} & tokens:
            return "acord_140"
        if {"claim", "loss"} & tokens:
            return "loss_run"
        return None

    def _infer_report_document_type(self, input_entry: Dict[str, Any]) -> str:
        explicit = input_entry.get("document_type") or input_entry.get("documentType")
        if self._is_known_report_document_type(explicit):
            return self._normalize_report_document_type(explicit)

        data = input_entry.get("data") or {}
        nested = self._extract_nested_report_document_type(data)
        if nested:
            return nested

        from_filename = self._infer_report_document_type_from_filename(input_entry.get("filename"))
        if from_filename:
            return from_filename

        from_fields = self._infer_report_document_type_from_fields(data)
        if from_fields:
            return from_fields

        return "unknown"

    def _normalize_report_value(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._normalize_report_value(value[key])
                for key in sorted(value.keys())
            }
        if isinstance(value, list):
            return [self._normalize_report_value(item) for item in value]
        if isinstance(value, str):
            collapsed = re.sub(r"\s+", " ", value.strip().lower())
            numeric_candidate = re.sub(r"[,$]", "", collapsed)
            if re.fullmatch(r"[-+]?\d+(\.\d+)?", numeric_candidate):
                try:
                    return float(numeric_candidate)
                except ValueError:
                    return collapsed
            return collapsed
        return value

    def _best_semantic_field_map(self, data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        best_by_field: Dict[str, Dict[str, Any]] = {}
        for field in self._iter_semantic_fields(data):
            field_id = field["field_id"]
            existing = best_by_field.get(field_id)
            confidence = field.get("confidence") or 0
            existing_confidence = (existing or {}).get("confidence") or 0
            if not existing or confidence >= existing_confidence:
                best_by_field[field_id] = field
        return best_by_field

    def _diff_semantic_field_values(
        self,
        before: Dict[str, Any],
        after: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        before_fields = self._best_semantic_field_map(before)
        after_fields = self._best_semantic_field_map(after)
        changed: List[Dict[str, Any]] = []

        for field_id, after_field in after_fields.items():
            before_field = before_fields.get(field_id)
            if not before_field:
                continue
            if self._normalize_report_value(before_field.get("value")) == self._normalize_report_value(after_field.get("value")):
                continue
            changed.append({
                "field_id": field_id,
                "label": after_field.get("label") or before_field.get("label") or field_id,
                "document_type": after_field.get("document_type") or before_field.get("document_type") or "unknown",
                "confidence": before_field.get("confidence"),
                "old_value": before_field.get("value"),
                "new_value": after_field.get("value"),
            })

        return changed

    def _record_field_corrections(
        self,
        metadata: Dict[str, Any],
        changed_fields: List[Dict[str, Any]],
    ) -> None:
        corrections = metadata.setdefault("field_corrections", {})
        timestamp = datetime.utcnow().isoformat()
        for field in changed_fields:
            field_id = field.get("field_id")
            if not field_id:
                continue
            entry = corrections.setdefault(str(field_id), {
                "field_id": str(field_id),
                "label": field.get("label") or str(field_id),
                "document_type": field.get("document_type") or "unknown",
                "edit_count": 0,
            })
            previous_count = int(entry.get("edit_count") or 0)
            next_count = previous_count + 1
            entry["label"] = field.get("label") or entry.get("label") or str(field_id)
            entry["document_type"] = field.get("document_type") or entry.get("document_type") or "unknown"
            entry["edit_count"] = next_count
            entry["last_edited_at"] = timestamp
            entry["last_old_value"] = field.get("old_value")
            entry["last_new_value"] = field.get("new_value")
            if field.get("confidence") is not None:
                try:
                    confidence = float(field.get("confidence"))
                    previous_average = float(entry.get("average_confidence") or 0.0)
                    entry["average_confidence"] = (
                        (previous_average * previous_count + confidence) / next_count
                    )
                except (TypeError, ValueError):
                    pass

    def get_reports_summary(self, range_days: int = 30) -> Dict[str, Any]:
        """
        Aggregate submission metrics for the reports dashboard.
        """
        metadata_rows = self.repository.list_all()
        now = datetime.utcnow()
        cutoff = now - timedelta(days=max(range_days, 1))

        records: List[Dict[str, Any]] = []
        for metadata in metadata_rows:
            uploaded = self._parse_iso(metadata.get("uploaded_at") or metadata.get("created_at"))
            if uploaded and uploaded < cutoff:
                continue
            metadata_copy = dict(metadata)
            metadata_copy["_uploaded_dt"] = uploaded
            metadata_copy["_filled_dt"] = self._parse_iso(metadata.get("filled_at"))
            records.append(metadata_copy)

        total = len(records)
        status_counts: Dict[str, int] = {}
        client_counts: Dict[str, Dict[str, Any]] = {}
        doc_type_stats: Dict[str, Dict[str, Any]] = {}
        weakest_fields: Dict[str, Dict[str, Any]] = {}

        completed_statuses = {"filled", "extracted"}
        completed = 0

        turnaround_minutes = []
        volume_by_day: Dict[str, int] = {}
        recent_activity: Dict[str, Dict[str, int]] = {}
        total_documents = 0
        total_fields = 0
        confidence_sum = 0.0
        confidence_count = 0
        total_field_edits = 0
        generated_outputs = 0

        for record in records:
            status = record.get("status") or "created"
            status_counts[status] = status_counts.get(status, 0) + 1
            if status in completed_statuses:
                completed += 1

            uploaded_dt = record.get("_uploaded_dt")
            filled_dt = record.get("_filled_dt")
            day_key = uploaded_dt.date().isoformat() if uploaded_dt else "unknown"
            if uploaded_dt:
                volume_by_day[day_key] = volume_by_day.get(day_key, 0) + 1
                recent_activity.setdefault(day_key, {
                    "documents_processed": 0,
                    "fields_extracted": 0,
                    "generated_outputs": 0,
                })
            if uploaded_dt and filled_dt and filled_dt >= uploaded_dt:
                minutes = (filled_dt - uploaded_dt).total_seconds() / 60.0
                turnaround_minutes.append(minutes)

            outputs = record.get("outputs") or []
            generated_outputs += len(outputs)
            if day_key != "unknown":
                recent_activity.setdefault(day_key, {
                    "documents_processed": 0,
                    "fields_extracted": 0,
                    "generated_outputs": 0,
                })["generated_outputs"] += len(outputs)

            input_fields_by_id: Dict[str, Dict[str, Any]] = {}
            for input_entry in record.get("inputs") or []:
                total_documents += 1
                if day_key != "unknown":
                    recent_activity.setdefault(day_key, {
                        "documents_processed": 0,
                        "fields_extracted": 0,
                        "generated_outputs": 0,
                    })["documents_processed"] += 1

                document_type = self._infer_report_document_type(input_entry)
                input_fields = self._iter_semantic_fields(
                    input_entry.get("data") or {},
                    default_document_type=document_type,
                )

                doc_stats = doc_type_stats.setdefault(document_type, {
                    "document_type": document_type,
                    "documents": 0,
                    "fields_extracted": 0,
                    "confidence_sum": 0.0,
                    "confidence_count": 0,
                    "fields_edited": 0,
                })
                doc_stats["documents"] += 1

                for field in input_fields:
                    field_id = field["field_id"]
                    existing = input_fields_by_id.get(field_id)
                    if not existing or (field.get("confidence") or 0) >= (existing.get("confidence") or 0):
                        input_fields_by_id[field_id] = field

                    total_fields += 1
                    if day_key != "unknown":
                        recent_activity[day_key]["fields_extracted"] += 1
                    doc_stats["fields_extracted"] += 1
                    confidence = field.get("confidence")
                    if confidence is not None:
                        confidence_sum += confidence
                        confidence_count += 1
                        doc_stats["confidence_sum"] += confidence
                        doc_stats["confidence_count"] += 1

            corrections = record.get("field_corrections") or {}
            if not corrections and record.get("inputs"):
                # Historical records created before field_corrections existed can
                # only infer edits when current data differs from merged inputs.
                original_data = self._merge_input_data(record.get("inputs") or [])
                corrections = {
                    field["field_id"]: {
                        **field,
                        "edit_count": 1,
                        "average_confidence": field.get("confidence"),
                    }
                    for field in self._diff_semantic_field_values(
                        original_data,
                        record.get("data") or {},
                    )
                }

            for field_id, correction in corrections.items():
                edit_count = int(correction.get("edit_count") or 0)
                if edit_count <= 0:
                    continue
                total_field_edits += edit_count
                field_meta = input_fields_by_id.get(field_id) or {}
                document_type = self._normalize_report_document_type(
                    correction.get("document_type") or field_meta.get("document_type")
                )
                doc_stats = doc_type_stats.setdefault(document_type, {
                    "document_type": document_type,
                    "documents": 0,
                    "fields_extracted": 0,
                    "confidence_sum": 0.0,
                    "confidence_count": 0,
                    "fields_edited": 0,
                })
                doc_stats["fields_edited"] += edit_count

                weakness = weakest_fields.setdefault(str(field_id), {
                    "field_key": str(field_id),
                    "label": correction.get("label") or field_meta.get("label") or str(field_id),
                    "document_type": document_type,
                    "edit_count": 0,
                    "confidence_sum": 0.0,
                    "confidence_count": 0,
                })
                weakness["edit_count"] += edit_count
                confidence = correction.get("average_confidence")
                if confidence is None:
                    confidence = field_meta.get("confidence")
                if confidence is not None:
                    try:
                        weakness["confidence_sum"] += float(confidence)
                        weakness["confidence_count"] += 1
                    except (TypeError, ValueError):
                        pass

            client_id = record.get("client_id") or "unknown"
            client_name = record.get("client_name")
            client_id_value = record.get("client_id")
            if not client_name and client_id_value:
                try:
                    client = self.client_service.get_client(client_id_value)
                    if client:
                        client_name = client.get("name")
                except Exception:
                    client_name = None

            client_entry = client_counts.setdefault(
                client_id,
                {
                    "client_id": record.get("client_id"),
                    "client_name": client_name or "Unknown client",
                    "submissions": 0,
                },
            )
            client_entry["submissions"] += 1

        avg_turnaround = sum(turnaround_minutes) / len(turnaround_minutes) if turnaround_minutes else 0.0
        success_rate = (completed / total * 100.0) if total else 0.0

        top_clients = sorted(client_counts.values(), key=lambda x: x["submissions"], reverse=True)[:5]
        volume_series = [
            {"date": day, "count": volume_by_day[day]}
            for day in sorted(volume_by_day.keys())
        ]
        average_confidence = (confidence_sum / confidence_count * 100.0) if confidence_count else 0.0
        correction_rate = (total_field_edits / total_fields * 100.0) if total_fields else 0.0
        fields_accepted = max(total_fields - total_field_edits, 0)

        by_document_type = []
        for stats in doc_type_stats.values():
            fields_extracted = int(stats.get("fields_extracted") or 0)
            fields_edited = int(stats.get("fields_edited") or 0)
            avg_doc_conf = (
                stats["confidence_sum"] / stats["confidence_count"] * 100.0
                if stats.get("confidence_count")
                else 0.0
            )
            by_document_type.append({
                "document_type": stats["document_type"],
                "documents": int(stats.get("documents") or 0),
                "fields_extracted": fields_extracted,
                "average_confidence": round(avg_doc_conf, 2),
                "fields_edited": fields_edited,
                "correction_rate": round((fields_edited / fields_extracted * 100.0) if fields_extracted else 0.0, 2),
            })
        by_document_type.sort(key=lambda item: (item["fields_extracted"], item["documents"]), reverse=True)

        weakest_field_rows = []
        for field in weakest_fields.values():
            avg_field_conf = (
                field["confidence_sum"] / field["confidence_count"] * 100.0
                if field.get("confidence_count")
                else 0.0
            )
            weakest_field_rows.append({
                "field_key": field["field_key"],
                "label": field["label"],
                "document_type": field["document_type"],
                "edit_count": field["edit_count"],
                "average_confidence": round(avg_field_conf, 2),
            })
        weakest_field_rows.sort(key=lambda item: item["edit_count"], reverse=True)

        recent_activity_series = [
            {"date": day, **recent_activity[day]}
            for day in sorted(recent_activity.keys())
        ]

        return {
            "totals": {
                "total_submissions": total,
                "completed": completed,
                "success_rate": round(success_rate, 2),
                "documents_processed": total_documents,
                "fields_extracted": total_fields,
                "average_confidence": round(average_confidence, 2),
                "fields_edited": total_field_edits,
                "fields_accepted_without_edits": fields_accepted,
                "correction_rate": round(correction_rate, 2),
                "generated_outputs": generated_outputs,
            },
            "status_breakdown": status_counts,
            "turnaround": {
                "average_minutes": round(avg_turnaround, 2),
                "sample_size": len(turnaround_minutes),
            },
            "submission_volume": volume_series,
            "top_clients": top_clients,
            "by_document_type": by_document_type,
            "weakest_fields": weakest_field_rows[:10],
            "recent_activity": recent_activity_series,
        }


    
    def generate_outputs(
        self,
        submission_id: str,
        template_ids: List[str],
        input_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        results = []
        generated = 0
        for template_id in template_ids:
            template_name = template_id.replace("_", " ").upper()
            try:
                template = get_template(template_id)
                template_name = template.name
            except Exception:
                pass
            try:
                report, output_meta = self.fill_pdf(
                    submission_id,
                    input_ids=input_ids,
                    template_id=template_id,
                )
                generated += 1
                results.append({
                    "templateId": template_id,
                    "templateName": template_name,
                    "success": True,
                    "fileUrl": output_meta.get("url"),
                    "filename": output_meta.get("filename"),
                    "fieldsFilled": report.filled_fields,
                    "totalFields": report.filled_fields + len(report.unmapped_fields or []),
                    "coverage": report.coverage,
                    "warnings": report.warnings,
                    "generatedAt": output_meta.get("generated_at"),
                })
            except Exception as exc:
                results.append({
                    "templateId": template_id,
                    "templateName": template_name,
                    "success": False,
                    "fileUrl": None,
                    "filename": None,
                    "fieldsFilled": 0,
                    "totalFields": 0,
                    "coverage": 0,
                    "warnings": [],
                    "error": str(exc),
                    "generatedAt": datetime.utcnow().isoformat(),
                })
        total_requested = len(template_ids)
        total_failed = total_requested - generated
        return {
            "success": total_failed == 0,
            "results": results,
            "totalRequested": total_requested,
            "totalGenerated": generated,
            "totalFailed": total_failed,
            "timestamp": datetime.utcnow().isoformat(),
        }



    def _log_conflicts(self, conflicts: List[MergeConflict]) -> None:
        """
        Log detected conflicts for monitoring.
        
        Args:
            conflicts: List of conflicts detected during merge
        """
        if not conflicts:
            return
        
        logger.warning("detected %s merge conflicts", len(conflicts))
        for conflict in conflicts:
            logger.warning("merge conflict field=%s values=%s", conflict.field_id, len(conflict.values))
            for val in conflict.values:
                logger.warning(
                    "merge conflict candidate field=%s value=%s confidence=%.2f",
                    conflict.field_id,
                    val.get("value"),
                    val.get("confidence", 0),
                )


    def _select_best_value(
        self,
        values: List[Dict[str, Any]],
        strategy: MergeStrategy = MergeStrategy.HIGHEST_CONFIDENCE  # Changed from str to MergeStrategy
    ) -> Tuple[Any, float, str]:
        """
        Select the best value from multiple candidates based on strategy.
        
        Strategies:
        - HIGHEST_CONFIDENCE: Pick value with highest confidence score
        - MOST_RECENT: Pick value from most recently processed file
        - PRIMARY_SOURCE: Prioritize by document type
        - FIRST: Pick first value encountered
        
        Args:
            values: List of value dicts with "value", "confidence", "source" keys
            strategy: Selection strategy (MergeStrategy enum)
            
        Returns:
            Tuple of (selected_value, confidence, reason)
        """
        if not values:
            return None, 0.0, "no_values"
        
        if len(values) == 1:
            v = values[0]
            return v.get("value"), v.get("confidence", 0.5), "single_value"
        
        # Convert enum to string for comparison
        strategy_str = strategy.value if isinstance(strategy, MergeStrategy) else strategy
        
        if strategy_str == MergeStrategy.HIGHEST_CONFIDENCE.value:
            # Sort by confidence descending
            sorted_values = sorted(
                values,
                key=lambda v: v.get("confidence", 0.0),
                reverse=True
            )
            best = sorted_values[0]
            
            # Check for ties (within 0.01 difference)
            confidence_threshold = 0.01
            ties = [
                v for v in sorted_values
                if abs(v.get("confidence", 0) - best.get("confidence", 0)) < confidence_threshold
            ]
            
            if len(ties) > 1:
                # Break tie by preferring most recent timestamp
                ties_with_time = [
                    v for v in ties
                    if v.get("timestamp")
                ]
                if ties_with_time:
                    ties_with_time.sort(
                        key=lambda v: v.get("timestamp", ""),
                        reverse=True
                    )
                    best = ties_with_time[0]
                    reason = f"tie_broken_by_recency: {best.get('confidence', 0):.2f} from {best.get('source', 'unknown')}"
                else:
                    reason = f"highest_confidence: {best.get('confidence', 0):.2f} from {best.get('source', 'unknown')}"
            else:
                reason = f"highest_confidence: {best.get('confidence', 0):.2f} from {best.get('source', 'unknown')}"
            
            return best.get("value"), best.get("confidence", 0.0), reason
        
        elif strategy_str == MergeStrategy.MOST_RECENT.value:
            # Sort by timestamp descending (most recent first)
            sorted_values = sorted(
                values,
                key=lambda v: v.get("timestamp", ""),
                reverse=True
            )
            best = sorted_values[0]
            reason = f"most_recent: from {best.get('source', 'unknown')} at {best.get('timestamp', 'unknown')}"
            return best.get("value"), best.get("confidence", 0.0), reason
        
        elif strategy_str == MergeStrategy.PRIMARY_SOURCE.value:
            # Sort by source priority (from merge_config)
            def get_priority(v):
                source_type = v.get("source_type", "UNKNOWN")  # Document type, not filename
                return self.merge_config.source_priority.get(source_type, 0)
            
            sorted_values = sorted(
                values,
                key=get_priority,
                reverse=True
            )
            best = sorted_values[0]
            reason = f"primary_source: from {best.get('source_type', 'unknown')} (priority: {get_priority(best)})"
            return best.get("value"), best.get("confidence", 0.0), reason
        
        elif strategy_str == "first":
            # Just use first value
            best = values[0]
            reason = f"first: from {best.get('source', 'unknown')}"
            return best.get("value"), best.get("confidence", 0.0), reason
        
        else:
            # Default to highest confidence
            return self._select_best_value(values, MergeStrategy.HIGHEST_CONFIDENCE)


    def _values_are_similar(self, val1: Any, val2: Any, threshold: float = 0.85) -> bool:
        """
        Check if two values are similar enough to be considered the same.
        
        Uses string similarity for text, exact match for numbers.
        
        Args:
            val1: First value
            val2: Second value
            threshold: Similarity threshold (0-1)
            
        Returns:
            True if values are similar
            
        Example:
            >>> service._values_are_similar("ABC Corp", "ABC Corporation")
            True
            >>> service._values_are_similar("ABC Corp", "XYZ Inc")
            False
            >>> service._values_are_similar(100, 100)
            True
            >>> service._values_are_similar(100, 101)
            False
        """
        # Handle None/empty
        if val1 is None or val2 is None:
            return val1 == val2
        
        # Exact match
        if val1 == val2:
            return True
        
        # Numeric comparison
        try:
            num1 = float(val1)
            num2 = float(val2)
            # Numbers must be exact or very close
            return abs(num1 - num2) < 0.01
        except (ValueError, TypeError):
            pass
        
        # String similarity
        str1 = str(val1).lower().strip()
        str2 = str(val2).lower().strip()
        
        if not str1 or not str2:
            return False
        
        # Simple character-based similarity
        # (In production,TODO: use python-Levenshtein or rapidfuzz for better performance)
        from difflib import SequenceMatcher
        similarity = SequenceMatcher(None, str1, str2).ratio()
        
        return similarity >= threshold
