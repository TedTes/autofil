"""
Client service - manages client CRUD operations.

A client contains multiple submissions (formerly folders).
"""

import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import os
import re

from services.supabase_db_service import SupabaseDatabaseService


class ClientService:
    """
    Service for managing clients.
    
    Each client is a top-level entity that contains submissions stored remotely.
    """
    
    def __init__(self, current_user_id: Optional[str] = None):
        """Initialize service with Supabase metadata store."""
        self.db = SupabaseDatabaseService()
        self.current_user_id = current_user_id
        if not self.db.enabled:
            raise RuntimeError("Supabase database must be configured for client metadata storage.")

    def _persist_client_metadata(self, metadata: Dict[str, Any]) -> None:
        self.db.save_client_metadata(metadata, user_id=self.current_user_id)

    def _require_client_metadata(self, client_id: str) -> Dict[str, Any]:
        metadata = self.db.get_client_metadata(client_id, user_id=self.current_user_id)
        if not metadata:
            raise ValueError("Client not found")
        return metadata

    def _ingestion_domain(self) -> str:
        return os.getenv("EMAIL_INGEST_DOMAIN", "ingest.fillform.io").strip().lower()

    def _client_slug(self, name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", (name or "account").lower()).strip("-")
        return slug or "account"

    def _build_ingestion_email(self, name: str, client_id: str) -> str:
        suffix = (client_id or "").replace("-", "")[:8]
        return f"{self._client_slug(name)}-{suffix}@{self._ingestion_domain()}"

    def _ensure_ingestion_email(self, metadata: Dict[str, Any], *, persist: bool = True) -> Dict[str, Any]:
        if metadata.get("ingestion_email"):
            return metadata
        client_id = metadata.get("client_id")
        if not client_id:
            return metadata
        metadata["ingestion_email"] = self._build_ingestion_email(metadata.get("name", "account"), client_id)
        metadata["updated_at"] = datetime.utcnow().isoformat()
        if persist:
            self._persist_client_metadata(metadata)
        return metadata
    
    def create_client(self, name: str) -> Dict[str, Any]:
        """
        Create a new client.
        
        Args:
            name: Client name (e.g., "ABC Manufacturing Corp")
            
        Returns:
            Client metadata dictionary
        """
        client_id = str(uuid.uuid4())
        
        # Create metadata
        metadata = {
            'client_id': client_id,
            'name': name,
            'owner_user_id': self.current_user_id,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'submission_count': 0,
            'submissions': []  # List of submission IDs
        }
        metadata["ingestion_email"] = self._build_ingestion_email(name, client_id)
        
        self._persist_client_metadata(metadata)
        return metadata
    
    def get_client(self, client_id: str) -> Optional[Dict[str, Any]]:
        """
        Get client by ID (metadata only)
        """
        metadata = self.db.get_client_metadata(client_id, user_id=self.current_user_id)
        if metadata is None:
            return None
        metadata = self._ensure_ingestion_email(metadata)
        
        metadata.setdefault('submissions', [])
        metadata['submission_count'] = len(metadata['submissions'])
        return metadata
    
    def list_clients(self, include_submissions: bool = False) -> List[Dict[str, Any]]:
        """
        List all clients.
        
        Returns:
            List of client metadata dictionaries
        """
        clients = self.db.list_clients_metadata(user_id=self.current_user_id)
        for metadata in clients:
            self._ensure_ingestion_email(metadata, persist=False)
            metadata.setdefault('submissions', [])
            metadata['submission_count'] = len(metadata['submissions'])
            if include_submissions:
                metadata['submissions_detailed'] = self._build_submission_packages(metadata)
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
        try:
            metadata = self._require_client_metadata(client_id)
        except ValueError:
            return None

        metadata['name'] = name
        metadata['updated_at'] = datetime.utcnow().isoformat()
        
        self._persist_client_metadata(metadata)
        
        return metadata

    def find_by_ingestion_email(self, email: str) -> Optional[Dict[str, Any]]:
        normalized = (email or "").strip().lower()
        if not normalized:
            return None
        for metadata in self.db.list_clients_metadata(user_id=self.current_user_id):
            self._ensure_ingestion_email(metadata)
            if (metadata.get("ingestion_email") or "").strip().lower() == normalized:
                return metadata
        return None
    
    def delete_client(self, client_id: str) -> bool:
        """
        Delete a client and all its submissions.
        
        Args:
            client_id: Client identifier
            
        Returns:
            True if deleted, False if not found
        """
        metadata = self.db.get_client_metadata(client_id, user_id=self.current_user_id)
        if metadata is None:
            return False

        for submission_id in metadata.get('submissions', []):
            try:
                self.db.delete_submission_metadata(submission_id, user_id=self.current_user_id)
            except Exception:
                pass
        self.db.delete_client_metadata(client_id, user_id=self.current_user_id)
        return True
    
    def add_submission(self, client_id: str, submission_id: str) -> bool:
        """
        Add a submission ID to client's submissions list.
        """
        try:
            metadata = self._require_client_metadata(client_id)
        except ValueError:
            return False

        submissions = metadata.setdefault('submissions', [])
        if submission_id not in submissions:
            submissions.append(submission_id)
            metadata['submission_count'] = len(submissions)
            metadata['updated_at'] = datetime.utcnow().isoformat()
            self._persist_client_metadata(metadata)
        return True

    def _build_submission_packages(self, client_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        submissions: List[Dict[str, Any]] = []
        client_id = client_metadata.get('client_id')
        if not client_id:
            return submissions

        for submission_id in client_metadata.get('submissions', []):
            package = self._load_submission_package(client_metadata, submission_id)
            if package:
                submissions.append(package)

        return submissions

    def _load_submission_package(
        self,
        client_metadata: Dict[str, Any],
        submission_id: str,
    ) -> Optional[Dict[str, Any]]:
        metadata = self.db.get_submission_metadata(submission_id, user_id=self.current_user_id)
        if not metadata:
            return None

        inputs = metadata.get('inputs') or []
        outputs = metadata.get('outputs') or []

        uploaded_at = metadata.get('uploaded_at') or metadata.get('created_at')
        updated_at = metadata.get('updated_at') or uploaded_at

        # Keep submission display name independent of any uploaded filename
        submission_name = metadata.get('name') or metadata.get('title') or f"Submission {submission_id[:8]}"

        return {
            'submission_id': submission_id,
            'client_id': client_metadata.get('client_id'),
            'name': submission_name,
            'template_type': metadata.get('template_type'),
            'template_metadata': metadata.get('template_metadata'),
            'status': metadata.get('status', 'uploaded'),
            'uploaded_at': uploaded_at,
            'updated_at': updated_at,
            'file_count': metadata.get('file_count') or len(inputs),
            'inputs': inputs,
            'outputs': outputs,
        }

    def list_client_packages(self, client_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Return all submission packages for a client.
        """
        metadata = self.db.get_client_metadata(client_id, user_id=self.current_user_id)
        if metadata is None:
            return None
        metadata.setdefault('submissions', [])
        return self._build_submission_packages(metadata)
    
    def remove_submission(self, client_id: str, submission_id: str) -> bool:
        """
        Remove a submission ID from client's submissions list.
        """
        try:
            metadata = self._require_client_metadata(client_id)
        except ValueError:
            return False

        submissions = metadata.setdefault('submissions', [])
        if submission_id in submissions:
            submissions.remove(submission_id)
            metadata['submission_count'] = len(submissions)
            metadata['updated_at'] = datetime.utcnow().isoformat()
            self._persist_client_metadata(metadata)
        return True
    
