"""
Client API routes.

Endpoints for client management.
"""

from flask import Blueprint, request, jsonify
from services.client_service import ClientService
from services.submission_service import SubmissionService

client_bp = Blueprint('clients', __name__)
client_service = ClientService()
submission_service = SubmissionService()


@client_bp.route('/', methods=['GET'])
def list_clients():
    """
    List all clients with their submissions.
    
    Returns:
        JSON with list of clients and nested submissions
    """
    try:
        clients = client_service.list_clients()
        
        # For each client, get their submissions
        for client in clients:
            client_id = client['client_id']
            submissions = []
            
            for submission_id in client.get('submissions', []):
                sub = submission_service.get_submission(client_id, submission_id)
                if sub:
                    submissions.append(sub)
            
            client['submissions_detailed'] = submissions
        
        return jsonify({
            'success': True,
            'data':  clients
            
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@client_bp.route('/', methods=['POST'])
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
        
        client = client_service.create_client(name)
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@client_bp.route('/<client_id>', methods=['GET'])
def get_client(client_id):
    """
    Get client by ID with all submissions.
    
    Args:
        client_id: Client identifier
    
    Returns:
        JSON with client metadata and submissions
    """
    try:
        client = client_service.get_client(client_id)
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        # Get detailed submission info
        submissions = []
        for submission_id in client.get('submissions', []):
            sub = submission_service.get_submission(client_id, submission_id)
            if sub:
                submissions.append(sub)
        
        client['submissions_detailed'] = submissions
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@client_bp.route('/<client_id>', methods=['PUT'])
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
        
        client = client_service.update_client(client_id, name)
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({
            'success': True,
            'data':  client
            
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@client_bp.route('/<client_id>', methods=['DELETE'])
def delete_client(client_id):
    """
    Delete a client and all its submissions.
    
    Args:
        client_id: Client identifier
    
    Returns:
        JSON with success status
    """
    try:
        deleted = client_service.delete_client(client_id)
        
        if not deleted:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Client deleted successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@client_bp.route('/<client_id>/submissions', methods=['POST'])
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
        
        submission = submission_service.create_submission(
            client_id=client_id,
            name=name,
            template_type=template_type
        )
        
        return jsonify({
            'success': True,
            'data': submission
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@client_bp.route('/templates', methods=['GET'])
def list_templates():
    """
    List all available submission templates.
    
    Returns:
        JSON with list of templates
    """
    try:
        from lib.submission_templates import list_templates as get_all_templates
        
        templates = get_all_templates()
        
        return jsonify({
            'success': True,
            'data': templates
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
