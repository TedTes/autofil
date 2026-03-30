"""
Extraction routes - handles file upload, classification, and data extraction.
"""

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os
import uuid
from datetime import datetime

from services.extraction_service import ExtractionService
from utils.file_utils import allowed_file, get_file_extension

extraction_bp = Blueprint('extraction', __name__)
extraction_service = ExtractionService()


@extraction_bp.route('/upload', methods=['POST'])
def upload_file():
    """
    Upload a file for extraction.
    
    Body (multipart/form-data):
        - file: File to upload
        - auto_classify: bool (optional) - Auto-classify after upload
        - auto_extract: bool (optional) - Auto-extract after classification
        - folder_id: str (optional) - Associate with folder
    
    Returns:
        {
            "success": true,
            "data": {
                "file_id": "uuid",
                "file_name": "document.pdf",
                "file_size": 12345,
                "mime_type": "application/pdf",
                "classification": {  // If auto_classify=true
                    "document_type": "acord_126",
                    "confidence": 0.95,
                    "indicators": ["..."]
                }
            }
        }
    """
    try:
        # Check if file present
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        # Get options
        auto_classify = request.form.get('auto_classify', 'false').lower() == 'true'
        auto_extract = request.form.get('auto_extract', 'false').lower() == 'true'
        folder_id = request.form.get('folder_id')
        
        # Upload file
        result = extraction_service.upload_file(
            file=file,
            folder_id=folder_id
        )
        
        file_id = result['file_id']
        
        # Auto-classify if requested
        if auto_classify:
            classification = extraction_service.classify_document(file_id)
            result['classification'] = classification
            
            # Auto-extract if requested and classified
            if auto_extract and classification:
                extraction = extraction_service.extract_document(
                    file_id=file_id,
                    document_type=classification.get('document_type')
                )
                result['extraction'] = extraction
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/upload-batch', methods=['POST'])
def upload_batch():
    """
    Upload multiple files for extraction.
    
    Body (multipart/form-data):
        - files: Multiple files
        - auto_classify: bool (optional)
        - group_id: str (optional) - Group files together
    
    Returns:
        {
            "success": true,
            "data": {
                "files": [
                    {
                        "file_id": "uuid",
                        "file_name": "doc.pdf",
                        "classification": {...}
                    }
                ],
                "total_files": 5,
                "successful_uploads": 4,
                "failed_uploads": 1
            }
        }
    """
    try:
        if 'files' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No files provided'
            }), 400
        
        files = request.files.getlist('files')
        auto_classify = request.form.get('auto_classify', 'false').lower() == 'true'
        group_id = request.form.get('group_id')
        
        results = []
        successful = 0
        failed = 0
        
        for file in files:
            try:
                # Upload
                upload_result = extraction_service.upload_file(
                    file=file,
                    folder_id=group_id
                )
                
                # Auto-classify if requested
                if auto_classify:
                    classification = extraction_service.classify_document(
                        upload_result['file_id']
                    )
                    upload_result['classification'] = classification
                
                results.append(upload_result)
                successful += 1
                
            except Exception as e:
                results.append({
                    'file_name': file.filename,
                    'error': str(e)
                })
                failed += 1
        
        return jsonify({
            'success': True,
            'data': {
                'files': results,
                'total_files': len(files),
                'successful_uploads': successful,
                'failed_uploads': failed
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/classify', methods=['POST'])
def classify_document():
    """
    Classify a document to detect its type.
    
    Body:
        {
            "file_id": "uuid"
        }
    
    Returns:
        {
            "success": true,
            "data": {
                "document_type": "acord_126",
                "confidence": 0.95,
                "indicators": ["ACORD 126 header found", "..."],
                "classifier_results": [
                    {
                        "classifier": "KeywordClassifier",
                        "document_type": "acord_126",
                        "confidence": 0.98
                    }
                ]
            }
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'file_id' not in data:
            return jsonify({
                'success': False,
                'error': 'file_id is required'
            }), 400
        
        file_id = data['file_id']
        
        # Classify
        classification = extraction_service.classify_document(file_id)
        
        return jsonify({
            'success': True,
            'data': classification
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/extract', methods=['POST'])
def extract_document():
    """
    Extract data from a document.
    
    Body:
        {
            "file_id": "uuid",
            "document_type": "acord_126",  // Optional if already classified
            "extraction_options": {}  // Optional
        }
    
    Returns:
        {
            "success": true,
            "data": {
                "success": true,
                "data": {
                    "applicant_name": "John Doe",
                    "policy_number": "12345",
                    ...
                },
                "confidence": 0.92,
                "warnings": [],
                "errors": [],
                "metadata": {
                    "extractor_used": "ACORD126Extractor",
                    "document_type": "acord_126",
                    "extraction_date": "2025-01-15T10:30:00Z"
                }
            }
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'file_id' not in data:
            return jsonify({
                'success': False,
                'error': 'file_id is required'
            }), 400
        
        file_id = data['file_id']
        document_type = data.get('document_type')
        extraction_options = data.get('extraction_options', {})
        
        # Extract
        result = extraction_service.extract_document(
            file_id=file_id,
            document_type=document_type,
            options=extraction_options
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/batch-extract', methods=['POST'])
def batch_extract():
    """
    Extract data from multiple documents.
    
    Body:
        {
            "requests": [
                {
                    "file_id": "uuid1",
                    "document_type": "acord_126"
                },
                {
                    "file_id": "uuid2",
                    "document_type": "loss_run"
                }
            ]
        }
    
    Returns:
        {
            "success": true,
            "results": [
                {
                    "file_id": "uuid1",
                    "success": true,
                    "data": {...},
                    "confidence": 0.95
                },
                {
                    "file_id": "uuid2",
                    "success": false,
                    "error": "Extraction failed"
                }
            ]
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'requests' not in data:
            return jsonify({
                'success': False,
                'error': 'requests array is required'
            }), 400
        
        requests_list = data['requests']
        results = []
        
        for req in requests_list:
            file_id = req.get('file_id')
            document_type = req.get('document_type')
            extraction_options = req.get('extraction_options', {})
            
            try:
                result = extraction_service.extract_document(
                    file_id=file_id,
                    document_type=document_type,
                    options=extraction_options
                )
                
                results.append({
                    'file_id': file_id,
                    'success': result.get('success', False),
                    'data': result.get('data'),
                    'confidence': result.get('confidence'),
                    'warnings': result.get('warnings', []),
                    'errors': result.get('errors', []),
                    'metadata': result.get('metadata', {}),
                })
                
            except Exception as e:
                results.append({
                    'file_id': file_id,
                    'success': False,
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/fuse', methods=['POST'])
def fuse_documents():
    """
    Fuse data from multiple documents into a unified submission.
    
    Body:
        {
            "group_id": "uuid",
            "file_ids": ["uuid1", "uuid2", "uuid3"],
            "options": {
                "enable_cross_validation": true,
                "conflict_resolution": "highest_confidence"
            }
        }
    
    Returns:
        {
            "success": true,
            "data": {
                "success": true,
                "data": {
                    "submission_id": "uuid",
                    "application": {...},
                    "claims_history": {...},
                    "property_schedule": {...}
                },
                "confidence": 0.88,
                "warnings": [],
                "errors": []
            }
        }
    """
    try:
        data = request.get_json()
        
        if not data or 'file_ids' not in data:
            return jsonify({
                'success': False,
                'error': 'file_ids is required'
            }), 400
        
        group_id = data.get('group_id')
        file_ids = data['file_ids']
        options = data.get('options', {})
        
        # Fuse documents
        result = extraction_service.fuse_documents(
            file_ids=file_ids,
            group_id=group_id,
            options=options
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/jobs/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """
    Get status of an async extraction job.
    
    Returns:
        {
            "success": true,
            "data": {
                "job_id": "uuid",
                "status": "processing",
                "progress": 45,
                "result": null,
                "error": null,
                "created_at": "2025-01-15T10:00:00Z",
                "updated_at": "2025-01-15T10:05:00Z"
            }
        }
    """
    try:
        job_status = extraction_service.get_job_status(job_id)
        
        if not job_status:
            return jsonify({
                'success': False,
                'error': 'Job not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': job_status
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/<extraction_id>/download', methods=['GET'])
def download_extraction(extraction_id):
    """
    Download extraction result as JSON file.
    
    Returns:
        JSON file download
    """
    try:
        result = extraction_service.get_extraction_result(extraction_id)
        
        if not result:
            return jsonify({
                'success': False,
                'error': 'Extraction not found'
            }), 404
        
        # Create temporary JSON file
        import json
        import tempfile
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            json.dump(result, f, indent=2)
            temp_path = f.name
        
        return send_file(
            temp_path,
            as_attachment=True,
            download_name=f'extraction_{extraction_id}.json',
            mimetype='application/json'
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/files/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """
    Delete uploaded file.
    
    Returns:
        {
            "success": true,
            "message": "File deleted successfully"
        }
    """
    try:
        extraction_service.delete_file(file_id)
        
        return jsonify({
            'success': True,
            'message': 'File deleted successfully'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@extraction_bp.route('/formats', methods=['GET'])
def get_supported_formats():
    """
    Get supported file formats and extraction capabilities.
    
    Returns:
        {
            "success": true,
            "data": {
                "file_types": [".pdf", ".xlsx", ".jpg", ...],
                "document_types": [
                    {"value": "acord_126", "label": "ACORD 126"},
                    ...
                ],
                "extractors": [...],
                "parsers": [...]
            }
        }
    """
    try:
        formats = extraction_service.get_supported_formats()
        
        return jsonify({
            'success': True,
            'data': formats
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
