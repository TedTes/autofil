"""
Folder service - manages folder CRUD operations.
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional


class FolderService:
    """
    Service for managing folders.
    
    Each folder contains:
    - metadata.json (folder info)
    - inputs/ (uploaded PDFs)
    - outputs/ (filled PDFs)
    """
    
    def __init__(self):
        """Initialize service with storage path."""
        self.storage_dir = 'storage/folders'
        os.makedirs(self.storage_dir, exist_ok=True)
    
    def create_folder(self, name: str) -> Dict[str, Any]:
        """
        Create a new folder.
        
        Args:
            name: Folder name
            
        Returns:
            Folder metadata dictionary
        """
        folder_id = str(uuid.uuid4())
        folder_path = os.path.join(self.storage_dir, folder_id)
        
        # Create folder structure
        os.makedirs(os.path.join(folder_path, 'inputs'), exist_ok=True)
        os.makedirs(os.path.join(folder_path, 'outputs'), exist_ok=True)
        
        # Create metadata
        metadata = {
            'folder_id': folder_id,
            'name': name,
            'created_at': datetime.utcnow().isoformat(),
            'file_count': 0,
            'submissions': []
        }
        
        # Save metadata
        metadata_path = os.path.join(folder_path, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return metadata
    
    def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        """
        Get folder by ID.
        
        Args:
            folder_id: Folder identifier
            
        Returns:
            Folder metadata or None if not found
        """
        metadata_path = os.path.join(self.storage_dir, folder_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        return metadata
    
    def list_folders(self) -> List[Dict[str, Any]]:
        """
        List all folders.
        
        Returns:
            List of folder metadata dictionaries
        """
        folders = []
        
        if not os.path.exists(self.storage_dir):
            return folders
        
        for folder_name in os.listdir(self.storage_dir):
            folder_path = os.path.join(self.storage_dir, folder_name)
            
            if not os.path.isdir(folder_path):
                continue
            
            metadata_path = os.path.join(folder_path, 'metadata.json')
            
            if not os.path.exists(metadata_path):
                continue
            
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            folders.append(metadata)
        
        # Sort by created_at descending
        folders.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return folders
    
    def update_folder(self, folder_id: str, name: str) -> Optional[Dict[str, Any]]:
        """
        Update folder name.
        
        Args:
            folder_id: Folder identifier
            name: New folder name
            
        Returns:
            Updated folder metadata or None if not found
        """
        metadata_path = os.path.join(self.storage_dir, folder_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        metadata['name'] = name
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return metadata
    
    def delete_folder(self, folder_id: str) -> bool:
        """
        Delete a folder and all its contents.
        
        Args:
            folder_id: Folder identifier
            
        Returns:
            True if deleted, False if not found
        """
        folder_path = os.path.join(self.storage_dir, folder_id)
        
        if not os.path.exists(folder_path):
            return False
        
        # Delete folder and all contents
        import shutil
        shutil.rmtree(folder_path)
        
        return True
    
    def add_submission(
        self, 
        folder_id: str, 
        submission_id: str, 
        filename: str
    ) -> bool:
        """
        Add a submission to folder metadata.
        
        Args:
            folder_id: Folder identifier
            submission_id: Submission identifier
            filename: Original filename
            
        Returns:
            True if added, False if folder not found
        """
        metadata_path = os.path.join(self.storage_dir, folder_id, 'metadata.json')
        
        if not os.path.exists(metadata_path):
            return False
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Add submission
        submission_entry = {
            'submission_id': submission_id,
            'filename': filename,
            'uploaded_at': datetime.utcnow().isoformat(),
            'status': 'extracted'
        }
        
        metadata['submissions'].append(submission_entry)
        metadata['file_count'] = len(metadata['submissions'])
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return True

    def remove_submission(self, folder_id: str, submission_id: str) -> bool:
        """
        Remove a submission entry from folder metadata.
        """
        metadata_path = os.path.join(self.storage_dir, folder_id, 'metadata.json')
        if not os.path.exists(metadata_path):
            return False

        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        original_count = len(metadata.get('submissions', []))
        metadata['submissions'] = [
            s for s in metadata.get('submissions', [])
            if s.get('submission_id') != submission_id
        ]
        if len(metadata['submissions']) == original_count:
            return True

        metadata['file_count'] = len(metadata['submissions'])

        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        return True
    
    def get_folder_path(self, folder_id: str) -> str:
        """
        Get folder path.
        
        Args:
            folder_id: Folder identifier
            
        Returns:
            Absolute path to folder
        """
        return os.path.join(self.storage_dir, folder_id)
    
    def get_inputs_path(self, folder_id: str) -> str:
        """
        Get folder inputs path.
        
        Args:
            folder_id: Folder identifier
            
        Returns:
            Path to inputs directory
        """
        return os.path.join(self.storage_dir, folder_id, 'inputs')
    
    def get_outputs_path(self, folder_id: str) -> str:
        """
        Get folder outputs path.
        
        Args:
            folder_id: Folder identifier
            
        Returns:
            Path to outputs directory
        """
        return os.path.join(self.storage_dir, folder_id, 'outputs')
