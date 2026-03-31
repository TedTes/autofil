"""
Supabase Postgres helper for persisting metadata.

Stores submission/client metadata JSON documents so we can reconstruct state
when local storage is not available (e.g., ephemeral deploys).
"""
from __future__ import annotations

import logging
import os
import json
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
        self.local_root = os.getenv(
            "LOCAL_METADATA_ROOT",
            os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "storage",
                "metadata",
            ),
        )

        self._client: Optional[Client] = None
        self.remote_enabled = bool(self.url and self.key and Client and create_client)
        self.enabled = True

        if self.remote_enabled:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover - initialization failure logging
                logger.warning("supabase-db failed to initialize client: %s", exc)
                self.remote_enabled = False
                self._client = None

        if not self.remote_enabled:
            os.makedirs(self.local_root, exist_ok=True)
            logger.info("supabase-db unavailable; using local metadata store at %s", self.local_root)

    def _reset_client(self) -> bool:
        if not (self.url and self.key and Client and create_client):
            return False
        try:
            self._client = create_client(self.url, self.key)
            self.remote_enabled = True
            return True
        except Exception as exc:
            logger.warning("supabase-db failed to reinitialize client: %s", exc)
            self.remote_enabled = False
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

    def _local_dir(self, collection: str) -> str:
        path = os.path.join(self.local_root, collection)
        os.makedirs(path, exist_ok=True)
        return path

    def _local_path(self, collection: str, item_id: str) -> str:
        return os.path.join(self._local_dir(collection), f"{item_id}.json")

    def _local_save(self, collection: str, item_id: str, metadata: Dict[str, Any]) -> None:
        path = self._local_path(collection, item_id)
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2)
        os.replace(tmp_path, path)

    def _local_get(self, collection: str, item_id: str) -> Optional[Dict[str, Any]]:
        path = self._local_path(collection, item_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except json.JSONDecodeError as exc:
            repaired = self._repair_local_json(path, exc)
            if repaired is not None:
                return repaired
            logger.warning("local metadata read failed for %s: %s", path, exc)
            return None

    def _local_list(self, collection: str) -> List[Dict[str, Any]]:
        collection_dir = self._local_dir(collection)
        items: List[Dict[str, Any]] = []
        for filename in os.listdir(collection_dir):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(collection_dir, filename)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    items.append(json.load(handle))
            except json.JSONDecodeError as exc:
                repaired = self._repair_local_json(path, exc)
                if repaired is not None:
                    items.append(repaired)
                else:
                    logger.warning("local metadata read failed for %s: %s", path, exc)
            except Exception as exc:
                logger.warning("local metadata read failed for %s: %s", path, exc)
        return items

    def _local_delete(self, collection: str, item_id: str) -> None:
        path = self._local_path(collection, item_id)
        if os.path.exists(path):
            os.remove(path)

    def _repair_local_json(self, path: str, exc: json.JSONDecodeError) -> Optional[Dict[str, Any]]:
        """Repair metadata files with trailing junk by keeping the first valid JSON object."""
        if "Extra data" not in str(exc):
            return None
        try:
            with open(path, "r", encoding="utf-8") as handle:
                raw_text = handle.read()
            decoder = json.JSONDecoder()
            payload, end = decoder.raw_decode(raw_text)
            trailing = raw_text[end:].strip()
            if not isinstance(payload, dict) or not trailing:
                return None
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
            os.replace(tmp_path, path)
            logger.warning("repaired malformed local metadata file %s by trimming trailing data", path)
            return payload
        except Exception as repair_exc:
            logger.warning("failed to repair malformed local metadata file %s: %s", path, repair_exc)
            return None

    # ---------------------------------------------------------------- submissions
    def save_submission_metadata(self, metadata: Dict[str, Any]) -> None:
        submission_id = metadata.get("submission_id")
        if not submission_id:
            return
        if not self.remote_enabled or not self._client:
            self._local_save("submissions", submission_id, metadata)
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
        if not self.remote_enabled or not self._client:
            return self._local_get("submissions", submission_id)
        for attempt in range(2):
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
        if not self.remote_enabled or not self._client:
            self._local_delete("submissions", submission_id)
            return
        try:
            self._client.table("submissions_metadata").delete().eq("submission_id", submission_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete submission %s: %s", submission_id, exc)

    def list_submissions_metadata(self) -> List[Dict[str, Any]]:
        if not self.remote_enabled or not self._client:
            return [
                meta for meta in self._local_list("submissions")
                if meta and (meta.get("file_count") or 0) > 0
            ]
        for attempt in range(2):
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
        client_id = metadata.get("client_id")
        if not client_id:
            return
        if not self.remote_enabled or not self._client:
            self._local_save("clients", client_id, metadata)
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
        if not self.remote_enabled or not self._client:
            return self._local_get("clients", client_id)
        for attempt in range(2):
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
        if not self.remote_enabled or not self._client:
            rows = self._local_list("clients")
            return sorted(rows, key=lambda row: (row or {}).get("name", "").lower())
        for attempt in range(2):
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
        if not self.remote_enabled or not self._client:
            self._local_delete("clients", client_id)
            return
        try:
            self._client.table("clients_metadata").delete().eq("client_id", client_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete client %s: %s", client_id, exc)

    # -------------------------------------------------------------------- folders
    def save_folder_metadata(self, metadata: Dict[str, Any]) -> None:
        folder_id = metadata.get("folder_id")
        if not folder_id:
            return
        if not self.remote_enabled or not self._client:
            self._local_save("folders", folder_id, metadata)
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
        if not self.remote_enabled or not self._client:
            return self._local_get("folders", folder_id)
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
        if not self.remote_enabled or not self._client:
            return self._local_list("folders")
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
        if not self.remote_enabled or not self._client:
            self._local_delete("folders", folder_id)
            return
        try:
            self._client.table("folders_metadata").delete().eq("folder_id", folder_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete folder %s: %s", folder_id, exc)
