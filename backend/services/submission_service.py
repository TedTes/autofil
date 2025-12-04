"""
Submission service - orchestrates extraction and filling workflow.
"""

import copy
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from enum import Enum
from werkzeug.utils import secure_filename

from extraction.classifiers import classifier_registry
from extraction.core import UniversalFileLoader
from extraction.core.document import Document, DocumentType
from extraction.core.readers.pdf_reader import PdfReader
from extraction.extractors import extractor_registry
from extraction.extractors.mfc import MFC
from extraction.utils.semantic_section_builder import SemanticSectionBuilder
from filling.fillers import *  # noqa: F401,F403 - ensure fillers register themselves
from filling.fillers.base_filler import BaseFiller
from lib.submission_templates import TEMPLATES, get_template
from services.client_service import ClientService
from services.comparison_service import ComparisonService
from services.export_service import ExportService
from dataclasses import dataclass, field as dataclass_field
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from services.supabase_db_service import SupabaseDatabaseService
from services.supabase_storage_service import SupabaseStorageService
from services.version_service import VersionService


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

    
    def __init__(self):
        """Initialize service dependencies."""
        self.client_service = ClientService()
        self.filler_cache: Dict[str, BaseFiller] = {}

        self.version_service = VersionService()
        self.comparison_service = ComparisonService()
        self.export_service = ExportService(self)

        self.classifier = classifier_registry.create_composite(
            classifier_names=['mime', 'keyword', 'table'],
            strategy='highest_confidence'
        )
        self.remote_storage = SupabaseStorageService()
        if not getattr(self.remote_storage, "enabled", False):
            raise RuntimeError("Supabase storage must be configured for file storage.")
        self.db = SupabaseDatabaseService()

        self.merge_config = MergeConfig(
            strategy=MergeStrategy.HIGHEST_CONFIDENCE,
            min_confidence_threshold=0.5,
            similarity_threshold=0.85,
            track_sources=True,
            log_conflicts=True,
            source_priority={
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
        if not self.db.enabled:
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
        if not file or not getattr(file, "filename", None):
            raise ValueError("No file provided")

        temp_upload_dir = None
        try:
            if folder_id and client_id and submission_id is None:
                raise ValueError("Cannot specify both folder_id and client_id")

            is_existing_submission = submission_id is not None
            metadata: Dict[str, Any] = {}
            client_name: Optional[str] = None
            if not submission_id:
                submission_id = str(uuid.uuid4())

            if progress_callback:
                progress_callback(submission_id, 0, "starting", "Initializing upload...")

            if is_existing_submission:
                metadata = self.get_submission_metadata(submission_id)
                if not metadata:
                    raise ValueError("Submission not found")
                existing_client_id = metadata.get("client_id")
                if existing_client_id and client_id and existing_client_id != client_id:
                    raise ValueError("Submission does not belong to the specified client")
                client_id = existing_client_id or client_id
                folder_id = metadata.get("folder_id") or folder_id
                client_name = metadata.get("client_name")
            elif client_id:
                client = self.client_service.get_client(client_id)
                if not client:
                    raise ValueError("Client not found")
                client_name = client.get("name")
                self.client_service.add_submission(client_id, submission_id)

            temp_upload_dir = tempfile.mkdtemp(prefix=f"upload_{submission_id}_")
            filename = secure_filename(file.filename or f"{submission_id}.pdf")
            upload_path = os.path.join(temp_upload_dir, filename)
            file.save(upload_path)

            if progress_callback:
                progress_callback(submission_id, 30, "uploaded", "File saved successfully")

            remote_input = self._upload_to_remote(
                local_path=upload_path,
                content_type=getattr(file, "content_type", None),
                client_id=client_id,
                submission_id=submission_id,
                category="inputs",
                filename=filename,
            )

            if progress_callback:
                progress_callback(submission_id, 40, "extracting", "Analyzing document...")

            loader = UniversalFileLoader()
            try:
                doc = loader.load(upload_path)
                print(f"Document loaded - MIME: {doc.mime_type}, Type: {doc.document_type}")
                print("🔍 Running composite classifier (mime + keyword + table)...")
                try:
                    doc_type, confidence = self.classifier.classify(doc)
                    doc.set_document_type(doc_type, confidence)
                    print(f"Classified as: {doc_type} (confidence: {confidence:.2f})")
                except Exception as exc:
                    print(f"⚠️ Classification failed: {exc}")
                    doc.set_document_type(DocumentType.GENERIC, 0.3)
            except Exception as exc:
                raise ValueError(f"Failed to load file: {exc}")

            extractor = extractor_registry.get_extractor_for_document(doc)
            if not extractor:
                raise ValueError(f"No extractor for {doc.document_type}")

            extraction_result = extractor.extract(doc)
            extraction_confidence = getattr(extraction_result, "confidence", None)

            if progress_callback:
                progress_callback(submission_id, 70, "extracting", "Processing fields...")

            if hasattr(extraction_result, "is_successful") and not extraction_result.is_successful():
                err = getattr(extraction_result, "error", "Unknown extraction error")
                if progress_callback:
                    progress_callback(submission_id, 100, "error", f"Extraction failed: {err}")
                raise ValueError(f"Extraction failed: {err}")

            if progress_callback:
                progress_callback(submission_id, 80, "extracting", "Saving extracted data...")

            json_data = self._dedupe_entity_values(extraction_result.to_dict())
            json_data = self._clean_entities(json_data)
            timestamp = datetime.utcnow().isoformat()
            version_notes = "Re-extraction" if is_existing_submission else "Initial extraction"
            metadata.setdefault("submission_id", submission_id)
            metadata.setdefault("uploaded_at", timestamp)
            metadata["updated_at"] = timestamp
            metadata["folder_id"] = folder_id
            metadata["client_id"] = client_id
            if not metadata.get("client_name") and client_name:
                metadata["client_name"] = client_name
            metadata["filename"] = metadata.get("filename") or filename
            metadata.setdefault("name", metadata["filename"])
            metadata["status"] = "extracted"
            if extraction_confidence is not None:
                metadata["confidence"] = extraction_confidence

            extraction_hash = self._compute_extraction_hash(json_data)
            inputs_meta = metadata.setdefault("inputs", [])

            duplicate_entry = None
            for entry in inputs_meta:
                if "extraction_hash" not in entry:
                    existing_data = entry.get("data")
                    if existing_data:
                        entry["extraction_hash"] = self._compute_extraction_hash(existing_data)
                if entry.get("extraction_hash") == extraction_hash:
                    duplicate_entry = entry
                    break

            if duplicate_entry:
                merged_data = self._dedupe_entity_values(self._merge_input_data(inputs_meta) or json_data)
                metadata["data"] = merged_data
                metadata["file_count"] = len(inputs_meta)
                self._persist_submission_metadata(metadata)
                if progress_callback:
                    progress_callback(submission_id, 100, "ready", "Duplicate document detected; using existing data.")
                return {
                    "submission_id": submission_id,
                    "data": json_data,
                    "duplicate_of": duplicate_entry.get("input_id"),
                }

            input_entry = {
                "input_id": str(uuid.uuid4()),
                "filename": filename,
                "uploaded_at": timestamp,
                "extraction_status": "extracted",
                "confidence": extraction_confidence,
                "url": remote_input.get("public_url") if remote_input else None,
                "storage": remote_input,
                "data": json_data,
                "extraction_hash": extraction_hash,
            }
            inputs_meta.append(input_entry)
            metadata["file_count"] = len(inputs_meta)

            merged_data = self._dedupe_entity_values(self._merge_input_data(inputs_meta) or json_data)
            metadata["data"] = merged_data
            version_id = self.version_service.create_version(
                submission_id=submission_id,
                data=merged_data,
                user="system",
                action="extract",
                notes=f"{version_notes} from {filename}",
            )
            metadata["current_version_id"] = version_id
            self._persist_submission_metadata(metadata)

            if folder_id:
                from services.folder_service import FolderService
                FolderService().add_submission(folder_id, submission_id, filename)
            if progress_callback:
                progress_callback(submission_id, 100, "ready", "Extraction complete")
            return {
                "submission_id": submission_id,
                "data": json_data,
            }
        except Exception as e:
            print("uploading and extracting error", str(e))
        finally:
            if temp_upload_dir:
                shutil.rmtree(temp_upload_dir, ignore_errors=True)
    
    def get_submission_metadata(self, submission_id: str) -> Optional[Dict[str, Any]]:
        return self.db.get_submission_metadata(submission_id)

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
            'filename': filename,
            'status': metadata['status'],
            'uploaded_at': metadata['uploaded_at'],
            'confidence': metadata.get('confidence'),
            'warnings': metadata.get('warnings', []),
            'data': payload_data,
            'input_id': selected_input_id,
        }
    
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
            storage_path = storage_info.get("path")
            if storage_path:
                self.remote_storage.delete_file(storage_path)

        for output_meta in metadata.get("outputs", []):
            storage_info = output_meta.get("storage") or {}
            storage_path = storage_info.get("path")
            if storage_path:
                self.remote_storage.delete_file(storage_path)

        if getattr(self.db, "enabled", False):
            self.db.delete_submission_metadata(submission_id)

        folder_id = metadata.get("folder_id")
        if folder_id:
            try:
                from services.folder_service import FolderService
                FolderService().remove_submission(folder_id, submission_id)
            except Exception as exc:
                print(f"Warning: failed to update folder {folder_id}: {exc}")

        client_id = metadata.get("client_id")
        if client_id:
            try:
                self.client_service.remove_submission(client_id, submission_id)
            except Exception as exc:
                print(f"Warning: failed to update client {client_id}: {exc}")

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
        temp_output_dir: Optional[str] = None
        try:
            metadata = self.get_submission_metadata(submission_id)
            if not metadata:
                raise ValueError("Submission not found")

            inputs_meta = metadata.get("inputs", [])
            if input_ids:
                inputs_meta = [entry for entry in inputs_meta if entry.get("input_id") in input_ids]
                if not inputs_meta:
                    raise ValueError("No matching input files selected")

            canonical_data = self._merge_input_data(inputs_meta) or metadata.get("data")
            if not canonical_data:
                raise ValueError("Extracted data not found")

            template_choice = template_id or metadata.get("template_type")
            filler = self._select_filler(template_choice)
            temp_output_dir = tempfile.mkdtemp(prefix=f"filled_{submission_id}_")
            output_path = os.path.join(temp_output_dir, f"{submission_id}_filled.pdf")

            fill_report = filler.fill(
                canonical_data=canonical_data,
                output_path=output_path,
                template_id=template_choice,
            )
            remote_output = self._upload_to_remote(
                local_path=output_path,
                content_type="application/pdf",
                client_id=metadata.get("client_id"),
                submission_id=submission_id,
                category="outputs",
                filename=os.path.basename(output_path),
            )

            metadata['status'] = 'filled'
            metadata['filled_at'] = datetime.utcnow().isoformat()
            outputs_meta = metadata.setdefault('outputs', [])
            outputs_meta.append({
                "template_id": template_choice,
                "filename": os.path.basename(output_path),
                "generated_at": metadata['filled_at'],
                "url": remote_output.get("public_url") if remote_output else None,
                "storage": remote_output,
            })
            if remote_output:
                metadata['output_storage'] = remote_output
            metadata['fill_report'] = {
                "success": fill_report.success,
                "coverage": fill_report.coverage,
                "filled_fields": fill_report.filled_fields,
                "unmapped_fields": fill_report.unmapped_fields,
                "warnings": fill_report.warnings,
                "errors": fill_report.errors,
            }

            self._persist_submission_metadata(metadata)
            return fill_report, outputs_meta[-1]

        except Exception as e:
            print("error occured in fill_pdf", str(e))
            raise
        finally:
            if temp_output_dir:
                shutil.rmtree(temp_output_dir, ignore_errors=True)

    
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
        """
        Deterministically merge multiple extracted inputs into one canonical payload.
        """
        if not inputs:
            return {}

        merged: Dict[str, Any] = {}
        for entry in inputs:
            data = self._load_input_data(entry)
            if not data:
                continue
            deduped = self._dedupe_entity_values(copy.deepcopy(data))
            cleaned = self._clean_entities(deduped)
            merged = self._deep_merge_dict(merged, cleaned)

        merged = self._dedupe_entity_values(merged)
        merged = self._clean_entities(merged)
        return merged

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
        storage_path = storage_info.get("path")
        if storage_path:
            self.remote_storage.delete_file(storage_path)

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
        storage_path = storage_info.get("path")
        if storage_path:
            self.remote_storage.delete_file(storage_path)

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
        canonical_data = self._canonicalize_value_for_hash(data)
        canonical_json = json.dumps(canonical_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    def _normalize_entity_value(self, value: Any) -> str:
        canonical = self._canonicalize_value_for_hash(value)
        return json.dumps(canonical, sort_keys=True, separators=(",", ":"))

    def _dedupe_entity_values(self, data: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data

        entity_map = self._semantic_sections_to_entity_map(data)
        if not entity_map:
            return data

        deduped_map: Dict[str, List[Dict[str, Any]]] = {}
        for key, values in entity_map.items():
            if not isinstance(values, list):
                continue

            seen: set[str] = set()
            deduped: List[Dict[str, Any]] = []

            for entry in values:
                payload = entry if isinstance(entry, dict) else {"value": entry}
                normalized = self._normalize_entity_value(payload.get("value"))
                if normalized in seen:
                    continue
                seen.add(normalized)
                deduped.append(payload)

            deduped.sort(
                key=lambda entry: float(entry.get("confidence") or 0),
                reverse=True,
            )

            if not self._field_allows_multiple(key) and deduped:
                deduped_map[key] = [deduped[0]]
            elif deduped:
                deduped_map[key] = deduped

        updated = copy.deepcopy(data)
        updated["semantic_sections"] = self._entity_map_to_semantic_sections(deduped_map)
        return updated

    def _is_noise_value(self, v: Any) -> bool:
        """
        Heuristic to drop junk like 'N/A', empty strings, etc.
        """
        if v is None:
            return True
        if isinstance(v, str):
            s = v.strip().lower()
            if not s:
                return True
            if s in {"n/a", "na", "none", "null", "--"}:
                return True
        return False

    def _clean_entities(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Minimize semantic sections for downstream merge/LLM:
        - Drop fields not in MFC
        - Drop N/A / empty values
        """
        if not isinstance(data, dict):
            return data

        entity_map = self._semantic_sections_to_entity_map(data)
        if not entity_map:
            return data

        cleaned_entities: Dict[str, List[Dict[str, Any]]] = {}

        for field_id, values in entity_map.items():
            field_meta = MFC.field(field_id)
            if not field_meta:
                continue

            cleaned_list: List[Dict[str, Any]] = []
            if not isinstance(values, list):
                values = [values]

            for entry in values:
                payload = entry if isinstance(entry, dict) else {"value": entry}
                if self._is_noise_value(payload.get("value")):
                    continue
                cleaned_list.append(payload)

            if cleaned_list:
                cleaned_entities[field_id] = cleaned_list

        data = copy.deepcopy(data)
        data["semantic_sections"] = self._entity_map_to_semantic_sections(cleaned_entities)
        return data

    def _semantic_sections_to_entity_map(self, data: Dict[str, Any]) -> Dict[str, List[Any]]:
        sections = data.get("semantic_sections") or data.get("semanticSections") or []
        return SemanticSectionBuilder.flatten(sections)

    def _entity_map_to_semantic_sections(
        self, entity_map: Dict[str, List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        if not entity_map:
            return []
        sections = SemanticSectionBuilder.build(entity_map)
        return [section.model_dump(mode="json") for section in sections]


    def _debug_compare_hashes(self, data1: Any, data2: Any) -> bool:
        hash1 = self._compute_extraction_hash(data1)
        hash2 = self._compute_extraction_hash(data2)
        print(f"[debug] hash1={hash1} hash2={hash2}")
        return hash1 == hash2

    def _field_allows_multiple(self, field_id: str) -> bool:
        field_meta = MFC.field(field_id) or {}
        cardinality = str(field_meta.get("cardinality", "")).lower()
        return "many" in cardinality

    def _deep_merge_dict(self, base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
        if not base:
            return copy.deepcopy(incoming)
        for key, value in incoming.items():
            if key == "semantic_sections":
                existing_map = self._semantic_sections_to_entity_map({"semantic_sections": base.get(key, [])})
                incoming_map = self._semantic_sections_to_entity_map({"semantic_sections": value})
                for field_id, vals in incoming_map.items():
                    existing_map.setdefault(field_id, []).extend(vals)
                base[key] = self._entity_map_to_semantic_sections(existing_map)
                continue
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._deep_merge_dict(base[key], value)
            elif key in base and isinstance(base[key], list) and isinstance(value, list):
                base[key].extend(value)
            else:
                base[key] = copy.deepcopy(value)
        return base
    def _upload_to_remote(
        self,
        *,
        local_path: str,
        content_type: Optional[str],
        client_id: Optional[str],
        submission_id: str,
        category: str,
        filename: str,
    ) -> Optional[Dict[str, Any]]:
        """Upload a file to remote storage, returning metadata for persistence."""
        try:
            if not getattr(self.remote_storage, "enabled", False):
                return None

            segments: List[Optional[str]] = []
            if client_id:
                segments.extend(["clients", client_id])
            else:
                segments.append("submissions")
            segments.extend([submission_id, category, filename])
            upload_info = self.remote_storage.upload_file(
                local_path=local_path,
                storage_path=self.remote_storage.build_path(*segments),
                content_type=content_type,
            )
            return upload_info
        except Exception as e:
            print("error from uploading to remote ", str(e))
        return None

    def _persist_submission_metadata(self, metadata: Dict[str, Any]) -> None:
        if getattr(self.db, "enabled", False):
            self.db.save_submission_metadata(metadata)

    def _select_filler(self, template_id: str):
        if not template_id:
            raise ValueError("Template ID is required to select filler.")
        filler_cls = BaseFiller.resolve_filler(template_id)
        cache_key = filler_cls.__name__
        if cache_key not in self.filler_cache:
            self.filler_cache[cache_key] = filler_cls()
        return self.filler_cache[cache_key]

    def _download_storage_entry(self, storage_info: Optional[Dict[str, Any]]) -> Optional[bytes]:
        if not storage_info:
            return None
        path = storage_info.get("path")
        if not path:
            return None
        return self.remote_storage.download_file(path)

    def _get_input_storage(self, metadata: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        storage = metadata.get("upload_storage")
        if storage:
            return storage
        for entry in metadata.get("inputs", []):
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

    def get_original_pdf_bytes(self, submission_id: str) -> Optional[bytes]:
        metadata = self.get_submission_metadata(submission_id)
        if not metadata:
            return None
        storage = self._get_input_storage(metadata)
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
        """
        Generate dynamic form for a submission.
        
        Args:
            submission_id: Submission identifier
            include_optional: Include optional fields
            
        Returns:
            Form definition
        """
        submission = self.get_submission(submission_id)
        if not submission:
            raise ValueError("Submission not found")
        
        # Get template from metadata
        template_id = submission.get('metadata', {}).get('template_id', 'custom')
        
        # Get current data
        data = submission.get('data', {})
        
        # Generate form
        # form = self.form_generator.generate_form(
        #     template_id=template_id,
        #     data=data,
        #     include_optional=include_optional
        # )
        
        # return form
        return


    def list_submission_summaries(self) -> List[Dict[str, Any]]:
        """
        Return lightweight submission metadata records without loading full JSON data.
        """
        metadata_rows = self.db.list_submissions_metadata()
        client_name_cache: Dict[str, Optional[str]] = {}
        summaries: List[Dict[str, Any]] = []

        for metadata in metadata_rows:
            if not metadata:
                continue
            submission_id = metadata.get("submission_id")
            if not submission_id:
                continue

            client_id = metadata.get("client_id")
            client_name = metadata.get("client_name")
            

            summaries.append({
                "submission_id": submission_id,
                "filename": metadata.get("filename") or metadata.get("name") or "Untitled.pdf",
                "status": metadata.get("status") or metadata.get("workflow_status") or "uploaded",
                "uploaded_at": metadata.get("uploaded_at") or metadata.get("created_at"),
                "confidence": metadata.get("confidence"),
                "folder_id": metadata.get("folder_id"),
                "client_id": client_id,
                "client_name": client_name,
            })
        return summaries


    def get_all_submissions(self) -> List[Dict[str, Any]]:
        """
        Get all submissions.
        
        Returns:
            List of all submissions
        """
        try: 
            submissions = []
            data = self.db.list_submissions_metadata()
            
            for metadata in data:
                submission_id = metadata.get("submission_id")
                if not submission_id:
                    continue
                submission = self.get_submission(submission_id)
                if submission:
                    submissions.append(submission)
            return submissions
        except Exception as e:
            print("error from get all submissions ", str(e))
            raise e
    def get_submissions_by_ids(self, submission_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Get multiple submissions by IDs.
        
        Args:
            submission_ids: List of submission IDs
            
        Returns:
            List of submissions
        """
        submissions = []
        
        for submission_id in submission_ids:
            try:
                submission = self.get_submission(submission_id)
                if submission:
                    submissions.append(submission)
            except:
                continue
        
        return submissions

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
        subs = [
            s for s in self.get_all_submissions()
            if (s.get("file_count") or 0) > 0
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
        page = annotated[offset: offset + limit]

        # return compact rows (add any fields you want in the list)
        items = [
            {
                "submission_id": r.get("submission_id"),
                "client_id": r.get("client_id"),
                "filename": r.get("filename"),
                "status": r.get("status"),
                "folder_id": r.get("folder_id"),
                "uploaded_at": r.get("uploaded_at"),
                "last_edited_at": r.get("last_edited_at"),
                "filled_at": r.get("filled_at"),
                "updated_at": r.get("updated_at"),
                "last_activity_at": r.get("last_activity_at"),
                "confidence": r.get("confidence"),
            }
            for r in page
        ]

        return {"items": items, "total": total}

    def get_reports_summary(self, range_days: int = 30) -> Dict[str, Any]:
        """
        Aggregate submission metrics for the reports dashboard.
        """
        metadata_rows = self.db.list_submissions_metadata()
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

        completed_statuses = {"filled", "extracted"}
        completed = 0

        turnaround_minutes = []
        volume_by_day: Dict[str, int] = {}

        for record in records:
            status = record.get("status") or "created"
            status_counts[status] = status_counts.get(status, 0) + 1
            if status in completed_statuses:
                completed += 1

            uploaded_dt = record.get("_uploaded_dt")
            filled_dt = record.get("_filled_dt")
            if uploaded_dt:
                day_key = uploaded_dt.date().isoformat()
                volume_by_day[day_key] = volume_by_day.get(day_key, 0) + 1
            if uploaded_dt and filled_dt and filled_dt >= uploaded_dt:
                minutes = (filled_dt - uploaded_dt).total_seconds() / 60.0
                turnaround_minutes.append(minutes)

            client_id = record.get("client_id") or "unknown"
            client_entry = client_counts.setdefault(
                client_id,
                {
                    "client_id": record.get("client_id"),
                    "client_name": record.get("client_name") or "Unknown client",
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

        return {
            "totals": {
                "total_submissions": total,
                "completed": completed,
                "success_rate": round(success_rate, 2),
            },
            "status_breakdown": status_counts,
            "turnaround": {
                "average_minutes": round(avg_turnaround, 2),
                "sample_size": len(turnaround_minutes),
            },
            "submission_volume": volume_series,
            "top_clients": top_clients,
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
            try:
                report, output_meta = self.fill_pdf(
                    submission_id,
                    input_ids=input_ids,
                    template_id=template_id,
                )
                generated += 1
                results.append({
                    "templateId": template_id,
                    "templateName": template_id.replace("_", " ").upper(),
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
                    "templateName": template_id.replace("_", " ").upper(),
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
        
        print(f"[MERGE] Detected {len(conflicts)} conflicts:")
        for conflict in conflicts:
            print(f"  - {conflict.field_id}: {len(conflict.values)} values")
            for val in conflict.values:
                print(f"    → {val.get('value')} (conf: {val.get('confidence', 0):.2f})")


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
