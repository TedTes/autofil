"""CRUD and delivery service for third-party integrations."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from services.integration_payload_service import IntegrationPayloadService
from services.supabase_db_service import SupabaseDatabaseService


class IntegrationService:
    DESTINATIONS_TABLE = "integration_destinations"
    JOBS_TABLE = "integration_jobs"

    def __init__(
        self,
        db: Optional[SupabaseDatabaseService] = None,
        current_user_id: Optional[str] = None,
    ) -> None:
        self.db = db or SupabaseDatabaseService()
        self.current_user_id = current_user_id

    def list_destinations(self, client_id: Optional[str] = None) -> List[Dict[str, Any]]:
        filters: Dict[str, str] = {}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        if client_id:
            filters["client_id"] = client_id
        return self.db.select_rows(
            self.DESTINATIONS_TABLE,
            filters=filters,
            order="created_at.desc",
        )

    def get_destination(self, destination_id: str) -> Optional[Dict[str, Any]]:
        filters = {"id": destination_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.select_rows(self.DESTINATIONS_TABLE, filters=filters, limit=1)
        return rows[0] if rows else None

    def create_destination(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        destination = self._normalize_destination_payload(payload)
        destination.update(
            {
                "owner_user_id": self.current_user_id,
                "created_at": now,
                "updated_at": now,
            }
        )
        created = self.db.insert_row(self.DESTINATIONS_TABLE, destination)
        if not created:
            raise RuntimeError("Failed to create integration destination")
        return created

    def update_destination(self, destination_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        updates = self._normalize_destination_payload(payload, partial=True)
        updates["updated_at"] = datetime.utcnow().isoformat()
        filters = {"id": destination_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.update_rows(self.DESTINATIONS_TABLE, updates, filters=filters)
        return rows[0] if rows else None

    def delete_destination(self, destination_id: str) -> bool:
        updates = {
            "enabled": False,
            "updated_at": datetime.utcnow().isoformat(),
        }
        filters = {"id": destination_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.update_rows(self.DESTINATIONS_TABLE, updates, filters=filters)
        return bool(rows)

    def list_jobs(self, submission_id: str) -> List[Dict[str, Any]]:
        filters = {"submission_id": submission_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        return self.db.select_rows(
            self.JOBS_TABLE,
            filters=filters,
            order="created_at.desc",
        )

    def send_submission(
        self,
        submission_id: str,
        destination_id: str,
        *,
        payload_service: Optional[IntegrationPayloadService] = None,
    ) -> Dict[str, Any]:
        destination = self.get_destination(destination_id)
        if not destination:
            raise ValueError("Integration destination not found")
        if not destination.get("enabled", True):
            raise ValueError("Integration destination is disabled")
        if destination.get("type") != "webhook":
            raise ValueError("Only webhook destinations are supported")

        payload_builder = payload_service or IntegrationPayloadService()
        request_payload = payload_builder.build_payload(submission_id)
        idempotency_key = f"{submission_id}:{destination_id}:{uuid.uuid4()}"

        job = self._create_job(
            submission_id=submission_id,
            destination=destination,
            idempotency_key=idempotency_key,
            request_payload=request_payload,
        )
        if not job:
            raise RuntimeError("Failed to create integration job")

        try:
            response = self._post_webhook(destination, request_payload, idempotency_key)
            response_body = self._response_body(response)
            status = "succeeded" if 200 <= response.status_code < 300 else "failed"
            error_message = None if status == "succeeded" else response.text[:500]
            return self._update_job(
                job["id"],
                {
                    "status": status,
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "response_status": response.status_code,
                    "response_body": response_body,
                    "error_message": error_message,
                    "sent_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
        except Exception as exc:
            return self._update_job(
                job["id"],
                {
                    "status": "failed",
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "error_message": str(exc)[:500],
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )

    def _normalize_destination_payload(
        self,
        payload: Dict[str, Any],
        *,
        partial: bool = False,
    ) -> Dict[str, Any]:
        allowed = {
            "client_id",
            "name",
            "type",
            "url",
            "auth_type",
            "secret_ref",
            "config",
            "enabled",
        }
        normalized = {key: payload[key] for key in allowed if key in payload}

        if not partial:
            for key in ("client_id", "name", "url"):
                if not str(normalized.get(key) or "").strip():
                    raise ValueError(f"{key} is required")

        if "name" in normalized:
            normalized["name"] = str(normalized["name"]).strip()
        if "client_id" in normalized:
            normalized["client_id"] = str(normalized["client_id"]).strip()
        if "type" in normalized:
            normalized["type"] = str(normalized["type"] or "webhook").strip().lower()
        elif not partial:
            normalized["type"] = "webhook"
        if "auth_type" in normalized:
            normalized["auth_type"] = str(normalized["auth_type"] or "none").strip().lower()
        elif not partial:
            normalized["auth_type"] = "none"
        if "enabled" in normalized:
            normalized["enabled"] = bool(normalized["enabled"])
        elif not partial:
            normalized["enabled"] = True
        if "config" in normalized and not isinstance(normalized["config"], dict):
            raise ValueError("config must be an object")
        elif not partial and "config" not in normalized:
            normalized["config"] = {}

        if normalized.get("type") not in {None, "webhook"}:
            raise ValueError("Only webhook destinations are supported")
        if normalized.get("auth_type") not in {None, "none", "bearer", "hmac"}:
            raise ValueError("auth_type must be one of none, bearer, hmac")
        if "url" in normalized:
            normalized["url"] = self._validate_url(str(normalized["url"]).strip())

        return normalized

    def _validate_url(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("url must be a valid http or https URL")
        return url

    def _create_job(
        self,
        *,
        submission_id: str,
        destination: Dict[str, Any],
        idempotency_key: str,
        request_payload: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        now = datetime.utcnow().isoformat()
        return self.db.insert_row(
            self.JOBS_TABLE,
            {
                "owner_user_id": self.current_user_id,
                "submission_id": submission_id,
                "destination_id": destination.get("id"),
                "destination_name": destination.get("name"),
                "destination_type": destination.get("type") or "webhook",
                "status": "running",
                "attempt_count": 0,
                "idempotency_key": idempotency_key,
                "request_payload": request_payload,
                "created_at": now,
                "updated_at": now,
            },
        )

    def _update_job(self, job_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        filters = {"id": job_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.update_rows(self.JOBS_TABLE, payload, filters=filters)
        if not rows:
            raise RuntimeError("Failed to update integration job")
        return rows[0]

    def _post_webhook(
        self,
        destination: Dict[str, Any],
        payload: Dict[str, Any],
        idempotency_key: str,
    ) -> requests.Response:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        headers = {
            "Content-Type": "application/json",
            "X-Autofil-Idempotency-Key": idempotency_key,
        }
        secret = self._destination_secret(destination)
        auth_type = destination.get("auth_type") or "none"
        if auth_type == "bearer" and secret:
            headers["Authorization"] = f"Bearer {secret}"
        elif auth_type == "hmac" and secret:
            signature = hmac.new(
                secret.encode("utf-8"),
                body.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Autofil-Signature"] = f"sha256={signature}"

        timeout = int((destination.get("config") or {}).get("timeout_seconds") or 20)
        return requests.post(
            destination["url"],
            data=body,
            headers=headers,
            timeout=max(1, min(timeout, 60)),
        )

    def _destination_secret(self, destination: Dict[str, Any]) -> Optional[str]:
        secret_ref = destination.get("secret_ref")
        if not secret_ref:
            return None
        return os.getenv(str(secret_ref))

    def _response_body(self, response: requests.Response) -> Dict[str, Any]:
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                return parsed
            return {"data": parsed}
        except Exception:
            return {"text": response.text[:1000]}
