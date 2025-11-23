"""
Client service - manages client CRUD operations.

A client contains multiple submissions (formerly folders).
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional


class ClientService:
    """
    Service for managing clients.
    
    Each client is a top-level entity that contains submissions.
    
    Directory structure:
    storage/clients/
        {client_id}/
            metadata.json  # Client info
            submissions/
                {submission_id}/  # Individual submission folders
                    metadata.json
                    inputs/
                    outputs/
    """
    
    def __init__(self):
        """Initialize service with storage path."""
        self.storage_dir = 'storage/clients'
        os.makedirs(self.storage_dir, exist_ok=True)
    
    def create_client(self, name: str) -> Dict[str, Any]:
        """
        Create a new client.
        
        Args:
            name: Client name (e.g., "ABC Manufacturing Corp")
            
        Returns:
            Client metadata dictionary
        """
        client_id = str(uuid.uuid4())
        client_path = os.path.join(self.storage_dir, client_id)
        
        # Create client structure
        os.makedirs(os.path.join(client_path, 'submissions'), exist_ok=True)
        
        # Create metadata
        metadata = {
            'client_id': client_id,
            'name': name,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'submission_count': 0,
            'submissions': []  # List of submission IDs
        }
        
        # Save metadata
        metadata_path = os.path.join(client_path, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return metadata
    
    def get_client(self, client_id: str) -> Optional[Dict[str, Any]]:
        """
        Get client by ID.
        
        Args:
            client_id: Client identifier
            
        Returns:
            Client metadata or None if not found
        """
        metadata_path = os.path.join(self.storage_dir, client_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Attach submission package details if available
        metadata['submissions_detailed'] = self._build_submission_packages(metadata)
        return metadata
    
    def list_clients(self) -> List[Dict[str, Any]]:
        """
        List all clients.
        
        Returns:
            List of client metadata dictionaries
        """
        clients = []
        
        if not os.path.exists(self.storage_dir):
            return clients
        
        for client_name in os.listdir(self.storage_dir):
            client_path = os.path.join(self.storage_dir, client_name)
            
            if not os.path.isdir(client_path):
                continue
            
            metadata_path = os.path.join(client_path, 'metadata.json')
            
            if not os.path.exists(metadata_path):
                continue
            
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            metadata['submissions_detailed'] = self._build_submission_packages(metadata)
            clients.append(metadata)
        
        # Sort by name ascending
        clients.sort(key=lambda x: x.get('name', '').lower())
        
        return clients
    
    def update_client(self, client_id: str, name: str) -> Optional[Dict[str, Any]]:
        """
        Update client name.
        
        Args:
            client_id: Client identifier
            name: New client name
            
        Returns:
            Updated client metadata or None if not found
        """
        metadata_path = os.path.join(self.storage_dir, client_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        metadata['name'] = name
        metadata['updated_at'] = datetime.utcnow().isoformat()
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return metadata
    
    def delete_client(self, client_id: str) -> bool:
        """
        Delete a client and all its submissions.
        
        Args:
            client_id: Client identifier
            
        Returns:
            True if deleted, False if not found
        """
        client_path = os.path.join(self.storage_dir, client_id)
        
        if not os.path.exists(client_path):
            return False
        
        # Delete client and all contents (including all submissions)
        import shutil
        shutil.rmtree(client_path)
        
        return True
    
    def add_submission(self, client_id: str, submission_id: str) -> bool:
        """
        Add a submission ID to client's submissions list.
        
        Args:
            client_id: Client identifier
            submission_id: Submission identifier
            
        Returns:
            True if added, False if client not found
        """
        metadata_path = os.path.join(self.storage_dir, client_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return False
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Add submission ID if not already present
        if submission_id not in metadata['submissions']:
            metadata['submissions'].append(submission_id)
            metadata['submission_count'] = len(metadata['submissions'])
            metadata['updated_at'] = datetime.utcnow().isoformat()
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
        
        return True

    def _build_submission_packages(self, client_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        submissions: List[Dict[str, Any]] = []
        client_id = client_metadata.get('client_id')
        if not client_id:
            return submissions

        submissions_dir = self.get_submissions_path(client_id)
        if not os.path.exists(submissions_dir):
            return submissions

        for submission_id in client_metadata.get('submissions', []):
            package = self._load_submission_package(client_metadata, submissions_dir, submission_id)
            if package:
                submissions.append(package)

        return submissions

    def _load_submission_package(
        self,
        client_metadata: Dict[str, Any],
        submissions_dir: str,
        submission_id: str,
    ) -> Optional[Dict[str, Any]]:
        submission_path = os.path.join(submissions_dir, submission_id)
        if not os.path.isdir(submission_path):
            return None

        metadata_path = os.path.join(submission_path, 'metadata.json')
        metadata: Dict[str, Any] = {}
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)

        inputs_dir = os.path.join(submission_path, 'inputs')
        outputs_dir = os.path.join(submission_path, 'outputs')

        def list_files(path: str) -> List[Dict[str, Any]]:
            files: List[Dict[str, Any]] = []
            if not os.path.exists(path):
                return files
            for filename in sorted(os.listdir(path)):
                full_path = os.path.join(path, filename)
                if os.path.isfile(full_path):
                    files.append({
                        'filename': filename,
                        'path': os.path.relpath(full_path, start=self.storage_dir),
                        'url': None,
                    })
            return files

        inputs = metadata.get('inputs') or list_files(inputs_dir)
        outputs = metadata.get('outputs') or list_files(outputs_dir)

        uploaded_at = metadata.get('uploaded_at') or metadata.get('created_at')
        updated_at = metadata.get('updated_at') or uploaded_at

        return {
            'submission_id': submission_id,
            'client_id': client_metadata.get('client_id'),
            'name': metadata.get('name') or metadata.get('filename') or f'Submission {submission_id[:8]}',
            'status': metadata.get('status', 'uploaded'),
            'uploaded_at': uploaded_at,
            'updated_at': updated_at,
            'file_count': metadata.get('file_count') or len(inputs),
            'inputs': inputs,
            'outputs': outputs,
        }
    
    def remove_submission(self, client_id: str, submission_id: str) -> bool:
        """
        Remove a submission ID from client's submissions list.
        
        Args:
            client_id: Client identifier
            submission_id: Submission identifier
            
        Returns:
            True if removed, False if client not found
        """
        metadata_path = os.path.join(self.storage_dir, client_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return False
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Remove submission ID if present
        if submission_id in metadata['submissions']:
            metadata['submissions'].remove(submission_id)
            metadata['submission_count'] = len(metadata['submissions'])
            metadata['updated_at'] = datetime.utcnow().isoformat()
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
        
        return True
    
    def get_submissions_path(self, client_id: str) -> str:
        """
        Get path to client's submissions directory.
        
        Args:
            client_id: Client identifier
            
        Returns:
            Path to submissions directory
        """
        return os.path.join(self.storage_dir, client_id, 'submissions')
    
    def get_client_path(self, client_id: str) -> str:
        """
        Get client directory path.
        
        Args:
            client_id: Client identifier
            
        Returns:
            Absolute path to client directory
        """
        return os.path.join(self.storage_dir, client_id)
