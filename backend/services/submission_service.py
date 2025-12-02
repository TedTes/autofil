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

from werkzeug.utils import secure_filename

from extraction.classifiers import classifier_registry
from extraction.core import UniversalFileLoader
from extraction.core.document import Document, DocumentType
from extraction.core.readers.pdf_reader import PdfReader
from extraction.extractors import extractor_registry
from extraction.extractors.mfc import MFC
from filling.fillers import *  # noqa: F401,F403 - ensure fillers register themselves
from filling.fillers.base_filler import BaseFiller
from lib.submission_templates import TEMPLATES, get_template
from services.client_service import ClientService
from services.comparison_service import ComparisonService
from services.export_service import ExportService

from services.supabase_db_service import SupabaseDatabaseService
from services.supabase_storage_service import SupabaseStorageService
from services.version_service import VersionService

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
        entities = data.get("entities")
        if not isinstance(entities, dict):
            return data
        for key, values in entities.items():
            if not isinstance(values, list):
                continue
            seen = set()
            deduped = []
            for entry in values:
                if isinstance(entry, dict):
                    normalized = self._normalize_entity_value(entry.get("value"))
                else:
                    normalized = self._normalize_entity_value(entry)
                if normalized in seen:
                    continue
                seen.add(normalized)
                deduped.append(entry)
            def entry_conf(entry: Any) -> float:
                if isinstance(entry, dict):
                    try:
                        return float(entry.get("confidence") or 0)
                    except Exception:
                        return 0.0
                return 0.0

            deduped.sort(key=entry_conf, reverse=True)
            if not self._field_allows_multiple(key) and deduped:
                entities[key] = [deduped[0]]
            else:
                entities[key] = deduped
        return data

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
        Minimize entities for downstream merge/LLM:
        - Drop fields not in MFC
        - Drop N/A / empty values
        - Preserve existing structure: entities[field] = [entries...]
        """
        if not isinstance(data, dict):
            return data

        entities = data.get("entities")
        if not isinstance(entities, dict):
            return data

        cleaned_entities: Dict[str, List[Any]] = {}

        for field_id, values in entities.items():
            # Only keep fields known by the Master Field Catalog
            field_meta = MFC.field(field_id)
            if not field_meta:
                continue

            if not isinstance(values, list):
                values = [values]

            cleaned_list = []
            for entry in values:
                # Handle both dict and raw values (just in case)
                if isinstance(entry, dict):
                    value = entry.get("value")
                    if self._is_noise_value(value):
                        continue
                    cleaned_list.append(entry)
                else:
                    # primitive value
                    if self._is_noise_value(entry):
                        continue
                    cleaned_list.append(entry)

            if cleaned_list:
                cleaned_entities[field_id] = cleaned_list

        data = copy.deepcopy(data)
        data["entities"] = cleaned_entities

        # Optional: also build a simple canonical "flattened" view for LLM/UI
        canonical: Dict[str, Any] = {}
        for field_id, values in cleaned_entities.items():
            if not values:
                continue
            if self._field_allows_multiple(field_id):
                canonical[field_id] = [
                    (v.get("value") if isinstance(v, dict) else v)
                    for v in values
                ]
            else:
                v0 = values[0]
                canonical[field_id] = v0.get("value") if isinstance(v0, dict) else v0

        data["canonical"] = canonical
        return data


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
