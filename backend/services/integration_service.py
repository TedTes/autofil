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
    ACTION_LABELS = {
        "attach_documents": "Attach documents",
        "create_activity": "Create activity",
        "submit_structured_data": "Submit structured data",
    }
    ACTION_CAPABILITIES = {
        "attach_documents": "supportsDocumentAttach",
        "create_activity": "supportsActivities",
        "submit_structured_data": "supportsStructuredDataSubmit",
    }

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

    def search_clients(
        self,
        connection_id: str,
        query: str,
        *,
        limit: int = 10,
    ) -> Dict[str, Any]:
        connection = self.get_destination(connection_id)
        if not connection:
            raise ValueError("Integration connection not found")
        if not connection.get("enabled", True):
            raise ValueError("Integration connection is disabled")

        cleaned_query = str(query or "").strip()
        if len(cleaned_query) < 2:
            raise ValueError("query must be at least 2 characters")
        safe_limit = max(1, min(int(limit or 10), 25))

        provider_id = str(connection.get("provider") or connection.get("type") or "webhook")
        provider = get_provider(provider_id) or {}
        capabilities = self._connection_capabilities(connection, provider)
        if not self._capability_enabled(capabilities.get("supportsClientSearch")):
            return {
                "ok": False,
                "provider": provider_id,
                "query": cleaned_query,
                "results": [],
                "message": f"{provider_id} does not support client search",
            }
        adapter = get_adapter(provider_id)
        config = self._connection_test_config(connection)
        try:
            results = adapter.search_clients(
                cleaned_query,
                config=config,
                limit=safe_limit,
            )
        except NotImplementedError as exc:
            return {
                "ok": False,
                "provider": provider_id,
                "query": cleaned_query,
                "results": [],
                "message": str(exc),
            }

        return {
            "ok": True,
            "provider": provider_id,
            "query": cleaned_query,
            "results": [self._normalize_client_result(result) for result in results],
            "message": None,
        }

    def preview_send(
        self,
        submission_id: str,
        connection_id: str,
        *,
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
        payload_service: Optional[IntegrationPayloadService] = None,
    ) -> Dict[str, Any]:
        connection = self.get_destination(connection_id)
        if not connection:
            raise ValueError("Integration connection not found")
        if not connection.get("enabled", True):
            raise ValueError("Integration connection is disabled")

        payload_builder = payload_service or IntegrationPayloadService()
        request_payload = payload_builder.build_payload(submission_id)
        provider_id = str(connection.get("provider") or connection.get("type") or "webhook")
        provider = get_provider(provider_id) or {}
        capabilities = self._connection_capabilities(connection, provider)
        requested_actions = self._preview_actions(actions, capabilities)
        warnings = self._preview_warnings(
            capabilities=capabilities,
            target=target or {},
            action_previews=requested_actions,
            request_payload=request_payload,
        )

        return {
            "ok": not any(action["blocking"] for action in requested_actions),
            "provider": provider_id,
            "connection_id": connection_id,
            "submission_id": submission_id,
            "target": target or {},
            "actions": requested_actions,
            "warnings": warnings,
            "requires_target_client": bool(capabilities.get("requiresTargetClient")),
            "payload_summary": self._payload_summary(request_payload),
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

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        filters = {"id": job_id}
        if self.current_user_id:
            filters["owner_user_id"] = self.current_user_id
        rows = self.db.select_rows(self.JOBS_TABLE, filters=filters, limit=1)
        return rows[0] if rows else None

    def send(
        self,
        submission_id: str,
        connection_id: str,
        *,
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
        payload_service: Optional[IntegrationPayloadService] = None,
    ) -> Dict[str, Any]:
        connection = self.get_destination(connection_id)
        if not connection:
            raise ValueError("Integration connection not found")
        if not connection.get("enabled", True):
            raise ValueError("Integration connection is disabled")

        provider_id = str(connection.get("provider") or connection.get("type") or "webhook")
        provider = get_provider(provider_id) or {}
        capabilities = self._connection_capabilities(connection, provider)
        action_previews = self._preview_actions(actions, capabilities)
        blocking_actions = [action["label"] for action in action_previews if action["blocking"]]
        if blocking_actions:
            raise ValueError(f"Unsupported actions: {', '.join(blocking_actions)}")
        if capabilities.get("requiresTargetClient") and not self._target_client_id(target or {}):
            raise ValueError("Target client is required for this provider")

        payload_builder = payload_service or IntegrationPayloadService()
        request_payload = payload_builder.build_payload(submission_id)
        requested_actions = [action["action"] for action in action_previews]
        idempotency_key = f"{submission_id}:{connection_id}:{uuid.uuid4()}"
        job = self._create_job(
            submission_id=submission_id,
            destination=connection,
            idempotency_key=idempotency_key,
            request_payload=request_payload,
            target=target or {},
            actions=requested_actions,
        )
        if not job:
            raise RuntimeError("Failed to create integration job")

        return self._send_adapter_job(
            job,
            connection,
            request_payload,
            target=target or {},
            actions=requested_actions,
            idempotency_key=idempotency_key,
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
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
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
                "target": target or {},
                "actions": actions or ["submit_structured_data"],
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
        if connection.get("auth_type"):
            config["auth_type"] = connection.get("auth_type")
        return config

    def _normalize_client_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        external_id = result.get("id") or result.get("client_id") or result.get("external_id")
        name = result.get("name") or result.get("display") or result.get("insured_name")
        return {
            "id": str(external_id or ""),
            "name": str(name or external_id or ""),
            "display": str(result.get("display") or name or external_id or ""),
            "metadata": result.get("metadata") if isinstance(result.get("metadata"), dict) else {},
        }

    def _connection_capabilities(
        self,
        connection: Dict[str, Any],
        provider: Dict[str, Any],
    ) -> Dict[str, Any]:
        capabilities = dict(provider.get("capabilities") or {})
        if isinstance(connection.get("capabilities"), dict):
            capabilities.update(connection["capabilities"])
        return capabilities

    def _preview_actions(
        self,
        actions: Optional[List[str]],
        capabilities: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        normalized_actions = [str(action).strip() for action in actions or [] if str(action).strip()]
        if not normalized_actions:
            normalized_actions = [
                action
                for action, capability in self.ACTION_CAPABILITIES.items()
                if self._capability_enabled(capabilities.get(capability))
            ]
        if not normalized_actions:
            normalized_actions = ["submit_structured_data"]

        previews = []
        seen = set()
        for action in normalized_actions:
            if action in seen:
                continue
            seen.add(action)
            capability = self.ACTION_CAPABILITIES.get(action)
            supported = bool(capability and self._capability_enabled(capabilities.get(capability)))
            previews.append(
                {
                    "action": action,
                    "label": self.ACTION_LABELS.get(action, action.replace("_", " ").title()),
                    "supported": supported,
                    "blocking": not supported,
                    "capability": capability,
                }
            )
        return previews

    def _preview_warnings(
        self,
        *,
        capabilities: Dict[str, Any],
        target: Dict[str, Any],
        action_previews: List[Dict[str, Any]],
        request_payload: Dict[str, Any],
    ) -> List[str]:
        warnings = []
        target_client_id = target.get("clientId") or target.get("client_id")
        if capabilities.get("requiresTargetClient") and not target_client_id:
            warnings.append("This provider requires a selected target client before sending.")
        unsupported = [action["label"] for action in action_previews if not action["supported"]]
        if unsupported:
            warnings.append(f"Unsupported actions: {', '.join(unsupported)}.")
        if not (request_payload.get("review_status") or {}).get("reviewed"):
            warnings.append("Submission has not been marked reviewed.")
        return warnings

    def _payload_summary(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        submission = payload.get("submission") if isinstance(payload.get("submission"), dict) else {}
        insured = payload.get("insured") if isinstance(payload.get("insured"), dict) else {}
        policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else {}
        confidence = payload.get("confidence") if isinstance(payload.get("confidence"), dict) else {}
        source_files = payload.get("source_files") if isinstance(payload.get("source_files"), list) else []
        review_status = (
            payload.get("review_status") if isinstance(payload.get("review_status"), dict) else {}
        )
        return {
            "submission_id": submission.get("submission_id"),
            "client_name": submission.get("client_name"),
            "insured_name": insured.get("name") or insured.get("named_insured"),
            "policy_number": policy.get("policy_number"),
            "source_file_count": len(source_files),
            "field_count": int(confidence.get("field_count") or 0),
            "reviewed": bool(review_status.get("reviewed")),
        }

    def _capability_enabled(self, value: Any) -> bool:
        return value is True or value == "limited"

    def _target_client_id(self, target: Dict[str, Any]) -> Optional[Any]:
        return target.get("clientId") or target.get("client_id")

    def _send_webhook_job(
        self,
        job: Dict[str, Any],
        destination: Dict[str, Any],
        request_payload: Dict[str, Any],
        idempotency_key: str,
    ) -> Dict[str, Any]:
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
                    "action_results": [
                        {
                            "action": "submit_structured_data",
                            "status": status,
                            "message": error_message,
                        }
                    ],
                    "error_message": error_message,
                    "sent_at": datetime.utcnow().isoformat() if status == "succeeded" else None,
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
        except Exception as exc:
            return self._update_job(
                job["id"],
                {
                    "status": "failed",
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "action_results": [
                        {
                            "action": "submit_structured_data",
                            "status": "failed",
                            "message": str(exc)[:500],
                        }
                    ],
                    "error_message": str(exc)[:500],
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )

    def _send_adapter_job(
        self,
        job: Dict[str, Any],
        connection: Dict[str, Any],
        request_payload: Dict[str, Any],
        *,
        target: Dict[str, Any],
        actions: List[str],
        idempotency_key: str,
    ) -> Dict[str, Any]:
        provider_id = str(connection.get("provider") or connection.get("type") or "webhook")
        adapter = get_adapter(provider_id)
        config = self._connection_test_config(connection)
        adapter_payload = self._adapter_payload(
            provider_id=provider_id,
            canonical_payload=request_payload,
            target=target,
            actions=actions,
        )
        try:
            result = adapter.send_submission(
                adapter_payload,
                config=config,
                target=target,
                actions=actions,
                idempotency_key=idempotency_key,
            )
            ok = bool(result.get("ok"))
            action_results = result.get("action_results")
            if not isinstance(action_results, list):
                action_results = [
                    {
                        "action": action,
                        "status": "succeeded" if ok else "failed",
                        "message": result.get("message"),
                    }
                    for action in actions
                ]
            status = str(result.get("status") or ("succeeded" if ok else "failed"))
            return self._update_job(
                job["id"],
                {
                    "status": status,
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "response_status": result.get("response_status"),
                    "response_body": result if isinstance(result, dict) else {},
                    "action_results": action_results,
                    "error_message": None if ok else str(result.get("message") or "")[:500],
                    "sent_at": datetime.utcnow().isoformat() if ok else None,
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
        except NotImplementedError as exc:
            return self._update_job(
                job["id"],
                {
                    "status": "failed",
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "action_results": [
                        {
                            "action": action,
                            "status": "failed",
                            "message": str(exc),
                        }
                        for action in actions
                    ],
                    "error_message": str(exc)[:500],
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
        except Exception as exc:
            return self._update_job(
                job["id"],
                {
                    "status": "failed",
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "action_results": [
                        {
                            "action": action,
                            "status": "failed",
                            "message": str(exc)[:500],
                        }
                        for action in actions
                    ],
                    "error_message": str(exc)[:500],
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )

    def _adapter_payload(
        self,
        *,
        provider_id: str,
        canonical_payload: Dict[str, Any],
        target: Dict[str, Any],
        actions: List[str],
    ) -> Dict[str, Any]:
        if provider_id == "webhook":
            return canonical_payload
        return {
            "schema_version": "autofil.ams_adapter_input.v1",
            "provider": provider_id,
            "target": target,
            "actions": actions,
            "canonical": canonical_payload,
            "mapped": self._map_canonical_for_ams(canonical_payload),
            "action_payloads": self._action_payloads(canonical_payload, actions),
        }

    def _map_canonical_for_ams(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        submission = payload.get("submission") if isinstance(payload.get("submission"), dict) else {}
        insured = payload.get("insured") if isinstance(payload.get("insured"), dict) else {}
        policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else {}
        coverages = payload.get("coverages") if isinstance(payload.get("coverages"), dict) else {}
        documents = self._documents_for_attachment(payload)
        confidence = payload.get("confidence") if isinstance(payload.get("confidence"), dict) else {}
        return {
            "client": {
                "name": insured.get("name") or insured.get("named_insured") or submission.get("client_name"),
                "source_client_id": submission.get("client_id"),
            },
            "policy": {
                "policy_number": policy.get("policy_number"),
                "effective_date": policy.get("effective_date"),
                "expiration_date": policy.get("expiration_date"),
                "line_of_business": policy.get("line_of_business"),
            },
            "coverages": coverages,
            "documents": documents,
            "quality": {
                "field_count": int(confidence.get("field_count") or 0),
                "overall_confidence": confidence.get("overall"),
            },
        }

    def _action_payloads(self, payload: Dict[str, Any], actions: List[str]) -> Dict[str, Any]:
        action_payloads: Dict[str, Any] = {}
        if "attach_documents" in actions:
            action_payloads["attach_documents"] = {
                "documents": self._documents_for_attachment(payload),
            }
        if "create_activity" in actions:
            action_payloads["create_activity"] = self._activity_payload(payload)
        return action_payloads

    def _activity_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        submission = payload.get("submission") if isinstance(payload.get("submission"), dict) else {}
        insured = payload.get("insured") if isinstance(payload.get("insured"), dict) else {}
        policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else {}
        confidence = payload.get("confidence") if isinstance(payload.get("confidence"), dict) else {}
        insured_name = insured.get("name") or insured.get("named_insured") or submission.get("client_name")
        policy_number = policy.get("policy_number") or policy.get("gl_policy_number")
        note_parts = [
            "AutoFil submission prepared for AMS sync.",
            f"Submission: {submission.get('name') or submission.get('submission_id') or 'Unknown'}",
        ]
        if insured_name:
            note_parts.append(f"Insured: {insured_name}")
        if policy_number:
            note_parts.append(f"Policy: {policy_number}")
        field_count = confidence.get("field_count")
        if field_count is not None:
            note_parts.append(f"Mapped fields: {field_count}")
        return {
            "subject": f"AutoFil submission: {insured_name or 'Reviewed submission'}",
            "body": "\n".join(note_parts),
            "category": "autofil_submission",
            "source_submission_id": submission.get("submission_id"),
        }

    def _documents_for_attachment(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        source_files = payload.get("source_files") if isinstance(payload.get("source_files"), list) else []
        documents = []
        for source_file in source_files:
            if not isinstance(source_file, dict):
                continue
            storage = source_file.get("storage") if isinstance(source_file.get("storage"), dict) else {}
            documents.append(
                {
                    "input_id": source_file.get("input_id"),
                    "name": (
                        source_file.get("name")
                        or source_file.get("filename")
                        or source_file.get("file_name")
                    ),
                    "document_type": source_file.get("document_type") or source_file.get("type"),
                    "mime_type": source_file.get("mime_type") or source_file.get("content_type"),
                    "url": source_file.get("url") or source_file.get("signed_url"),
                    "storage_path": storage.get("path") or source_file.get("storage_path"),
                    "included_in_merge": source_file.get("included_in_merge", True),
                    "attachment_kind": "source_document",
                }
            )
        return documents

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
