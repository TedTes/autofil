"""Submission upload/extraction workflow coordinator."""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import uuid
import hashlib
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from werkzeug.utils import secure_filename

from extraction.classifiers import classifier_registry
from extraction.core import UniversalFileLoader
from extraction.core.document import DocumentType
from extraction.extractors import extractor_registry
from services.client_service import ClientService
from services.submission_file_store import SubmissionFileStore
from services.submission_merge_coordinator import SubmissionMergeCoordinator
from services.submission_repository import SubmissionRepository
from services.version_service import VersionService

logger = logging.getLogger(__name__)


class SubmissionExtractionCoordinator:
    """Upload, classify, extract, and persist a submission input."""

    def __init__(
        self,
        *,
        repository: SubmissionRepository,
        file_store: SubmissionFileStore,
        client_service: ClientService,
        version_service: VersionService,
        merge_coordinator: SubmissionMergeCoordinator,
    ) -> None:
        self.repository = repository
        self.file_store = file_store
        self.client_service = client_service
        self.version_service = version_service
        self.merge_coordinator = merge_coordinator
        self.classifier = classifier_registry.create_composite(
            classifier_names=["mime", "keyword", "table"],
            strategy="highest_confidence",
        )

    def upload_and_extract(
        self,
        file,
        *,
        folder_id: Optional[str] = None,
        client_id: Optional[str] = None,
        submission_id: Optional[str] = None,
        progress_callback: Optional[Callable[..., Any]] = None,
        on_folder_submission: Optional[Callable[[str, str, str], None]] = None,
    ) -> Dict[str, Any]:
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

            self._emit_progress(progress_callback, submission_id, 0, "starting", "Initializing upload...")

            if is_existing_submission:
                metadata = self.repository.get(submission_id) or {}
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
            file_hash = self._compute_file_hash(upload_path)
            file_size = os.path.getsize(upload_path)

            self._emit_progress(progress_callback, submission_id, 30, "uploaded", "File saved successfully")

            remote_input = self.file_store.upload(
                local_path=upload_path,
                content_type=getattr(file, "content_type", None),
                client_id=client_id,
                submission_id=submission_id,
                category="inputs",
                filename=filename,
            )

            self._emit_progress(progress_callback, submission_id, 40, "extracting", "Analyzing document...")

            loader = UniversalFileLoader()
            try:
                doc = loader.load(upload_path)
                logger.info("document loaded mime=%s type=%s", doc.mime_type, doc.document_type)
                try:
                    doc_type, confidence = self.classifier.classify(doc)
                    doc.set_document_type(doc_type, confidence)
                    logger.info("classified document as %s confidence=%.2f", doc_type, confidence)
                except Exception as exc:
                    logger.warning("classification failed, falling back to generic: %s", exc)
                    doc.set_document_type(DocumentType.GENERIC, 0.3)
            except Exception as exc:
                raise ValueError(f"Failed to load file: {exc}")

            extractor = extractor_registry.get_extractor_for_document(doc)
            if not extractor:
                raise ValueError(f"No extractor for {doc.document_type}")

            extraction_result = extractor.extract(doc)
            extraction_confidence = getattr(extraction_result, "confidence", None)

            self._emit_progress(progress_callback, submission_id, 70, "extracting", "Processing fields...")

            if hasattr(extraction_result, "is_successful") and not extraction_result.is_successful():
                err = getattr(extraction_result, "error", "Unknown extraction error")
                self._emit_progress(progress_callback, submission_id, 100, "error", f"Extraction failed: {err}")
                raise ValueError(f"Extraction failed: {err}")

            self._emit_progress(progress_callback, submission_id, 80, "extracting", "Saving extracted data...")

            raw_result = (
                extraction_result.to_dict()
                if hasattr(extraction_result, "to_dict")
                else extraction_result
            )
            canonical_payload = self._extract_canonical_payload(raw_result)
            json_data = self.merge_coordinator.clean_entities(
                self.merge_coordinator.dedupe_entity_values(canonical_payload)
            )
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

            extraction_hash = self.merge_coordinator.compute_extraction_hash(json_data)
            inputs_meta = metadata.setdefault("inputs", [])

            duplicate_entry = None
            for entry in inputs_meta:
                if "file_hash" not in entry:
                    existing_hash = self._resolve_existing_file_hash(entry)
                    if existing_hash:
                        entry["file_hash"] = existing_hash
                if "file_size" not in entry:
                    existing_size = self._resolve_existing_file_size(entry)
                    if existing_size is not None:
                        entry["file_size"] = existing_size
                if entry.get("file_hash") == file_hash:
                    duplicate_entry = entry
                    break
                if "extraction_hash" not in entry:
                    existing_data = entry.get("data")
                    if existing_data:
                        entry["extraction_hash"] = self.merge_coordinator.compute_extraction_hash(existing_data)
                if entry.get("extraction_hash") == extraction_hash:
                    duplicate_entry = entry
                    break

            if duplicate_entry:
                merged_data = self.merge_coordinator.dedupe_entity_values(
                    self.merge_coordinator.merge_inputs(inputs_meta) or json_data
                )
                metadata["data"] = merged_data
                metadata["file_count"] = len(inputs_meta)
                self.repository.save(metadata)
                self._emit_progress(
                    progress_callback,
                    submission_id,
                    100,
                    "ready",
                    "Duplicate document detected; using existing data.",
                )
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
                "included_in_merge": True,
                "file_hash": file_hash,
                "file_size": file_size,
                "confidence": extraction_confidence,
                "url": remote_input.get("public_url") if remote_input else None,
                "storage": remote_input,
                "data": json_data,
                "extraction_hash": extraction_hash,
            }
            inputs_meta.append(input_entry)
            metadata["file_count"] = len(inputs_meta)

            merged_data = self.merge_coordinator.dedupe_entity_values(
                self.merge_coordinator.merge_inputs(inputs_meta) or json_data
            )
            metadata["data"] = merged_data
            version_id = self.version_service.create_version(
                submission_id=submission_id,
                data=merged_data,
                user="system",
                action="extract",
                notes=f"{version_notes} from {filename}",
            )
            metadata["current_version_id"] = version_id
            self.repository.save(metadata)

            if folder_id and on_folder_submission:
                on_folder_submission(folder_id, submission_id, filename)

            self._emit_progress(progress_callback, submission_id, 100, "ready", "Extraction complete")
            return {
                "submission_id": submission_id,
                "data": json_data,
            }
        except Exception:
            logger.exception("upload and extract failed for submission_id=%s", submission_id)
            raise
        finally:
            if temp_upload_dir:
                shutil.rmtree(temp_upload_dir, ignore_errors=True)

    def _compute_file_hash(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    def _resolve_existing_file_hash(self, entry: Dict[str, Any]) -> Optional[str]:
        storage_info = entry.get("storage") or entry.get("upload_storage")
        blob = self.file_store.download(storage_info)
        if not blob:
            return None
        return hashlib.sha256(blob).hexdigest()

    def _resolve_existing_file_size(self, entry: Dict[str, Any]) -> Optional[int]:
        storage_info = entry.get("storage") or entry.get("upload_storage")
        blob = self.file_store.download(storage_info)
        if blob is None:
            return None
        return len(blob)

    @staticmethod
    def _emit_progress(progress_callback, submission_id: str, percent: int, stage: str, message: str) -> None:
        if progress_callback:
            progress_callback(submission_id, percent, stage, message)

    @staticmethod
    def _extract_canonical_payload(raw_result: Any) -> Dict[str, Any]:
        if isinstance(raw_result, dict):
            nested = raw_result.get("data")
            if isinstance(nested, dict):
                if (
                    "semantic_sections" in nested
                    or "semanticSections" in nested
                    or "entities" in nested
                ):
                    return nested
        return raw_result if isinstance(raw_result, dict) else {}
