"""Submission artifact storage helpers."""

from __future__ import annotations

import mimetypes
import os
from typing import Any, Dict, List, Optional

from services.supabase_storage_service import SupabaseStorageService


class SubmissionFileStore:
    """Thin adapter over submission input/output artifact storage."""

    def __init__(self, storage: Optional[SupabaseStorageService] = None) -> None:
        self.storage = storage or SupabaseStorageService()

    @property
    def enabled(self) -> bool:
        return bool(getattr(self.storage, "enabled", False))

    def upload(
        self,
        *,
        local_path: str,
        content_type: Optional[str],
        client_id: Optional[str],
        submission_id: str,
        category: str,
        filename: str,
    ) -> Optional[Dict[str, Any]]:
        segments: List[Optional[str]] = []
        if client_id:
            segments.extend(["clients", client_id])
        else:
            segments.append("submissions")
        segments.extend([submission_id, category, filename])

        if not self.storage.enabled:
            raise RuntimeError("Supabase storage must be configured for submission files.")

        result = self.storage.upload_file(
            local_path=local_path,
            storage_path=self.storage.build_path(*segments),
            content_type=content_type,
        )
        if not result:
            raise RuntimeError("Failed to upload submission file to Supabase storage.")
        return result

    def download(self, storage_info: Optional[Dict[str, Any]]) -> Optional[bytes]:
        if not storage_info:
            return None
        path = storage_info.get("path")
        if not path:
            return None
        return self.storage.download_file(path) if self.storage.enabled else None

    def delete(self, storage_info: Optional[Dict[str, Any]]) -> None:
        if not storage_info:
            return
        path = storage_info.get("path")
        if path and self.storage.enabled:
            self.storage.delete_file(path)
