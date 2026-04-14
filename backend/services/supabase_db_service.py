"""
Supabase Postgres helper for persisting metadata.

Stores submission/client metadata JSON documents so we can reconstruct state
when local storage is not available (e.g., ephemeral deploys).
"""
from __future__ import annotations

import logging
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests

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
        self.remote_enabled = bool(self.url and self.key)
        self.enabled = True

        if self.remote_enabled and Client and create_client:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover - initialization failure logging
                logger.warning("supabase-db failed to initialize client: %s", exc)
                self._client = None

        if not self.remote_enabled:
            logger.warning("supabase-db unavailable; metadata operations will fail without Supabase config")

    def _reset_client(self) -> bool:
        if not (self.url and self.key):
            return False
        if not (Client and create_client):
            self.remote_enabled = True
            self._client = None
            return True
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

    def _rest_headers(self, *, prefer: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.key or "",
            "Authorization": f"Bearer {self.key or ''}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _rest_url(self, table: str) -> str:
        return f"{self.url}/rest/v1/{quote(table, safe='')}"

    def _http_upsert(
        self,
        table: str,
        payload: Dict[str, Any],
        *,
        on_conflict: str,
    ) -> bool:
        try:
            response = requests.post(
                self._rest_url(table),
                headers=self._rest_headers(prefer="resolution=merge-duplicates,return=minimal"),
                params={"on_conflict": on_conflict},
                json=payload,
                timeout=20,
            )
            if response.status_code not in {200, 201}:
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
            return True
        except Exception as exc:
            logger.warning("supabase-db http upsert failed for %s: %s", table, exc)
            return False

    def _http_select(
        self,
        table: str,
        *,
        filters: Optional[Dict[str, str]] = None,
        order: Optional[str] = None,
        maybe_single: bool = False,
    ) -> Optional[List[Dict[str, Any]]]:
        try:
            params: Dict[str, str] = {"select": "metadata"}
            if filters:
                for key, value in filters.items():
                    params[key] = f"eq.{value}"
            if order:
                params["order"] = order
            headers = self._rest_headers(
                prefer="return=representation" + (",plurality=singular" if maybe_single else "")
            )
            response = requests.get(
                self._rest_url(table),
                headers=headers,
                params=params,
                timeout=20,
            )
            if response.status_code == 406 and maybe_single:
                return None
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
            payload = response.json()
            if maybe_single:
                return [payload] if isinstance(payload, dict) else (payload or None)
            return payload or []
        except Exception as exc:
            logger.warning("supabase-db http select failed for %s: %s", table, exc)
            return None

    def _http_delete(self, table: str, *, filters: Dict[str, str]) -> bool:
        try:
            params: Dict[str, str] = {}
            for key, value in filters.items():
                params[key] = f"eq.{value}"
            response = requests.delete(
                self._rest_url(table),
                headers=self._rest_headers(prefer="return=minimal"),
                params=params,
                timeout=20,
            )
            if response.status_code not in {200, 204}:
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
            return True
        except Exception as exc:
            logger.warning("supabase-db http delete failed for %s: %s", table, exc)
            return False

    def _require_remote(self) -> None:
        if not self.remote_enabled:
            raise RuntimeError("Supabase metadata storage must be configured.")

    def _stamp_owner(self, metadata: Dict[str, Any], user_id: Optional[str]) -> Dict[str, Any]:
        if user_id and not metadata.get("owner_user_id"):
            metadata["owner_user_id"] = user_id
        return metadata

    def _is_visible_to_user(self, metadata: Optional[Dict[str, Any]], user_id: Optional[str]) -> bool:
        if not metadata:
            return False
        if not user_id:
            return True
        owner_user_id = metadata.get("owner_user_id")
        return owner_user_id is None or owner_user_id == user_id

    def _claim_submission_if_unowned(
        self,
        metadata: Optional[Dict[str, Any]],
        user_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if metadata and user_id and not metadata.get("owner_user_id"):
            self.save_submission_metadata(metadata, user_id=user_id)
            metadata["owner_user_id"] = user_id
        return metadata

    def _claim_client_if_unowned(
        self,
        metadata: Optional[Dict[str, Any]],
        user_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if metadata and user_id and not metadata.get("owner_user_id"):
            self.save_client_metadata(metadata, user_id=user_id)
            metadata["owner_user_id"] = user_id
        return metadata

    def _claim_folder_if_unowned(
        self,
        metadata: Optional[Dict[str, Any]],
        user_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if metadata and user_id and not metadata.get("owner_user_id"):
            self.save_folder_metadata(metadata, user_id=user_id)
            metadata["owner_user_id"] = user_id
        return metadata

    # ---------------------------------------------------------------- submissions
    def save_submission_metadata(self, metadata: Dict[str, Any], user_id: Optional[str] = None) -> None:
        submission_id = metadata.get("submission_id")
        if not submission_id:
            return
        metadata = self._stamp_owner(metadata, user_id)
        self._require_remote()
        payload = {
            "submission_id": submission_id,
            "client_id": metadata.get("client_id"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        if not self._client:
            self._http_upsert("submissions_metadata", payload, on_conflict="submission_id")
            return
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

    def get_submission_metadata(self, submission_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select(
                "submissions_metadata",
                filters={"submission_id": submission_id},
                maybe_single=True,
            )
            if rows:
                metadata = rows[0].get("metadata")
                metadata = self._claim_submission_if_unowned(metadata, user_id)
                return metadata if self._is_visible_to_user(metadata, user_id) else None
            return None
        for attempt in range(2):
            try:
                data = self._execute(
                    self._client.table("submissions_metadata")
                    .select("metadata")
                    .eq("submission_id", submission_id)
                    .maybe_single()
                )
                if data:
                    metadata = data.get("metadata")
                    metadata = self._claim_submission_if_unowned(metadata, user_id)
                    return metadata if self._is_visible_to_user(metadata, user_id) else None
                return None
            except Exception as exc:
                logger.warning("supabase-db failed to fetch submission %s: %s", submission_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return None

    def delete_submission_metadata(self, submission_id: str, user_id: Optional[str] = None) -> None:
        if user_id and not self.get_submission_metadata(submission_id, user_id=user_id):
            return
        self._require_remote()
        if not self._client:
            self._http_delete("submissions_metadata", filters={"submission_id": submission_id})
            return
        try:
            self._client.table("submissions_metadata").delete().eq("submission_id", submission_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete submission %s: %s", submission_id, exc)

    def list_submissions_metadata(
        self,
        user_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select("submissions_metadata") or []
            return [
                self._claim_submission_if_unowned(meta, user_id)
                for meta in
                (row.get("metadata") for row in rows)
                if meta and self._is_visible_to_user(meta, user_id) and (meta.get("file_count") or 0) > 0
            ]
        for attempt in range(2):
            try:
                # Prefer a projected summary query so dashboard list/stats pages do not
                # download full extraction blobs. If the PostgREST projection syntax is
                # unsupported by the deployed Supabase version, fall back to metadata.
                summary_fields = (
                    "submission_id,"
                    "client_id,"
                    "updated_at,"
                    "m_submission_id:metadata->>submission_id,"
                    "name:metadata->>name,"
                    "title:metadata->>title,"
                    "status:metadata->>status,"
                    "workflow_status:metadata->>workflow_status,"
                    "uploaded_at:metadata->>uploaded_at,"
                    "created_at:metadata->>created_at,"
                    "confidence:metadata->>confidence,"
                    "folder_id:metadata->>folder_id,"
                    "m_client_id:metadata->>client_id,"
                    "client_name:metadata->>client_name,"
                    "owner_user_id:metadata->>owner_user_id,"
                    "file_count:metadata->>file_count,"
                    "template_type:metadata->>template_type,"
                    "last_input:metadata->inputs->-1"
                )
                try:
                    rows = self._execute(
                        self._client.table("submissions_metadata")
                        .select(summary_fields)
                        .order("updated_at", desc=True)
                    )
                    if not rows:
                        return []
                    result = []
                    for row in rows:
                        last_input = row.get("last_input") or {}
                        if isinstance(last_input, str):
                            try:
                                last_input = json.loads(last_input)
                            except Exception:
                                last_input = {}
                        meta = {
                            "submission_id": row.get("m_submission_id") or row.get("submission_id"),
                            "name": row.get("name"),
                            "title": row.get("title"),
                            "status": row.get("status"),
                            "workflow_status": row.get("workflow_status"),
                            "uploaded_at": row.get("uploaded_at") or row.get("updated_at"),
                            "created_at": row.get("created_at"),
                            "confidence": row.get("confidence"),
                            "folder_id": row.get("folder_id"),
                            "client_id": row.get("m_client_id") or row.get("client_id"),
                            "client_name": row.get("client_name"),
                            "owner_user_id": row.get("owner_user_id"),
                            "file_count": row.get("file_count"),
                            "template_type": row.get("template_type"),
                            "inputs": [last_input] if last_input else [],
                        }
                        if not self._is_visible_to_user(meta, user_id):
                            continue
                        try:
                            file_count = int(meta.get("file_count") or 0)
                        except (TypeError, ValueError):
                            file_count = 0
                        if file_count <= 0 and last_input:
                            file_count = 1
                        if file_count <= 0:
                            continue
                        meta["file_count"] = file_count
                        result.append(meta)
                    return result
                except Exception as projected_exc:
                    logger.warning(
                        "supabase-db projected submission list failed; falling back to metadata: %s",
                        projected_exc,
                    )
                    rows = self._execute(
                        self._client.table("submissions_metadata")
                        .select("metadata")
                        .order("updated_at", desc=True)
                    )
                    if not rows:
                        return []
                    return [
                        self._claim_submission_if_unowned(meta, user_id)
                        for meta in
                        (row.get("metadata") for row in rows)
                        if meta and self._is_visible_to_user(meta, user_id) and (meta.get("file_count") or 0) > 0
                    ]
            except Exception as exc:
                logger.warning("supabase-db failed to list submissions: %s", exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return []

    # -------------------------------------------------------------------- clients
    def save_client_metadata(self, metadata: Dict[str, Any], user_id: Optional[str] = None) -> None:
        client_id = metadata.get("client_id")
        if not client_id:
            return
        metadata = self._stamp_owner(metadata, user_id)
        self._require_remote()
        payload = {
            "client_id": client_id,
            "name": metadata.get("name"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        if not self._client:
            self._http_upsert("clients_metadata", payload, on_conflict="client_id")
            return
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

    def get_client_metadata(self, client_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select(
                "clients_metadata",
                filters={"client_id": client_id},
                maybe_single=True,
            )
            if rows:
                metadata = rows[0].get("metadata")
                metadata = self._claim_client_if_unowned(metadata, user_id)
                return metadata if self._is_visible_to_user(metadata, user_id) else None
            return None
        for attempt in range(2):
            try:
                data = self._execute(
                    self._client.table("clients_metadata")
                    .select("metadata")
                    .eq("client_id", client_id)
                    .single()
                )
                if data:
                    metadata = data.get("metadata")
                    metadata = self._claim_client_if_unowned(metadata, user_id)
                    return metadata if self._is_visible_to_user(metadata, user_id) else None
                return None
            except Exception as exc:
                logger.warning("supabase-db failed to fetch client %s: %s", client_id, exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return None

    def list_clients_metadata(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select("clients_metadata", order="name.asc") or []
            return [
                self._claim_client_if_unowned(metadata, user_id)
                for metadata in
                (row.get("metadata") for row in rows)
                if self._is_visible_to_user(metadata, user_id)
            ]
        for attempt in range(2):
            try:
                rows = self._execute(
                    self._client.table("clients_metadata")
                    .select("metadata")
                    .order("name")
                )
                if not rows:
                    return []
                return [
                    self._claim_client_if_unowned(metadata, user_id)
                    for metadata in
                    (row.get("metadata") for row in rows)
                    if self._is_visible_to_user(metadata, user_id)
                ]
            except Exception as exc:
                logger.warning("supabase-db failed to list clients: %s", exc)
                if attempt == 0 and self._should_retry(exc) and self._reset_client():
                    continue
                break
        return []

    def delete_client_metadata(self, client_id: str, user_id: Optional[str] = None) -> None:
        if user_id and not self.get_client_metadata(client_id, user_id=user_id):
            return
        self._require_remote()
        if not self._client:
            self._http_delete("clients_metadata", filters={"client_id": client_id})
            return
        try:
            self._client.table("clients_metadata").delete().eq("client_id", client_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete client %s: %s", client_id, exc)

    # -------------------------------------------------------------------- folders
    def save_folder_metadata(self, metadata: Dict[str, Any], user_id: Optional[str] = None) -> None:
        folder_id = metadata.get("folder_id")
        if not folder_id:
            return
        metadata = self._stamp_owner(metadata, user_id)
        self._require_remote()
        payload = {
            "folder_id": folder_id,
            "name": metadata.get("name"),
            "metadata": metadata,
            "updated_at": metadata.get("updated_at") or datetime.utcnow().isoformat(),
        }
        if not self._client:
            self._http_upsert("folders_metadata", payload, on_conflict="folder_id")
            return
        try:
            self._client.table("folders_metadata").upsert(
                payload,
                on_conflict="folder_id",
            ).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to save folder %s: %s", folder_id, exc)

    def get_folder_metadata(self, folder_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select(
                "folders_metadata",
                filters={"folder_id": folder_id},
                maybe_single=True,
            )
            if rows:
                metadata = rows[0].get("metadata")
                metadata = self._claim_folder_if_unowned(metadata, user_id)
                return metadata if self._is_visible_to_user(metadata, user_id) else None
            return None
        try:
            data = self._execute(
                self._client.table("folders_metadata")
                .select("metadata")
                .eq("folder_id", folder_id)
                .single()
            )
            if data:
                metadata = data.get("metadata")
                metadata = self._claim_folder_if_unowned(metadata, user_id)
                return metadata if self._is_visible_to_user(metadata, user_id) else None
        except Exception as exc:
            logger.warning("supabase-db failed to fetch folder %s: %s", folder_id, exc)
        return None

    def list_folders_metadata(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        self._require_remote()
        if not self._client:
            rows = self._http_select("folders_metadata", order="updated_at.desc") or []
            return [
                self._claim_folder_if_unowned(metadata, user_id)
                for metadata in
                (row.get("metadata") for row in rows)
                if self._is_visible_to_user(metadata, user_id)
            ]
        try:
            rows = self._execute(
                self._client.table("folders_metadata")
                .select("metadata")
                .order("updated_at", desc=True)
            )
            if not rows:
                return []
            return [
                self._claim_folder_if_unowned(metadata, user_id)
                for metadata in
                (row.get("metadata") for row in rows)
                if self._is_visible_to_user(metadata, user_id)
            ]
        except Exception as exc:
            logger.warning("supabase-db failed to list folders: %s", exc)
            return []

    def delete_folder_metadata(self, folder_id: str, user_id: Optional[str] = None) -> None:
        if user_id and not self.get_folder_metadata(folder_id, user_id=user_id):
            return
        self._require_remote()
        if not self._client:
            self._http_delete("folders_metadata", filters={"folder_id": folder_id})
            return
        try:
            self._client.table("folders_metadata").delete().eq("folder_id", folder_id).execute()
        except Exception as exc:
            logger.warning("supabase-db failed to delete folder %s: %s", folder_id, exc)
