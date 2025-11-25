"""
Supabase storage integration helpers.

Provides a thin wrapper around the supabase-py client so the rest of the
codebase can upload/download files without needing to know the SDK details.
"""

from __future__ import annotations

import mimetypes
import os
from typing import Dict, Optional

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - handled gracefully at runtime
    Client = None  # type: ignore
    create_client = None  # type: ignore


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
        self.enabled = bool(self.url and self.key and Client and create_client)

        if self.enabled:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover - network init path
                print(f"[supabase] Failed to initialize client: {exc}")
                self.enabled = False
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
            print(f"[supabase] Upload failed for {storage_path}: {exc}")
            return None

    # ------------------------------------------------------------- downloads
    def download_file(self, storage_path: str) -> Optional[bytes]:
        """Download bytes from storage."""
        if not self.enabled or not self._client:
            return None
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
            print(f"[supabase] Download failed for {storage_path}: {exc}")
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
            print(f"[supabase] Delete failed for {storage_path}: {exc}")

    # ------------------------------------------------------------- signed URLs
    def create_signed_url(self, storage_path: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a temporary, signed download URL."""
        if not self.enabled or not self._client:
            return None
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
            print(f"[supabase] Signed URL failed for {storage_path}: {exc}")
            return None
