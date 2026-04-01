"""
Folder API routes.

Endpoints for folder management.
"""

import logging

from flask import Blueprint, request, jsonify
from api.auth import require_auth, get_current_user_id
from api.error_handlers import internal_server_error
from services.folder_service import FolderService
from services.submission_service import SubmissionService

folder_bp = Blueprint('folders', __name__)
logger = logging.getLogger(__name__)


def _folder_service() -> FolderService:
    return FolderService(current_user_id=get_current_user_id())


def _submission_service() -> SubmissionService:
    return SubmissionService(current_user_id=get_current_user_id())


@folder_bp.route('/', methods=['GET'])
@require_auth
def list_folders():
    """
    List all folders.
    
    Returns:
        JSON with list of folders
    """
    try:
        folders = _folder_service().list_folders()
        
        return jsonify({
            'success': True,
            'data': folders
            
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to list folders", e)


@folder_bp.route('/', methods=['POST'])
@require_auth
def create_folder():
    """
    Create a new folder.
    
    Request Body:
        {
            "name": "Folder name"
        }
    
    Returns:
        JSON with created folder metadata
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Folder name is required'}), 400
        
        name = data['name'].strip()
        
        if not name:
            return jsonify({'error': 'Folder name cannot be empty'}), 400
        
        folder = _folder_service().create_folder(name)
        
        return jsonify({
            'success': True,
            'data': folder
        }), 201
        
    except Exception as e:
        return internal_server_error(logger, "Failed to create folder", e)


@folder_bp.route('/<folder_id>', methods=['GET'])
@require_auth
def get_folder(folder_id):
    """
    Get folder by ID with all submissions.
    
    Args:
        folder_id: Folder identifier
    
    Returns:
        JSON with folder metadata and submissions
    """
    try:
        folder = _folder_service().get_folder(folder_id)
        
        if not folder:
            return jsonify({'error': 'Folder not found'}), 404
        
        # Get detailed submission info
        submissions = []
        for sub_entry in folder.get('submissions', []):
            submission_id = sub_entry['submission_id']
            submission = _submission_service().get_submission(submission_id)
            if submission:
                submissions.append(submission)
        
        folder['submissions_detailed'] = submissions
        
        return jsonify({
            'success': True,
            'data':  folder
          
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to retrieve folder", e)


@folder_bp.route('/<folder_id>', methods=['PUT'])
@require_auth
def update_folder(folder_id):
    """
    Update folder name.
    
    Args:
        folder_id: Folder identifier
    
    Request Body:
        {
            "name": "New folder name"
        }
    
    Returns:
        JSON with updated folder metadata
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Folder name is required'}), 400
        
        name = data['name'].strip()
        
        if not name:
            return jsonify({'error': 'Folder name cannot be empty'}), 400
        
        folder = _folder_service().update_folder(folder_id, name)
        
        if not folder:
            return jsonify({'error': 'Folder not found'}), 404
        
        return jsonify({
            'success': True,
            'data':  folder
            
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to update folder", e)


@folder_bp.route('/<folder_id>', methods=['DELETE'])
@require_auth
def delete_folder(folder_id):
    """
    Delete a folder.
    
    Args:
        folder_id: Folder identifier
    
    Returns:
        JSON with success status
    """
    try:
        deleted = _folder_service().delete_folder(folder_id)
        
        if not deleted:
            return jsonify({'error': 'Folder not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Folder deleted successfully'
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to delete folder", e)
