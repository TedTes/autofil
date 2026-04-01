"""
Client API routes.

Endpoints for client management.
"""

import logging

from flask import Blueprint, request, jsonify
from api.auth import require_auth, get_current_user_id
from api.error_handlers import internal_server_error
from services.client_service import ClientService
from services.submission_service import SubmissionService
from services.template_library_service import TemplateLibraryService

client_bp = Blueprint('clients', __name__)
logger = logging.getLogger(__name__)


def _client_service() -> ClientService:
    return ClientService(current_user_id=get_current_user_id())


def _submission_service() -> SubmissionService:
    return SubmissionService(current_user_id=get_current_user_id())


def _template_library() -> TemplateLibraryService:
    return TemplateLibraryService()


@client_bp.route('/', methods=['GET'])
@require_auth
def list_clients():
    """
    List all clients with their submissions.
    
    Returns:
        JSON with list of clients and nested submissions
    """
    try:
        clients = _client_service().list_clients()
        
        return jsonify({
            'success': True,
            'data':  clients
            
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to list clients", e)


@client_bp.route('/', methods=['POST'])
@require_auth
def create_client():
    """
    Create a new client.
    
    Request Body:
        {
            "name": "Client name"
        }
    
    Returns:
        JSON with created client metadata
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Client name is required'}), 400
        
        name = data['name'].strip()
        
        if not name:
            return jsonify({'error': 'Client name cannot be empty'}), 400
        
        client = _client_service().create_client(name)
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 201
        
    except Exception as e:
        return internal_server_error(logger, "Failed to create client", e)


@client_bp.route('/<client_id>', methods=['GET'])
@require_auth
def get_client(client_id):
    """
    Get client by ID with metadata only.
    
    Args:
        client_id: Client identifier
    
    Returns:
        JSON with client metadata and submissions
    """
    try:
        client = _client_service().get_client(client_id)
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to retrieve client", e)

@client_bp.route('/<client_id>/submissions', methods=['GET'])
@require_auth
def list_client_submissions(client_id):
    """
    List submissions/packages for a given client.
    """
    try:
        packages = _client_service().list_client_packages(client_id)
        if packages is None:
            return jsonify({'error': 'Client not found'}), 404

        return jsonify({
            'success': True,
            'data': packages,
        }), 200
    except Exception as e:
        return internal_server_error(logger, "Failed to list client submissions", e)


@client_bp.route('/<client_id>', methods=['PUT'])
@require_auth
def update_client(client_id):
    """
    Update client name.
    
    Args:
        client_id: Client identifier
    
    Request Body:
        {
            "name": "New client name"
        }
    
    Returns:
        JSON with updated client metadata
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Client name is required'}), 400
        
        name = data['name'].strip()
        
        if not name:
            return jsonify({'error': 'Client name cannot be empty'}), 400
        
        client = _client_service().update_client(client_id, name)
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to update client", e)


@client_bp.route('/<client_id>', methods=['DELETE'])
@require_auth
def delete_client(client_id):
    """
    Delete a client and all its submissions.
    
    Args:
        client_id: Client identifier
    
    Returns:
        JSON with success status
    """
    try:
        deleted = _client_service().delete_client(client_id)
        
        if not deleted:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Client deleted successfully'
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to delete client", e)


@client_bp.route('/<client_id>/submissions', methods=['POST'])
@require_auth
def create_submission(client_id):
    """
    Create a submission under a client.
    
    Args:
        client_id: Client identifier
    
    Request Body:
        {
            "name": "Submission name",
            "template_type": "property_renewal" (optional)
        }
    
    Returns:
        JSON with created submission metadata
    """
    try:
        # Check if client exists
        client_service = _client_service()
        client = client_service.get_client(client_id)
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Submission name is required'}), 400
        
        name = data['name'].strip()
        
        if not name:
            return jsonify({'error': 'Submission name cannot be empty'}), 400
        
        template_type = data.get('template_type')
        
        submission = _submission_service().create_submission(
            client_id=client_id,
            name=name,
            template_type=template_type
        )
        
        return jsonify({
            'success': True,
            'data': submission
        }), 201
        
    except Exception as e:
        return internal_server_error(logger, "Failed to create submission", e)



@client_bp.route('/templates', methods=['GET'])
@require_auth
def list_templates():
    """
    List all available submission templates.
    
    Returns:
        JSON with list of templates
    """
    try:
        templates = _template_library().list_templates()
        
        return jsonify({
            'success': True,
            'data': templates
        }), 200
        
    except Exception as e:
        return internal_server_error(logger, "Failed to list templates", e)
