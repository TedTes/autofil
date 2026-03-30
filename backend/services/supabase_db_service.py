"""
Supabase Postgres helper for persisting metadata.

Stores submission/client metadata JSON documents so we can reconstruct state
when local storage is not available (e.g., ephemeral deploys).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover
    Client = None  # type: ignore
    create_client = None  # type: ignore

logger = logging.getLogger(__name__)


class SupabaseDatabaseService:
    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

        self._client: Optional[Client] = None
        self.enabled = bool(self.url and self.key and Client and create_client)

        if self.enabled:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover - initialization failure logging
                logger.warning("supabase-db failed to initialize client: %s", exc)
                self.enabled = False
                self._client = None

    def _reset_client(self) -> bool:
        if not (self.url and self.key and Client and create_client):
            return False
        try:
            self._client = create_client(self.url, self.key)
            self.enabled = True
            return True
        except Exception as exc:
            logger.warning("supabase-db failed to reinitialize client: %s", exc)
            self.enabled = False
            self._client = None
            return False

    def _should_retry(self, exc: Exception) -> bool:
        msg = str(exc).lower()
        return "server disconnected" in msg or "connection terminated" in msg

    # ------------------------------------------------------------------ helpers
    def _execute(self, request):
        response = request.execute()
        if hasattr(response, "data"):
            return response.data
        return response.get("data")  # type: ignore[return-value]

    # ---------------------------------------------------------------- submissions
    def save_submission_metadata(self, metadata: Dict[str, Any]) -> None:
        if not self.enabled or not self._client:
            return
        submission_id = metadata.get("submission_id")
        if not submission_id:
            return
        payload = {
            "submission_id": submission_id,
            "client_id": metadata.get("client_id"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        for attempt in range(2):
            try:
                self._client.table("submissions_metadata").upsert(
                    payload,
                    on_conflict="submission_id",
                ).execute()
                return
            except Exception as exc:
                logger.warning("supabase-db failed to save submission %s: %s", submission_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break

    def get_submission_metadata(self, submission_id: str) -> Optional[Dict[str, Any]]:
        for attempt in range(2):
            if not self.enabled or not self._client:
                return None
            try:
                data = self._execute(
                    self._client.table("submissions_metadata")
                    .select("metadata")
                    .eq("submission_id", submission_id)
                    .maybe_single()
                )
                if data:
                    return data.get("metadata")
                return None
            except Exception as exc:
                logger.warning("supabase-db failed to fetch submission %s: %s", submission_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return None

    def delete_submission_metadata(self, submission_id: str) -> None:
        if not self.enabled or not self._client:
            return
        try:
            self._client.table("submissions_metadata").delete().eq("submission_id", submission_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete submission %s: %s", submission_id, exc)

    def list_submissions_metadata(self) -> List[Dict[str, Any]]:
        for attempt in range(2):
            if not self.enabled or not self._client:
                return []
            try:
                rows = self._execute(
                    self._client.table("submissions_metadata")
                    .select("metadata")
                )
                if not rows:
                    return []
                return [
                    meta for meta in
                    (row.get("metadata") for row in rows)
                    if meta and (meta.get("file_count") or 0) > 0
                ]
            except Exception as exc:
                logger.warning("supabase-db failed to list submissions: %s", exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return []

    # -------------------------------------------------------------------- clients
    def save_client_metadata(self, metadata: Dict[str, Any]) -> None:
        if not self.enabled or not self._client:
            return
        client_id = metadata.get("client_id")
        if not client_id:
            return
        payload = {
            "client_id": client_id,
            "name": metadata.get("name"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        for attempt in range(2):
            try:
                self._client.table("clients_metadata").upsert(
                    payload,
                    on_conflict="client_id",
                ).execute()
                return
            except Exception as exc:
                logger.warning("supabase-db failed to save client %s: %s", client_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break

    def get_client_metadata(self, client_id: str) -> Optional[Dict[str, Any]]:
        for attempt in range(2):
            if not self.enabled or not self._client:
                return None
            try:
                data = self._execute(
                    self._client.table("clients_metadata")
                    .select("metadata")
                    .eq("client_id", client_id)
                    .single()
                )
                if data:
                    return data.get("metadata")
                return None
            except Exception as exc:
                logger.warning("supabase-db failed to fetch client %s: %s", client_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return None

    def list_clients_metadata(self) -> List[Dict[str, Any]]:
        for attempt in range(2):
            if not self.enabled or not self._client:
                return []
            try:
                rows = self._execute(
                    self._client.table("clients_metadata")
                    .select("metadata")
                    .order("name")
                )
                if not rows:
                    return []
                return [row.get("metadata") for row in rows if row.get("metadata")]
            except Exception as exc:
                logger.warning("supabase-db failed to list clients: %s", exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return []

    def delete_client_metadata(self, client_id: str) -> None:
        if not self.enabled or not self._client:
            return
        try:
            self._client.table("clients_metadata").delete().eq("client_id", client_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete client %s: %s", client_id, exc)

    # -------------------------------------------------------------------- folders
    def save_folder_metadata(self, metadata: Dict[str, Any]) -> None:
        if not self.enabled or not self._client:
            return
        folder_id = metadata.get("folder_id")
        if not folder_id:
            return
        payload = {
            "folder_id": folder_id,
            "name": metadata.get("name"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        try:
            self._client.table("folders_metadata").upsert(
                payload,
                on_conflict="folder_id",
            ).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to save folder %s: %s", folder_id, exc)

    def get_folder_metadata(self, folder_id: str) -> Optional[Dict[str, Any]]:
        if not self.enabled or not self._client:
            return None
        try:
            data = self._execute(
                self._client.table("folders_metadata")
                .select("metadata")
                .eq("folder_id", folder_id)
                .single()
            )
            if data:
                return data.get("metadata")
        except Exception as exc:
            logger.warning("supabase-db failed to fetch folder %s: %s", folder_id, exc)
        return None

    def list_folders_metadata(self) -> List[Dict[str, Any]]:
        if not self.enabled or not self._client:
            return []
        try:
            rows = self._execute(
                self._client.table("folders_metadata")
                .select("metadata")
                .order("updated_at", desc=True)
            )
            if not rows:
                return []
            return [row.get("metadata") for row in rows if row.get("metadata")]
        except Exception as exc:
            logger.warning("supabase-db failed to list folders: %s", exc)
            return []

    def delete_folder_metadata(self, folder_id: str) -> None:
        if not self.enabled or not self._client:
            return
        try:
            self._client.table("folders_metadata").delete().eq("folder_id", folder_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete folder %s: %s", folder_id, exc)
