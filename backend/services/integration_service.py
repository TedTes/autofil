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

from integrations.adapters import get_adapter
from integrations.providers import get_provider, list_providers
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

    def list_providers(self) -> List[Dict[str, Any]]:
        return list_providers()

    def get_provider(self, provider_id: str) -> Optional[Dict[str, Any]]:
        return get_provider(provider_id)

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

    def test_connection(self, connection_id: str) -> Dict[str, Any]:
        connection = self.get_destination(connection_id)
        if not connection:
            raise ValueError("Integration connection not found")
        if not connection.get("enabled", True):
            raise ValueError("Integration connection is disabled")

        provider_id = connection.get("provider") or connection.get("type") or "webhook"
        adapter = get_adapter(str(provider_id))
        config = self._connection_test_config(connection)
        result = adapter.validate_connection(config)

        ok = bool(result.get("ok"))
        status = "valid" if ok else "invalid"
        message = str(result.get("message") or "")
        updates = {
            "connection_status": status,
            "last_tested_at": datetime.utcnow().isoformat(),
            "last_error": None if ok else message[:500],
            "updated_at": datetime.utcnow().isoformat(),
        }
        updated = self._update_destination(connection_id, updates)
        return {
            "ok": ok,
            "status": status,
            "message": message,
            "provider": provider_id,
            "connection": updated,
        }

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
            "provider",
            "url",
            "auth_type",
            "secret_ref",
            "config",
            "auth_config",
            "capabilities",
            "connection_status",
            "last_tested_at",
            "last_error",
            "enabled",
        }
        normalized = {key: payload[key] for key in allowed if key in payload}

        if not partial:
            for key in ("client_id", "name"):
                if not str(normalized.get(key) or "").strip():
                    raise ValueError(f"{key} is required")

        if "name" in normalized:
            normalized["name"] = str(normalized["name"]).strip()
        if "client_id" in normalized:
            normalized["client_id"] = str(normalized["client_id"]).strip()
        if "provider" in normalized:
            normalized["provider"] = str(normalized["provider"] or "webhook").strip().lower()
        elif not partial:
            normalized["provider"] = "webhook"

        provider_id = str(normalized.get("provider") or "webhook").strip().lower()
        provider = get_provider(provider_id)
        if provider_id and provider_id != "webhook" and not provider:
            raise ValueError("provider is not supported")

        if "type" in normalized:
            normalized["type"] = str(normalized["type"] or "webhook").strip().lower()
        elif not partial:
            normalized["type"] = "webhook" if provider_id == "webhook" else "ams"
        if "auth_type" in normalized:
            normalized["auth_type"] = str(normalized["auth_type"] or "none").strip().lower()
        elif not partial:
            normalized["auth_type"] = (
                "none"
                if provider_id == "webhook"
                else str((provider or {}).get("authType") or "none").lower()
            )
        if "enabled" in normalized:
            normalized["enabled"] = bool(normalized["enabled"])
        elif not partial:
            normalized["enabled"] = True
        if "config" in normalized and not isinstance(normalized["config"], dict):
            raise ValueError("config must be an object")
        elif not partial and "config" not in normalized:
            normalized["config"] = {}
        if "auth_config" in normalized and not isinstance(normalized["auth_config"], dict):
            raise ValueError("auth_config must be an object")
        elif not partial and "auth_config" not in normalized:
            normalized["auth_config"] = {}
        if "capabilities" in normalized and not isinstance(normalized["capabilities"], dict):
            raise ValueError("capabilities must be an object")
        elif not partial and "capabilities" not in normalized:
            normalized["capabilities"] = dict((provider or {}).get("capabilities") or {})
        if "connection_status" in normalized:
            normalized["connection_status"] = str(
                normalized["connection_status"] or "not_configured"
            ).strip().lower()
        elif not partial:
            normalized["connection_status"] = "configured" if provider_id == "webhook" else "not_configured"

        if normalized.get("type") not in {None, "webhook", "ams"}:
            raise ValueError("type must be one of webhook, ams")
        if normalized.get("auth_type") not in {
            None,
            "none",
            "bearer",
            "hmac",
            "webhook",
            "api_credentials",
            "sdk_credentials",
            "wsapi",
            "partner_api",
            "api_partner",
        }:
            raise ValueError("auth_type is not supported")
        if normalized.get("connection_status") not in {
            None,
            "not_configured",
            "configured",
            "valid",
            "invalid",
        }:
            raise ValueError("connection_status is not supported")
        if normalized.get("type") == "webhook" and not partial:
            if not str(normalized.get("url") or "").strip():
                raise ValueError("url is required for webhook destinations")
        if normalized.get("type") == "ams" and provider_id == "webhook":
            raise ValueError("AMS destinations require a non-webhook provider")
        if "url" in normalized:
            url = str(normalized["url"] or "").strip()
            normalized["url"] = self._validate_url(url) if url else None

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
                "provider": destination.get("provider") or destination.get("type") or "webhook",
                "status": "running",
                "attempt_count": 0,
                "idempotency_key": idempotency_key,
                "target": {},
                "actions": ["submit_structured_data"],
                "request_payload": request_payload,
                "action_results": [],
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

    def _update_destination(self, destination_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        filters = {"id": destination_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.update_rows(self.DESTINATIONS_TABLE, payload, filters=filters)
        if not rows:
            raise RuntimeError("Failed to update integration connection")
        return rows[0]

    def _connection_test_config(self, connection: Dict[str, Any]) -> Dict[str, Any]:
        config = {}
        if isinstance(connection.get("config"), dict):
            config.update(connection["config"])
        if isinstance(connection.get("auth_config"), dict):
            config.update(connection["auth_config"])
        if connection.get("url"):
            config["url"] = connection.get("url")
        if connection.get("secret_ref"):
            config["secret_ref"] = connection.get("secret_ref")
        return config

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
