"""
Folder service - manages folder CRUD operations backed by Supabase metadata.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from services.supabase_db_service import SupabaseDatabaseService


class FolderService:
    """Service for managing logical folders without touching local disk."""

    def __init__(self, current_user_id: Optional[str] = None) -> None:
        self.db = SupabaseDatabaseService()
        self.current_user_id = current_user_id
        if not self.db.enabled:
            raise RuntimeError("Supabase database must be configured for folder metadata storage.")

    # ------------------------------------------------------------------ helpers
    def _persist(self, metadata: Dict[str, Any]) -> None:
        self.db.save_folder_metadata(metadata, user_id=self.current_user_id)

    def _load(self, folder_id: str) -> Optional[Dict[str, Any]]:
        metadata = self.db.get_folder_metadata(folder_id, user_id=self.current_user_id)
        if metadata:
            metadata.setdefault("submissions", [])
            metadata["file_count"] = metadata.get("file_count") or len(metadata["submissions"])
        return metadata

    # ---------------------------------------------------------------- CRUD -----
    def create_folder(self, name: str) -> Dict[str, Any]:
        folder_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()
        metadata = {
            "folder_id": folder_id,
            "name": name,
            "owner_user_id": self.current_user_id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "file_count": 0,
            "submissions": [],
        }
        self._persist(metadata)
        return metadata

    def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        return self._load(folder_id)

    def list_folders(self) -> List[Dict[str, Any]]:
        folders = self.db.list_folders_metadata(user_id=self.current_user_id)
        for folder in folders:
            folder.setdefault("submissions", [])
            folder["file_count"] = folder.get("file_count") or len(folder["submissions"])
        return folders

    def update_folder(self, folder_id: str, name: str) -> Optional[Dict[str, Any]]:
        metadata = self._load(folder_id)
        if not metadata:
            return None
        metadata["name"] = name
        metadata["updated_at"] = datetime.utcnow().isoformat()
        self._persist(metadata)
        return metadata

    def delete_folder(self, folder_id: str) -> bool:
        metadata = self._load(folder_id)
        if not metadata:
            return False
        self.db.delete_folder_metadata(folder_id, user_id=self.current_user_id)
        return True

    # ----------------------------------------------------------- submissions ---
    def add_submission(self, folder_id: str, submission_id: str, filename: str) -> bool:
        metadata = self._load(folder_id)
        if not metadata:
            return False
        entry = {
            "submission_id": submission_id,
            "filename": filename,
            "uploaded_at": datetime.utcnow().isoformat(),
            "status": "extracted",
        }
        submissions = metadata.setdefault("submissions", [])
        submissions.append(entry)
        metadata["file_count"] = len(submissions)
        metadata["updated_at"] = entry["uploaded_at"]
        self._persist(metadata)
        return True

    def remove_submission(self, folder_id: str, submission_id: str) -> bool:
        metadata = self._load(folder_id)
        if not metadata:
            return False
        submissions = metadata.get("submissions", [])
        original = len(submissions)
        metadata["submissions"] = [
            entry for entry in submissions if entry.get("submission_id") != submission_id
        ]
        if len(metadata["submissions"]) == original:
            return True
        metadata["file_count"] = len(metadata["submissions"])
        metadata["updated_at"] = datetime.utcnow().isoformat()
        self._persist(metadata)
        return True
