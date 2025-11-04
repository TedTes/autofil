"""
Submission service - orchestrates extraction and filling workflow.
"""

import os
import uuid
import json
from typing import Optional,Dict,Any,List
from datetime import datetime
from werkzeug.utils import secure_filename
from extraction.extractors import Acord126Extractor
from filling.fillers import Acord126Filler
from services.client_service import ClientService
from lib.submission_templates import get_template, TEMPLATES
from services.version_service import VersionService
from services.comparison_service import ComparisonService
from services.form_generator import FormGenerator
from services.export_service import ExportService

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
        """Initialize service with paths."""
        self.storage_dir = 'storage'
        self.uploads_dir = os.path.join(self.storage_dir, 'uploads')
        self.outputs_dir = os.path.join(self.storage_dir, 'outputs')
        self.data_dir = os.path.join(self.storage_dir, 'data')
        self.folders_dir = os.path.join(self.storage_dir, 'folders')
        self.template_path = 'templates/ACORD_126.pdf'
        self.client_service = ClientService()
        # Create directories if they don't exist
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.outputs_dir, exist_ok=True)
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.folders_dir, exist_ok=True)
        # Initialize extractor and filler
        self.extractor = Acord126Extractor()
        self.filler = Acord126Filler()
        self.version_service = VersionService(self.storage_dir)
        self.comparison_service = ComparisonService(self.storage_dir)
        self.form_generator = FormGenerator()
        self.export_service = ExportService(self.storage_dir)
    
    def upload_and_extract(self, file, folder_id: str = None, progress_callback=None):
        """
        Upload a document and extract data with progress.

        Routes by kind:
        - pdf_form   -> Acord126Extractor (fillable PDFs)
        - pdf_scanned-> OCR to searchable PDF -> text payload
        - image      -> OCR image -> text payload
        - csv/excel  -> tabular rows payload
        - docx/txt   -> text payload
        - unknown    -> best-effort text payload with warning
        """
        import mimetypes
        import magic
        

        submission_id = str(uuid.uuid4())

        def progress(pct, phase, msg):
            if progress_callback:
                progress_callback(submission_id, pct, phase, msg)

        progress(0, 'starting', 'Initializing upload...')

        # folder-aware storage
        if folder_id:
            from services.folder_service import FolderService
            upload_dir = FolderService().get_inputs_path(folder_id)
        else:
            upload_dir = self.uploads_dir
        os.makedirs(upload_dir, exist_ok=True)

        progress(10, 'uploading', 'Saving file...')
        filename = secure_filename(file.filename or f'upload_{submission_id}')
        upload_path = os.path.join(upload_dir, f"{submission_id}_{filename}")
        file.save(upload_path)
        progress(30, 'uploaded', 'File saved successfully')

        # Build metadata early to avoid "metadata before assignment"
        metadata = {
            'submission_id': submission_id,
            'folder_id': folder_id,
            'filename': filename,
            'upload_path': upload_path,
            'uploaded_at': datetime.utcnow().isoformat(),
            'status': 'uploaded',
        }

        progress(40, 'detecting', 'Detecting file type...')
        kind = self._sniff_kind(upload_path, filename)

        try:
            progress(45, 'extracting', f'Extracting as {kind}...')
            if kind == 'pdf_form':
                # Keep your ACORD flow
                extraction_result = self.extractor.extract(upload_path)
                if not extraction_result.is_successful():
                    progress(100, 'error', f'Extraction failed: {extraction_result.error}')
                    raise ValueError(f"Extraction failed: {extraction_result.error}")

                data = extraction_result.json
                confidence = extraction_result.confidence or 0.0
                warnings = extraction_result.warnings or []
                field_confidence = getattr(extraction_result, 'field_confidence', {}) or {}
                extras = {}

            elif kind == 'pdf_scanned':
                ocred_pdf = self._ocr_pdf(upload_path)
                text = self._read_pdf_text(ocred_pdf)
                data, confidence, warnings, field_confidence, extras = self._text_to_payload(text, source='pdf_ocr')

            elif kind == 'image':
                text = self._ocr_image(upload_path)
                data, confidence, warnings, field_confidence, extras = self._text_to_payload(text, source='image_ocr')

            elif kind == 'csv':
                import pandas as pd
                df = pd.read_csv(upload_path)
                data = {'rows': df.to_dict(orient='records')}
                confidence, warnings, field_confidence, extras = 0.9, [], {}, {'rows_count': len(data['rows'])}

            elif kind == 'excel':
                import pandas as pd
                df = pd.read_excel(upload_path)
                data = {'rows': df.to_dict(orient='records')}
                confidence, warnings, field_confidence, extras = 0.9, [], {}, {'rows_count': len(data['rows'])}

            elif kind == 'docx':
                text = self._docx_to_text(upload_path)
                data, confidence, warnings, field_confidence, extras = self._text_to_payload(text, source='docx')

            elif kind == 'txt':
                with open(upload_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text = f.read()
                data, confidence, warnings, field_confidence, extras = self._text_to_payload(text, source='txt')

            else:
                text = self._best_effort_text(upload_path)
                data, confidence, warnings, field_confidence, extras = self._text_to_payload(
                    text, source='unknown', add_warning='Unknown file type; attempted plain text extraction.'
                )

            progress(70, 'post', 'Post-processing…')

            # Version + save JSON
            version_id = self.version_service.create_version(
                submission_id=submission_id,
                data=data,
                user='system',
                action='extract',
                notes=f'Initial extraction from {filename}'
            )

            data_path = os.path.join(self.data_dir, f"{submission_id}.json")
            with open(data_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            # Finalize metadata
            metadata.update({
                'status': 'extracted',
                'data_path': data_path,
                'confidence': confidence,
                'warnings': warnings,
                'current_version_id': version_id,
                'field_confidence': field_confidence,
                **extras
            })

            metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            if folder_id:
                from services.folder_service import FolderService
                FolderService().add_submission(folder_id, submission_id, filename)

            progress(100, 'ready', 'Extraction complete')

            return {
                'submission_id': submission_id,
                'confidence': confidence,
                'warnings': warnings,
                'data': data
            }

        except Exception as e:
            progress(100, 'error', f'Extraction failed: {e}')
            raise

    def _sniff_kind(self, path: str, filename: str) -> str:
        """Classify file into a simple kind to choose pipeline."""
        import mimetypes, magic
        ext = (os.path.splitext(filename)[1] or '').lower()
        try:
            mime = magic.from_file(path, mime=True) or ''
        except Exception:
            mime = mimetypes.guess_type(filename)[0] or ''

        # PDFs
        if 'pdf' in (mime or '') or ext == '.pdf':
            # Decide fillable vs scanned
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(path)
                form = any(p.widgets() for p in doc)
                doc.close()
                return 'pdf_form' if form else 'pdf_scanned'
            except Exception:
                # Fallback heuristic with pdfplumber
                try:
                    import pdfplumber
                    with pdfplumber.open(path) as pdf:
                        text_len = sum(len((p.extract_text() or '')) for p in pdf.pages[:3])
                    return 'pdf_form' if text_len > 120 else 'pdf_scanned'
                except Exception:
                    return 'pdf_scanned'

        # Images
        if any(x in (mime or '') for x in ['image/', 'tiff']) or ext in ('.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'):
            return 'image'

        # Tabular
        if ext == '.csv' or mime == 'text/csv':
            return 'csv'
        if ext in ('.xlsx', '.xls'):
            return 'excel'

        # Docs
        if ext == '.docx' or mime == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'docx'
        if ext == '.txt' or (mime or '').startswith('text/'):
            return 'txt'

        return 'unknown'


    def _ocr_pdf(self, pdf_path: str) -> str:
        """Return path to OCR’d (searchable) PDF."""
        import ocrmypdf
        out_path = pdf_path[:-4] + '_ocred.pdf' if pdf_path.lower().endswith('.pdf') else pdf_path + '_ocred.pdf'
        ocrmypdf.ocr(pdf_path, out_path, force_ocr=True, skip_text=True, deskew=True)
        return out_path


    def _read_pdf_text(self, pdf_path: str) -> str:
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                return "\n".join([(p.extract_text() or '') for p in pdf.pages])
        except Exception:
            # Fallback: rasterize first pages then OCR
            from pdf2image import convert_from_path
            import pytesseract
            images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=3)
            chunks = [pytesseract.image_to_string(im) for im in images]
            return "\n".join(chunks)


    def _ocr_image(self, path: str) -> str:
        from PIL import Image
        import pytesseract
        im = Image.open(path)
        return pytesseract.image_to_string(im)


    def _docx_to_text(self, path: str) -> str:
        import docx
        d = docx.Document(path)
        return "\n".join([p.text for p in d.paragraphs])


    def _best_effort_text(self, path: str) -> str:
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        except Exception:
            return ''


    def _text_to_payload(self, text: str, source: str, add_warning: str | None = None):
        """
        Convert raw text into uniform JSON so the UI can always render something
        even when there is no form-specific mapper.
        """
        warnings = []
        if add_warning:
            warnings.append(add_warning)
        if not text or text.strip() == '':
            warnings.append('No text recognized.')

        # Heuristic key:value lines
        kv = {}
        for line in (text.splitlines() if text else []):
            if ':' in line:
                k, v = line.split(':', 1)
                kv[k.strip()[:60]] = v.strip()

        data = {
            'source': source,
            'raw_text': text,
            'heuristic_fields': kv
        }
        L = len(text or '')
        confidence = 0.2 if L < 100 else (0.5 if L < 800 else 0.7)
        field_confidence = {k: 0.6 for k in kv.keys()}
        extras = {'recognized_chars': L}

        return data, confidence, warnings, field_confidence, extras

    def get_submission(self, submission_id: str):
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
        
        with open(data_path, 'r') as f:
            data = json.load(f)
        
        return {
            'submission_id': submission_id,
            'folder_id': metadata.get('folder_id'),
            'filename': metadata['filename'],
            'status': metadata['status'],
            'uploaded_at': metadata['uploaded_at'],
            'confidence': metadata.get('confidence'),
            'warnings': metadata.get('warnings', []),
            'data': data
        }
    
    def update_data(self, submission_id: str, data, user: str = 'user', notes: str = ''):
        """
        Update submission data with versioning.
        
        Args:
            submission_id: Submission identifier
            data: Updated JSON data
            user: User making the update
            notes: Optional notes about the update
        
        Returns:
            Updated submission
        """
        data_path = os.path.join(self.data_dir, f"{submission_id}.json")
        
        if not os.path.exists(data_path):
            raise ValueError("Submission not found")
        
       
        version_id = self.version_service.create_version(
            submission_id=submission_id,
            data=data,
            user=user,
            action='update',
            notes=notes or 'Manual data update'
        )
        
        # Save updated data
        with open(data_path, 'w') as f:
            json.dump(data, f, indent=2)
        
       
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            metadata['current_version_id'] = version_id
            metadata['updated_at'] = datetime.utcnow().isoformat()
            metadata['updated_by'] = user
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
        
        return self.get_submission(submission_id)
    
    def fill_pdf(self, submission_id: str):
        """
        Fill PDF with data.
        
        Args:
            submission_id: Submission identifier
        
        Returns:
            Fill report
        """
        # Load metadata
        metadata_path = os.path.join(self.data_dir, f"{submission_id}_meta.json")
        
        if not os.path.exists(metadata_path):
            raise ValueError("Submission not found")
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Load data
        data_path = os.path.join(self.data_dir, f"{submission_id}.json")
        
        with open(data_path, 'r') as f:
            data = json.load(f)
        
        # Check template exists
        if not os.path.exists(self.template_path):
            raise ValueError(f"Template not found: {self.template_path}")
        
        # Determine output path
        folder_id = metadata.get('folder_id')
        if folder_id:
            from services.folder_service import FolderService
            folder_service = FolderService()
            output_dir = folder_service.get_outputs_path(folder_id)
        else:
            output_dir = self.outputs_dir
        
        # Fill PDF
        output_path = os.path.join(output_dir, f"{submission_id}_filled.pdf")
        fill_report = self.filler.fill(self.template_path, data, output_path)
        
        # Update metadata
        metadata['status'] = 'filled'
        metadata['output_path'] = output_path
        metadata['filled_at'] = datetime.utcnow().isoformat()
        metadata['fill_report'] = fill_report
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return fill_report
    
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
            'files': []
        }
        
        # Save metadata
        metadata_path = os.path.join(submission_path, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
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
    


    