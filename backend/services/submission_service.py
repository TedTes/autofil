"""
Submission service - orchestrates extraction and filling workflow.
"""

import os
import uuid
import json
import copy
from typing import Optional,Dict,Any,List
from datetime import datetime
from werkzeug.utils import secure_filename
from storage import LocalStorageProvider, StorageProvider
from extraction.extractors import extractor_registry
from extraction.classifiers import classifier_registry
from extraction.core.readers.pdf_reader import PdfReader
from extraction.core.document import Document,DocumentType
from filling.fillers import Acord126Filler
from services.client_service import ClientService
from lib.submission_templates import get_template, TEMPLATES
from services.version_service import VersionService
from services.comparison_service import ComparisonService
from services.form_generator import FormGenerator
from services.export_service import ExportService
from extraction.core import UniversalFileLoader

class SubmissionService:
    """
    Service for managing submission workflow.
    
    Coordinates:
    - File upload and storage
    - Data extraction
    - PDF filling
    - File retrieval
    """
    
    def __init__(self, storage_provider: Optional[StorageProvider] = None):
        """Initialize service with paths."""
        self.storage: StorageProvider = storage_provider or LocalStorageProvider('storage')
        self.storage_dir = getattr(self.storage, 'base_path', 'storage')
        self.uploads_dir = self.storage.ensure_dir('uploads')
        self.outputs_dir = self.storage.ensure_dir('outputs')
        self.data_dir = self.storage.ensure_dir('data')
        self.folders_dir = self.storage.ensure_dir('folders')

        self.client_service = ClientService()
        self.filler = Acord126Filler()  # filler knows how to find its own template(s)

        self.version_service = VersionService(self.storage_dir)
        self.comparison_service = ComparisonService(self.storage_dir)
        self.form_generator = FormGenerator()
        self.export_service = ExportService(self.storage_dir)

        self.classifier = classifier_registry.create_composite(
            classifier_names=['mime', 'keyword', 'table'],
            strategy='highest_confidence'
    )
    def upload_and_extract(
        self,
        file,
        folder_id: str = None,
        client_id: str = None,
        submission_id: str = None,
        progress_callback=None,
    ):
        """
        Upload PDF and extract data with progress tracking.
        
        Args:
            file: FileStorage object from Flask request
            folder_id: Optional folder ID to store in
            progress_callback: Optional callback for progress updates
        
        Returns:
            Dictionary with submission_id, extracted data, and metadata
        """
        try:
            if folder_id and client_id and submission_id is None:
                raise ValueError("Cannot specify both folder_id and client_id")

            is_existing_submission = submission_id is not None
            metadata: Dict[str, Any] = {}
            client_submission_path = None
            client_outputs_path = None

            if not submission_id:
                submission_id = str(uuid.uuid4())

            metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")

            if progress_callback:
                progress_callback(submission_id, 0, 'starting', 'Initializing upload...')

            if is_existing_submission:
                if not os.path.exists(metadata_path):
                    raise ValueError("Submission not found")
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)

                existing_client_id = metadata.get("client_id")
                if existing_client_id and client_id and existing_client_id != client_id:
                    raise ValueError("Submission does not belong to the specified client")
                client_id = existing_client_id or client_id
                folder_id = metadata.get("folder_id") or folder_id
                client_submission_path = metadata.get("client_submission_path")
                client_outputs_path = metadata.get("outputs_dir")

                if client_submission_path:
                    upload_dir = os.path.join(client_submission_path, "inputs")
                    os.makedirs(upload_dir, exist_ok=True)
                elif folder_id:
                    from services.folder_service import FolderService
                    folder_service = FolderService()
                    upload_dir = folder_service.get_inputs_path(folder_id)
                else:
                    upload_dir = self.uploads_dir
            else:
                upload_dir = self.uploads_dir

                if client_id:
                    client = self.client_service.get_client(client_id)
                    if not client:
                        raise ValueError("Client not found")
                    submissions_root = self.client_service.get_submissions_path(client_id)
                    os.makedirs(submissions_root, exist_ok=True)
                    client_submission_path = os.path.join(submissions_root, submission_id)
                    os.makedirs(client_submission_path, exist_ok=True)
                    upload_dir = os.path.join(client_submission_path, "inputs")
                    os.makedirs(upload_dir, exist_ok=True)
                    client_outputs_path = os.path.join(client_submission_path, "outputs")
                    os.makedirs(client_outputs_path, exist_ok=True)
                    self.client_service.add_submission(client_id, submission_id)
                elif folder_id:
                    from services.folder_service import FolderService
                    folder_service = FolderService()
                    upload_dir = folder_service.get_inputs_path(folder_id)
                else:
                    upload_dir = self.uploads_dir

            # Progress: 10% - Saving file
            if progress_callback:
                progress_callback(submission_id, 10, 'uploading', 'Saving file...')
            
            # Save uploaded file
            filename = secure_filename(file.filename)
            upload_filename = f"{submission_id}_{filename}" if not client_id else filename
            upload_path = os.path.join(upload_dir, upload_filename)
            file.save(upload_path)
            # Progress: 30% - File saved
            if progress_callback:
                progress_callback(submission_id, 30, 'uploaded', 'File saved successfully')
            
            # Progress: 40% - Starting extraction
            if progress_callback:
                progress_callback(submission_id, 40, 'extracting', 'Analyzing document...')
            # Use UniversalFileLoader to handle all file types
            loader = UniversalFileLoader()

            try:
               doc =  loader.load(upload_path)
               print(f"Document loaded - MIME: {doc.mime_type}, Type: {doc.document_type}")
               print(f"🔍 Running composite classifier (mime + keyword + table)...")
               try:
                    doc_type, confidence = self.classifier.classify(doc)
                    doc.set_document_type(doc_type, confidence)
                    print(f"Classified as: {doc_type} (confidence: {confidence:.2f})")
               except Exception as e:
                    print(f"⚠️ Classification failed: {str(e)}")
                    # Fallback to generic if classification fails
                    doc.set_document_type(DocumentType.GENERIC, 0.3)
            except Exception as e:
                raise ValueError(f"Failed to load file: {str(e)}")
      
            extractor = extractor_registry.get_extractor_for_document(doc)
            if not extractor:
              raise ValueError(f"No extractor for {doc.document_type}")
            # Extract data
            extraction_result = extractor.extract(doc)

            # Progress: 70% - Extraction complete
            if progress_callback:
                progress_callback(submission_id, 70, 'extracting', 'Processing fields...')
        
            # # ── sanity check (optional – some extractors may not implement it) ───
            if hasattr(extraction_result, "is_successful") and not extraction_result.is_successful():
                err = getattr(extraction_result, "error", "Unknown extraction error")
                if progress_callback:
                    progress_callback(submission_id, 100, "error", f"Extraction failed: {err}")
                raise ValueError(f"Extraction failed: {err}")
            
        
            # ── 80% – persist extracted JSON & version ───────────────────────────
            if progress_callback:
                progress_callback(submission_id, 80, "extracting", "Saving extracted data...")

            # JSON-compatible dict (handles datetime, UUID, etc.)
            json_data = extraction_result.to_dict()

            version_notes = f"Extraction from {filename}"
            if is_existing_submission:
                version_notes = f"Re-extraction from {filename}"

            # Save per-input data
            input_id = str(uuid.uuid4())
            per_input_data_path = os.path.join(self.data_dir, f"{submission_id}_{input_id}.json")
            with open(per_input_data_path, "w") as f:
                json.dump(json_data, f, indent=2)

            # ── 90% – write metadata ─────────────────────────────────────────────
            if progress_callback:
                progress_callback(submission_id, 90, "ready", "Finalizing...")
            
            timestamp = datetime.utcnow().isoformat()

            metadata.setdefault("submission_id", submission_id)
            metadata["folder_id"] = folder_id
            metadata["client_id"] = client_id
            metadata["filename"] = filename
            metadata.setdefault("name", filename)
            metadata["upload_path"] = upload_path
            metadata["client_submission_path"] = client_submission_path
            metadata["outputs_dir"] = client_outputs_path
            metadata.setdefault("uploaded_at", timestamp)
            metadata["updated_at"] = timestamp
            metadata["status"] = "extracted"

            inputs_meta = metadata.setdefault("inputs", [])
            inputs_meta.append({
                "input_id": input_id,
                "filename": filename,
                "path": self._rel_storage_path(upload_path),
                "data_path": self._rel_storage_path(per_input_data_path),
                "uploaded_at": timestamp,
                "extraction_status": "extracted",
                "confidence": extraction_result.confidence,
            })
            metadata["file_count"] = len(inputs_meta)

            # Merge data from all inputs
            merged_data = self._merge_input_data(inputs_meta) or json_data

            version_id = self.version_service.create_version(
                submission_id=submission_id,
                data=merged_data,
                user="system",
                action="extract",
                notes=version_notes,
            )
            metadata["current_version_id"] = version_id

            data_path = os.path.join(self.data_dir, f"{submission_id}.json")
            with open(data_path, "w") as f:
                json.dump(merged_data, f, indent=2)
            metadata["data_path"] = data_path
           
            metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
           
            if client_submission_path:
                client_meta_path = os.path.join(client_submission_path, "metadata.json")
                if os.path.exists(client_meta_path):
                    with open(client_meta_path, 'r') as f:
                        client_metadata = json.load(f)
                else:
                    client_metadata = {
                        "submission_id": submission_id,
                        "client_id": client_id,
                        "name": metadata.get("name", filename),
                        "created_at": timestamp,
                        "status": metadata["status"],
                        "inputs": [],
                        "outputs": [],
                    }

                package_inputs = client_metadata.setdefault("inputs", [])
                package_inputs.append({
                    "input_id": input_id,
                    "filename": filename,
                    "path": self._rel_storage_path(upload_path),
                    "uploaded_at": timestamp,
                    "extraction_status": "extracted",
                })
                client_metadata["file_count"] = len(package_inputs)
                client_metadata["status"] = metadata["status"]
                client_metadata["updated_at"] = timestamp
                client_meta_path = os.path.join(client_submission_path, "metadata.json")
                with open(client_meta_path, 'w') as f:
                    json.dump(client_metadata, f, indent=2)
           
            # ── link to folder (if any) ─────────────────────────────────────────
            if folder_id:
                from services.folder_service import FolderService
                FolderService().add_submission(folder_id, submission_id, filename)
           
            # ── 100% – done ───────────────────────────────────────────────────────
            if progress_callback:
                progress_callback(submission_id, 100, "ready", "Extraction complete")
            
            return {
                "submission_id": submission_id,
                # "confidence": extraction_result.confidence,
                # "warnings": extraction_result.warnings,
                "data": json_data,
            }
        except Exception as e:
            print("upload and extract error:", str(e))
            raise
    
    def get_submission(self, submission_id: str, client_id: Optional[str] = None):
        """
        Get submission data.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            Dictionary with submission details
        """
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        data_path = os.path.join(self.data_dir, f"{submission_id}.json")
        
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

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
        
        with open(data_path, 'r') as f:
            data = json.load(f)
        
        return {
            'submission_id': submission_id,
            'client_id': resolved_client_id,
            'client_name': client_name,
            'folder_id': metadata.get('folder_id'),
            'filename': metadata['filename'],
            'status': metadata['status'],
            'uploaded_at': metadata['uploaded_at'],
            'confidence': metadata.get('confidence'),
            'warnings': metadata.get('warnings', []),
            'data': data
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
        data_path = os.path.join(self.data_dir, f"{submission_id}.json")
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")

        if not os.path.exists(data_path) or not os.path.exists(metadata_path):
            raise ValueError("Submission not found")

        # Load current data (for versioning / audit)
        with open(data_path, 'r') as f:
            previous_data = json.load(f)

        # Create version BEFORE overwriting, so we keep the old snapshot
        version_id = self.version_service.create_version(
            submission_id=submission_id,
            data=previous_data,
            user=user,
            action='edit',
            notes=notes or 'Manual data update',
        )

        # Write new data
        with open(data_path, 'w') as f:
            json.dump(data, f, indent=2)

        # Update metadata (but DO NOT touch existing status)
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        metadata['current_version_id'] = version_id
        metadata['last_edited_at'] = datetime.utcnow().isoformat()
        metadata['last_edited_by'] = user

        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        # Return fresh snapshot
        updated = self.get_submission(submission_id)
        return updated

    def delete_submission(self, submission_id: str) -> bool:
        """
        Delete a submission's files and metadata, updating folder/client references.
        """
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        data_path = os.path.join(self.data_dir, f"{submission_id}.json")

        if not os.path.exists(metadata_path):
            return False

        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        upload_path = metadata.get("upload_path")
        if upload_path and os.path.exists(upload_path):
            os.remove(upload_path)

        output_path = metadata.get("output_path")
        if output_path and os.path.exists(output_path):
            os.remove(output_path)

        for input_meta in metadata.get("inputs", []):
            data_rel = input_meta.get("data_path")
            abs_data = self._abs_storage_path(data_rel)
            if abs_data and os.path.exists(abs_data):
                os.remove(abs_data)

        for path in [metadata_path, data_path]:
            if path and os.path.exists(path):
                os.remove(path)

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


    def fill_pdf(self, submission_id: str, input_ids: Optional[List[str]] = None):
        """
        Fill PDF with data using the canonical extraction output.

        Args:
            submission_id: Submission identifier

        Returns:
            FillReport
        """
        try:
            # 1) Load metadata
            metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
            if not os.path.exists(metadata_path):
                raise ValueError("Submission not found")

            with open(metadata_path, 'r') as f:
                metadata = json.load(f)

            inputs_meta = metadata.get("inputs", [])
            if input_ids:
                inputs_meta = [inp for inp in inputs_meta if inp.get("input_id") in input_ids]
                if not inputs_meta:
                    raise ValueError("No matching input files selected")

            canonical_data = self._merge_input_data(inputs_meta)

            if not canonical_data:
                data_path = os.path.join(self.data_dir, f"{submission_id}.json")
                if not os.path.exists(data_path):
                    raise ValueError("Extracted data not found")

                with open(data_path, 'r') as f:
                    canonical_data = json.load(f)

            # 3) Decide which template_id to use (decoupled from file path)
            # Prefer a template_type stored in metadata; fallback to a default.
            # Example: "acord_126", "acord_126_2016_09", etc. as understood by TemplateLoader.
            template_id = metadata.get("template_type") or "acord_126_2016.pdf"
            # 4) Determine output directory
            folder_id = metadata.get('folder_id')
            if folder_id:
                from services.folder_service import FolderService
                folder_service = FolderService()
                output_dir = folder_service.get_outputs_path(folder_id)
            else:
                output_dir = self.outputs_dir

            os.makedirs(output_dir, exist_ok=True)

            # 5) Build output PDF path
            output_path = os.path.join(output_dir, f"{submission_id}_filled.pdf")

            # 6) Call filler – it will:
            #   - load the right template via TemplateLoader
            #   - map canonical_data -> flat pdf fields
            #   - write the filled PDF to output_path
            fill_report = self.filler.fill(
                canonical_data=canonical_data,
                output_path=output_path,
                template_id=template_id,   # logical name, not file path
            )

            # 7) Update metadata (make FillReport JSON-serializable)
            metadata['status'] = 'filled'
            metadata['output_path'] = output_path
            metadata['filled_at'] = datetime.utcnow().isoformat()
            outputs_meta = metadata.setdefault('outputs', [])
            outputs_meta.append({
                "filename": os.path.basename(output_path),
                "path": os.path.relpath(output_path, start=self.storage_dir),
                "generated_at": metadata['filled_at'],
            })
            metadata['fill_report'] = {
                "success": fill_report.success,
                "coverage": fill_report.coverage,
                "filled_fields": fill_report.filled_fields,
                "unmapped_fields": fill_report.unmapped_fields,
                "warnings": fill_report.warnings,
                "errors": fill_report.errors,
            }

            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)

            client_submission_path = metadata.get("client_submission_path")
            if client_submission_path:
                client_meta_path = os.path.join(client_submission_path, "metadata.json")
                if os.path.exists(client_meta_path):
                    with open(client_meta_path, 'r') as f:
                        client_metadata = json.load(f)
                else:
                    client_metadata = {
                        "submission_id": submission_id,
                        "client_id": metadata.get("client_id"),
                        "name": metadata.get("name"),
                        "inputs": [],
                        "outputs": [],
                    }
                package_outputs = client_metadata.setdefault("outputs", [])
                package_outputs.append({
                    "filename": os.path.basename(output_path),
                    "path": os.path.relpath(output_path, start=self.storage_dir),
                    "generated_at": metadata['filled_at'],
                })
                client_metadata["status"] = metadata["status"]
                client_metadata["updated_at"] = metadata["filled_at"]
                with open(client_meta_path, 'w') as f:
                    json.dump(client_metadata, f, indent=2)

            return fill_report

        except Exception as e:
            print("error occured in fill_pdf", str(e))
            raise

    
    def get_output_path(self, submission_id: str):
        """
        Get output PDF path.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            Path to filled PDF
        """
        # Check metadata for folder-based path
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            if 'output_path' in metadata:
                output_path =  metadata['output_path']
                if not os.path.isabs(output_path):
                    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    output_path = os.path.join(backend_root, output_path)
                return output_path
        # Fallback to legacy path
        output_path = os.path.join(self.outputs_dir, f"{submission_id}_filled.pdf")

        return output_path

    def _rel_storage_path(self, path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        try:
            return os.path.relpath(path, start=self.storage_dir)
        except Exception:
            return path

    def _abs_storage_path(self, path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        if os.path.isabs(path):
            return path
        return os.path.join(self.storage_dir, path)

    def _load_input_data(self, entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        data_path = entry.get("data_path")
        abs_path = self._abs_storage_path(data_path)
        if not abs_path or not os.path.exists(abs_path):
            return None
        try:
            with open(abs_path, 'r') as f:
                return json.load(f)
        except Exception:
            return None

    def _merge_input_data(self, inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
        merged: Dict[str, Any] = {}
        for entry in inputs:
            data = self._load_input_data(entry)
            if data:
                merged = self._deep_merge_dict(merged, data)
        return merged

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

    def create_submission(
        self, 
        client_id: str, 
        name: str, 
        template_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a submission under a client.
        
        Args:
            client_id: Client identifier
            name: Submission name (e.g., "2025 Property Renewal")
            template_type: Optional template type ('property_renewal', 'wc_quote', etc.)
            
        Returns:
            Submission metadata with template information
        """
        submission_id = str(uuid.uuid4())
        
        # Get client submissions path
        submissions_path = self.client_service.get_submissions_path(client_id)
        submission_path = os.path.join(submissions_path, submission_id)
        
        # Create submission structure
        os.makedirs(os.path.join(submission_path, 'inputs'), exist_ok=True)
        os.makedirs(os.path.join(submission_path, 'outputs'), exist_ok=True)
        
        # Get template metadata if template_type provided
        template_metadata = None
        if template_type and template_type in TEMPLATES:
            template = get_template(template_type)
            template_metadata = {
                'template_id': template.template_id,
                'name': template.name,
                'description': template.description,
                'expected_documents': template.expected_documents,
                'suggested_forms': template.suggested_forms,
                'expected_fields': template.expected_fields
            }
        
        # Create metadata
        metadata = {
            'submission_id': submission_id,
            'client_id': client_id,
            'name': name,
            'template_type': template_type,
            'template_metadata': template_metadata,  # Include full template info
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'status': 'created',
            'file_count': 0,
            'inputs': [],
            'outputs': []
        }
        
        # Save metadata
        metadata_path = os.path.join(submission_path, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        data_json_path = os.path.join(self.data_dir, f"{submission_id}.json")
        with open(data_json_path, 'w') as f:
            json.dump({}, f, indent=2)

        data_metadata = {
            "submission_id": submission_id,
            "client_id": client_id,
            "folder_id": None,
            "filename": None,
            "name": name,
            "upload_path": None,
            "data_path": data_json_path,
            "client_submission_path": submission_path,
            "outputs_dir": os.path.join(submission_path, 'outputs'),
            "uploaded_at": None,
            "updated_at": metadata['updated_at'],
            "status": 'created',
            "template_type": template_type,
            "template_metadata": template_metadata,
            "inputs": [],
            "file_count": 0,
        }

        global_meta_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        with open(global_meta_path, 'w') as f:
            json.dump(data_metadata, f, indent=2)
        
        # Add to client
        self.client_service.add_submission(client_id, submission_id)
        
        return metadata

    def get_submission_path(self, client_id: str, submission_id: str) -> str:
        """Get path to submission directory."""
        return os.path.join(
            self.client_service.get_submissions_path(client_id),
            submission_id
        )


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
        form = self.form_generator.generate_form(
            template_id=template_id,
            data=data,
            include_optional=include_optional
        )
        
        return form


    def get_all_submissions(self) -> List[Dict[str, Any]]:
        """
        Get all submissions.
        
        Returns:
            List of all submissions
        """
        submissions = []
        
        if not os.path.exists(self.data_dir):
            return submissions
        
        for filename in os.listdir(self.data_dir):
            if filename.endswith('_meta.json'):
                submission_id = filename.replace('_meta.json', '')
                try:
                    submission = self.get_submission(submission_id)
                    if submission:
                        submissions.append(submission)
                except:
                    continue
        return submissions

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
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        if not os.path.exists(metadata_path):
            raise ValueError("Submission not found")

        # Load metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Update status and audit fields
        metadata['status'] = status
        metadata['workflow_status'] = status  # optional alias expected by clients
        metadata['updated_at'] = datetime.utcnow().isoformat()
        metadata['updated_by'] = user

        # Persist changes
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        return {'submission_id': submission_id, 'status': status}

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
        subs = self.get_all_submissions()

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
    


    
