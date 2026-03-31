"""
Version service - manages data versioning and audit trail without local files.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from services.supabase_db_service import SupabaseDatabaseService


class VersionService:
    """
    Stores version history alongside submission metadata in Supabase.
    """

    def __init__(self, current_user_id: Optional[str] = None) -> None:
        self.db = SupabaseDatabaseService()
        self.current_user_id = current_user_id
        if not self.db.enabled:
            raise RuntimeError("Supabase database must be configured for version storage.")

    # ------------------------------------------------------------------ helpers
    def _load_metadata(self, submission_id: str) -> Dict[str, Any]:
        metadata = self.db.get_submission_metadata(submission_id, user_id=self.current_user_id)
        if not metadata:
            raise ValueError("Submission not found")
        metadata.setdefault("versions", [])
        return metadata

    def _persist(self, metadata: Dict[str, Any]) -> None:
        self.db.save_submission_metadata(metadata, user_id=self.current_user_id)

    # ---------------------------------------------------------------- versions
    def create_version(
        self,
        submission_id: str,
        data: Dict[str, Any],
        user: str = "system",
        action: str = "update",
        notes: str = "",
    ) -> str:
        metadata = self._load_metadata(submission_id)
        versions: List[Dict[str, Any]] = metadata.setdefault("versions", [])
        version_id = str(uuid.uuid4())
        version_number = versions[-1]["version_number"] + 1 if versions else 1

        previous_data = versions[-1].get("data", {}) if versions else {}
        version_entry = {
            "version_id": version_id,
            "version_number": version_number,
            "submission_id": submission_id,
            "created_at": datetime.utcnow().isoformat(),
            "created_by": user,
            "action": action,
            "notes": notes,
            "data": data,
            "changes": self._calculate_changes(previous_data, data),
        }
        if versions:
            version_entry["previous_version_id"] = versions[-1]["version_id"]
        versions.append(version_entry)
        metadata["versions"] = versions
        metadata["current_version_id"] = version_id
        self._persist(metadata)
        return version_id

    def list_versions(self, submission_id: str) -> List[Dict[str, Any]]:
        metadata = self._load_metadata(submission_id)
        versions = metadata.get("versions", [])
        summaries = []
        for version in versions:
            summaries.append({
                "version_id": version["version_id"],
                "version_number": version["version_number"],
                "created_at": version["created_at"],
                "created_by": version["created_by"],
                "action": version["action"],
                "notes": version.get("notes", ""),
                "changes": version.get("changes", {}),
            })
        return summaries

    def get_version(self, submission_id: str, version_id: str) -> Optional[Dict[str, Any]]:
        metadata = self._load_metadata(submission_id)
        for version in metadata.get("versions", []):
            if version["version_id"] == version_id:
                return version
        return None

    def get_latest_version(self, submission_id: str) -> Optional[Dict[str, Any]]:
        metadata = self._load_metadata(submission_id)
        versions = metadata.get("versions", [])
        if not versions:
            return None
        return versions[-1]

    def compare_versions(
        self,
        submission_id: str,
        version_id_1: str,
        version_id_2: str,
    ) -> Dict[str, Any]:
        version1 = self.get_version(submission_id, version_id_1)
        version2 = self.get_version(submission_id, version_id_2)
        if not version1 or not version2:
            raise ValueError("One or both versions not found")
        changes = self._calculate_changes(version1.get("data", {}), version2.get("data", {}))
        return {
            "from_version": {
                "version_id": version1["version_id"],
                "version_number": version1["version_number"],
                "created_at": version1["created_at"],
                "created_by": version1["created_by"],
            },
            "to_version": {
                "version_id": version2["version_id"],
                "version_number": version2["version_number"],
                "created_at": version2["created_at"],
                "created_by": version2["created_by"],
            },
            "changes": changes,
        }

    def rollback_to_version(self, submission_id: str, version_id: str, user: str = "system") -> str:
        version = self.get_version(submission_id, version_id)
        if not version:
            raise ValueError("Version not found")
        return self.create_version(
            submission_id=submission_id,
            data=version.get("data", {}),
            user=user,
            action="rollback",
            notes=f"Rolled back to version {version['version_number']}",
        )

    def get_audit_trail(self, submission_id: str) -> List[Dict[str, Any]]:
        metadata = self._load_metadata(submission_id)
        trail = []
        for version in metadata.get("versions", []):
            trail.append({
                "timestamp": version["created_at"],
                "user": version["created_by"],
                "action": version["action"],
                "version_number": version["version_number"],
                "version_id": version["version_id"],
                "notes": version.get("notes", ""),
                "changes_summary": {
                    "added": len(version.get("changes", {}).get("added", [])),
                    "modified": len(version.get("changes", {}).get("modified", [])),
                    "deleted": len(version.get("changes", {}).get("deleted", [])),
                },
            })
        return sorted(trail, key=lambda entry: entry["timestamp"])

    # ----------------------------------------------------------------- helpers
    def _calculate_changes(self, old_data: Dict[str, Any], new_data: Dict[str, Any]) -> Dict[str, Any]:
        old_flat = self._flatten_dict(old_data)
        new_flat = self._flatten_dict(new_data)

        added, modified, deleted = [], [], []

        for key, new_value in new_flat.items():
            if key not in old_flat:
                added.append({"field": key, "new_value": new_value})
            elif old_flat[key] != new_value:
                modified.append({"field": key, "old_value": old_flat[key], "new_value": new_value})

        for key, old_value in old_flat.items():
            if key not in new_flat:
                deleted.append({"field": key, "old_value": old_value})

        return {"added": added, "modified": modified, "deleted": deleted}

    def _flatten_dict(self, data: Dict[str, Any], prefix: str = "", sep: str = ".") -> Dict[str, Any]:
        flat: Dict[str, Any] = {}
        for key, value in data.items():
            new_key = f"{prefix}{sep}{key}" if prefix else key
            if isinstance(value, dict):
                flat.update(self._flatten_dict(value, new_key, sep=sep))
            else:
                flat[new_key] = value
        return flat
