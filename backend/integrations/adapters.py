"""Adapter contracts for AMS and third-party integration providers."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from integrations.providers import get_provider


class IntegrationAdapter(ABC):
    """Provider-specific integration behavior behind a common contract."""

    provider_id: str

    def get_capabilities(self) -> Dict[str, Any]:
        provider = get_provider(self.provider_id) or {}
        return dict(provider.get("capabilities") or {})

    @abstractmethod
    def validate_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate stored provider configuration without sending a submission."""

    def search_clients(
        self,
        query: str,
        *,
        config: Dict[str, Any],
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(f"{self.provider_id} does not support client search")

    @abstractmethod
    def send_submission(
        self,
        payload: Dict[str, Any],
        *,
        config: Dict[str, Any],
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send canonical AutoFil payload to the provider."""


class PlannedProviderAdapter(IntegrationAdapter):
    """Placeholder contract implementation for providers pending credentials."""

    def __init__(self, provider_id: str) -> None:
        self.provider_id = provider_id

    def validate_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        void_config = config
        del void_config
        return {
            "ok": False,
            "status": "not_implemented",
            "message": f"{self.provider_id} adapter is not implemented yet.",
        }

    def search_clients(
        self,
        query: str,
        *,
        config: Dict[str, Any],
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        void_values = (query, config, limit)
        del void_values
        raise NotImplementedError(f"{self.provider_id} client search is not implemented yet")

    def send_submission(
        self,
        payload: Dict[str, Any],
        *,
        config: Dict[str, Any],
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        void_values = (payload, config, target, actions, idempotency_key)
        del void_values
        raise NotImplementedError(f"{self.provider_id} adapter is not implemented yet")


class WebhookAdapter(IntegrationAdapter):
    """Validation adapter for custom webhook destinations."""

    provider_id = "webhook"

    def validate_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = str(config.get("url") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            return {
                "ok": False,
                "status": "invalid",
                "message": "Webhook URL must be a valid http or https URL.",
            }

        return {
            "ok": True,
            "status": "valid",
            "message": "Webhook configuration is valid.",
        }

    def search_clients(
        self,
        query: str,
        *,
        config: Dict[str, Any],
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        void_values = (query, config, limit)
        del void_values
        raise NotImplementedError("Webhook destinations do not support client search")

    def send_submission(
        self,
        payload: Dict[str, Any],
        *,
        config: Dict[str, Any],
        target: Optional[Dict[str, Any]] = None,
        actions: Optional[List[str]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        void_values = (target, actions)
        del void_values
        url = str(config.get("url") or "").strip()
        timeout = int(config.get("timeout_seconds") or 20)
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        headers = {
            "Content-Type": "application/json",
            "X-Autofil-Idempotency-Key": idempotency_key or "",
        }

        secret = self._secret(config)
        auth_type = str(config.get("auth_type") or "none").lower()
        if auth_type == "bearer" and secret:
            headers["Authorization"] = f"Bearer {secret}"
        elif auth_type == "hmac" and secret:
            signature = hmac.new(
                secret.encode("utf-8"),
                body.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Autofil-Signature"] = f"sha256={signature}"

        response = requests.post(
            url,
            data=body,
            headers=headers,
            timeout=max(1, min(timeout, 60)),
        )
        ok = 200 <= response.status_code < 300
        return {
            "ok": ok,
            "status": "succeeded" if ok else "failed",
            "message": None if ok else response.text[:500],
            "response_status": response.status_code,
            "response_body": self._response_body(response),
            "action_results": [
                {
                    "action": "submit_structured_data",
                    "status": "succeeded" if ok else "failed",
                    "message": None if ok else response.text[:500],
                }
            ],
        }

    def _secret(self, config: Dict[str, Any]) -> Optional[str]:
        secret_ref = config.get("secret_ref")
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


def get_adapter(provider_id: str) -> IntegrationAdapter:
    """Return an adapter instance for a provider id."""
    normalized = str(provider_id or "webhook").strip().lower()
    if normalized == "webhook":
        return WebhookAdapter()
    return PlannedProviderAdapter(normalized)
