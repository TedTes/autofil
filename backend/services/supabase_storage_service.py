"""
Supabase storage integration helpers.

Provides a thin wrapper around the supabase-py client so the rest of the
codebase can upload/download files without needing to know the SDK details.
"""

from __future__ import annotations

import logging
import mimetypes
import os
from typing import Dict, Optional
from urllib.parse import quote

import requests

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - handled gracefully at runtime
    Client = None  # type: ignore
    create_client = None  # type: ignore

logger = logging.getLogger(__name__)


class SupabaseStorageService:
    """
    Lazy supabase client that exposes upload/download helpers.

    The service is considered enabled only when all required environment
    variables are present and the SDK is available.
    """

    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        self.bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "submissions")
        self.prefix = os.getenv("SUPABASE_STORAGE_PREFIX", "").strip("/")

        self._client: Optional[Client] = None
        self.enabled = bool(self.url and self.key)

        if self.enabled and Client and create_client:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover - network init path
                logger.warning("supabase storage failed to initialize client: %s", exc)
                self._client = None

    def build_path(self, *parts: Optional[str]) -> str:
        """Build a storage path honoring the optional prefix."""
        segments = [segment.strip("/") for segment in parts if segment]
        path = "/".join(segments)
        if self.prefix:
            return f"{self.prefix}/{path}" if path else self.prefix
        return path

    # ------------------------------------------------------------------ uploads
    def upload_file(
        self,
        *,
        local_path: str,
        storage_path: str,
        content_type: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        """Upload a local file into the configured bucket."""
        if not self.enabled or not self._client:
            return None

        bucket = self._client.storage.from_(self.bucket)
        content_type = content_type or mimetypes.guess_type(local_path)[0] or "application/octet-stream"
        try:
            with open(local_path, "rb") as handle:
                data = handle.read()
            response = bucket.upload(
                storage_path,
                data,
                {"cache-control": "3600", "content-type": content_type, "x-upsert": "true"},
            )
            if isinstance(response, dict) and response.get("error"):
                raise RuntimeError(response["error"])

            public_url = bucket.get_public_url(storage_path)
            if isinstance(public_url, dict):
                public_url = (public_url.get("data") or {}).get("publicUrl")

            return {
                "provider": "supabase",
                "bucket": self.bucket,
                "path": storage_path,
                "public_url": public_url,
                "content_type": content_type,
            }
        except Exception as exc:
            logger.warning("supabase upload failed for %s: %s", storage_path, exc)
            return None

    # ------------------------------------------------------------- downloads
    def download_file(self, storage_path: str) -> Optional[bytes]:
        """Download bytes from storage."""
        if not self.enabled:
            return None
        if self._client:
            return self._download_file_sdk(storage_path)
        return self._download_file_http(storage_path)

    def _download_file_sdk(self, storage_path: str) -> Optional[bytes]:
        try:
            bucket = self._client.storage.from_(self.bucket)
            result = bucket.download(storage_path)
            # supabase-py returns bytes for successful downloads
            if isinstance(result, dict):
                error = result.get("error")
                if error:
                    raise RuntimeError(error)
                data = result.get("data")
                if isinstance(data, dict):
                    return data.get("bytes")
                return data  # type: ignore[return-value]
            return result
        except Exception as exc:
            logger.warning("supabase download failed for %s: %s", storage_path, exc)
            return None

    def _download_file_http(self, storage_path: str) -> Optional[bytes]:
        try:
            encoded_path = quote(storage_path.lstrip("/"), safe="/")
            response = requests.get(
                f"{self.url}/storage/v1/object/{self.bucket}/{encoded_path}",
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                },
                timeout=20,
            )
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code}")
            return response.content
        except Exception as exc:
            logger.warning("supabase http download failed for %s: %s", storage_path, exc)
            return None

    def download_text(self, storage_path: str, encoding: str = "utf-8") -> Optional[str]:
        """Download a text file and decode it."""
        data = self.download_file(storage_path)
        if data is None:
            return None
        try:
            return data.decode(encoding)
        except Exception as exc:
            logger.warning("supabase failed to decode %s: %s", storage_path, exc)
            return None

    # --------------------------------------------------------------- deletion
    def delete_file(self, storage_path: str) -> None:
        """Remove a file from storage (best-effort)."""
        if not self.enabled or not self._client:
            return
        try:
            bucket = self._client.storage.from_(self.bucket)
            bucket.remove([storage_path])
        except Exception as exc:
            logger.warning("supabase delete failed for %s: %s", storage_path, exc)

    # ------------------------------------------------------------- signed URLs
    def create_signed_url(self, storage_path: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a temporary, signed download URL."""
        if not self.enabled:
            return None
        if self._client:
            return self._create_signed_url_sdk(storage_path, expires_in)
        return self._create_signed_url_http(storage_path, expires_in)

    def _create_signed_url_sdk(self, storage_path: str, expires_in: int = 3600) -> Optional[str]:
        try:
            bucket = self._client.storage.from_(self.bucket)
            response = bucket.create_signed_url(storage_path, expires_in)
            if isinstance(response, dict):
                error = response.get("error")
                if error:
                    raise RuntimeError(error)
                data = response.get("data") or {}
                return data.get("signedUrl")
            return response
        except Exception as exc:
            logger.warning("supabase signed URL failed for %s: %s", storage_path, exc)
            return None

    def _create_signed_url_http(self, storage_path: str, expires_in: int = 3600) -> Optional[str]:
        try:
            encoded_path = quote(storage_path.lstrip("/"), safe="/")
            response = requests.post(
                f"{self.url}/storage/v1/object/sign/{self.bucket}/{encoded_path}",
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": expires_in},
                timeout=20,
            )
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code}")
            payload = response.json()
            signed_path = payload.get("signedURL")
            if not signed_path:
                return None
            return f"{self.url}/storage/v1{signed_path}"
        except Exception as exc:
            logger.warning("supabase http signed URL failed for %s: %s", storage_path, exc)
            return None

    def get_public_url(self, storage_path: str) -> Optional[str]:
        """Return the public URL for a storage path if available."""
        if not self.enabled:
            return None
        if self._client:
            return self._get_public_url_sdk(storage_path)
        return f"{self.url}/storage/v1/object/public/{self.bucket}/{quote(storage_path.lstrip('/'), safe='/')}"

    def _get_public_url_sdk(self, storage_path: str) -> Optional[str]:
        try:
            bucket = self._client.storage.from_(self.bucket)
            response = bucket.get_public_url(storage_path)
            if isinstance(response, dict):
                data = response.get("data") or {}
                return data.get("publicUrl")
            return response
        except Exception as exc:
            logger.warning("supabase public URL failed for %s: %s", storage_path, exc)
            return None

    # --------------------------------------------------------------- listing
    def list_objects(self, *parts: Optional[str], **options) -> list:
        """List objects within a path."""
        if not self.enabled:
            return []
        path = self.build_path(*parts)
        opts = {"limit": 1000, "offset": 0}
        opts.update(options)
        if self._client:
            return self._list_objects_sdk(path, opts)
        return self._list_objects_http(path, opts)

    def _list_objects_sdk(self, path: str, opts: dict) -> list:
        try:
            bucket = self._client.storage.from_(self.bucket)
            response = bucket.list(path, opts)
            if isinstance(response, dict) and response.get("error"):
                raise RuntimeError(response["error"])
            return response or []
        except Exception as exc:
            logger.warning("supabase list failed for %s: %s", path, exc)
            return []

    def _list_objects_http(self, path: str, opts: dict) -> list:
        try:
            response = requests.post(
                f"{self.url}/storage/v1/object/list/{self.bucket}",
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                },
                json={
                    "prefix": path,
                    "limit": opts.get("limit", 1000),
                    "offset": opts.get("offset", 0),
                    "sortBy": {"column": "name", "order": "asc"},
                },
                timeout=20,
            )
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code}")
            return response.json() or []
        except Exception as exc:
            logger.warning("supabase http list failed for %s: %s", path, exc)
            return []
