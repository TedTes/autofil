"""Submission metadata persistence helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.supabase_db_service import SupabaseDatabaseService


class SubmissionRepository:
    """Thin repository over submission metadata storage."""

    def __init__(
        self,
        db: Optional[SupabaseDatabaseService] = None,
        current_user_id: Optional[str] = None,
    ) -> None:
        self.db = db or SupabaseDatabaseService()
        self.current_user_id = current_user_id

    @property
    def enabled(self) -> bool:
        return bool(getattr(self.db, "enabled", False))

    def get(self, submission_id: str) -> Optional[Dict[str, Any]]:
        return self.db.get_submission_metadata(submission_id, user_id=self.current_user_id)

    def save(self, metadata: Dict[str, Any]) -> None:
        if self.enabled:
            self.db.save_submission_metadata(metadata, user_id=self.current_user_id)

    def delete(self, submission_id: str) -> None:
        if self.enabled:
            self.db.delete_submission_metadata(submission_id, user_id=self.current_user_id)

    def list_all(self) -> List[Dict[str, Any]]:
        if not self.enabled:
            return []
        return self.db.list_submissions_metadata(user_id=self.current_user_id)
