"""Submission artifact storage helpers."""

from __future__ import annotations

import mimetypes
import os
import shutil
from typing import Any, Dict, List, Optional

from services.supabase_storage_service import SupabaseStorageService
from storage.providers import LocalStorageProvider


class SubmissionFileStore:
    """Thin adapter over submission input/output artifact storage."""

    def __init__(self, storage: Optional[SupabaseStorageService] = None) -> None:
        self.storage = storage or SupabaseStorageService()
        self.local_storage = LocalStorageProvider(
            os.getenv("LOCAL_FILE_STORAGE_ROOT", os.path.join("storage", "files"))
        )

    @property
    def enabled(self) -> bool:
        return True

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

        if getattr(self.storage, "enabled", False):
            return self.storage.upload_file(
                local_path=local_path,
                storage_path=self.storage.build_path(*segments),
                content_type=content_type,
            )

        relative_path = os.path.join(*[segment for segment in segments if segment])
        full_path = self.local_storage.full_path(relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        shutil.copy2(local_path, full_path)
        return {
            "provider": "local",
            "path": relative_path,
            "local_path": full_path,
            "public_url": None,
            "content_type": content_type or mimetypes.guess_type(local_path)[0] or "application/octet-stream",
        }

    def download(self, storage_info: Optional[Dict[str, Any]]) -> Optional[bytes]:
        if not storage_info:
            return None
        path = storage_info.get("path")
        if not path:
            return None
        if getattr(self.storage, "enabled", False):
            return self.storage.download_file(path)
        full_path = storage_info.get("local_path") or self.local_storage.full_path(path)
        if not os.path.exists(full_path):
            return None
        with open(full_path, "rb") as handle:
            return handle.read()

    def delete(self, storage_info: Optional[Dict[str, Any]]) -> None:
        if not storage_info:
            return
        path = storage_info.get("path")
        if path:
            if getattr(self.storage, "enabled", False):
                self.storage.delete_file(path)
            else:
                self.local_storage.delete(path)
