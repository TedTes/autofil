"""Auth strategy contracts for config-driven provider integrations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from base64 import b64encode
from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional, Tuple


@dataclass(frozen=True)
class PreparedAuth:
    """Normalized auth output that an HTTP client can apply consistently."""

    headers: Dict[str, str] = field(default_factory=dict)
    query_params: Dict[str, str] = field(default_factory=dict)
    basic_auth: Optional[Tuple[str, str]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class AuthStrategy(ABC):
    """Strategy contract for provider-specific auth preparation."""

    strategy_name: str

    @abstractmethod
    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        """Convert stored provider auth config into normalized request auth."""


class UnsupportedAuthStrategy(AuthStrategy):
    """Fallback strategy for provider auth types that are not wired yet."""

    def __init__(self, strategy_name: str) -> None:
        self.strategy_name = strategy_name

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        void_values = (provider_id, auth_config, runtime_auth_config)
        del void_values
        raise NotImplementedError(f"Auth strategy '{self.strategy_name}' is not implemented")


class ApiKeyAuthStrategy(AuthStrategy):
    strategy_name = "api_key"

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        void_provider = provider_id
        del void_provider
        key = str(auth_config.get("apiKey") or auth_config.get("api_key") or "").strip()
        if not key:
            raise ValueError("apiKey is required for api_key auth")

        runtime = dict(runtime_auth_config or {})
        delivery = str(runtime.get("delivery") or "header").strip().lower()
        name = str(runtime.get("name") or "X-API-Key").strip() or "X-API-Key"
        if delivery == "query":
            return PreparedAuth(query_params={name: key})
        return PreparedAuth(headers={name: key})


class BasicAuthStrategy(AuthStrategy):
    strategy_name = "basic_auth"

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        void_values = (provider_id, runtime_auth_config)
        del void_values
        username = str(
            auth_config.get("username")
            or auth_config.get("loginId")
            or auth_config.get("login_id")
            or ""
        ).strip()
        password = str(auth_config.get("password") or "").strip()
        if not username or not password:
            raise ValueError("username/loginId and password are required for basic_auth")
        basic_token = b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        return PreparedAuth(
            basic_auth=(username, password),
            headers={"Authorization": f"Basic {basic_token}"},
        )


class OAuth2ClientCredentialsAuthStrategy(AuthStrategy):
    strategy_name = "oauth2_client_credentials"

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        client_id = str(auth_config.get("clientId") or auth_config.get("client_id") or "").strip()
        client_secret = str(
            auth_config.get("clientSecret") or auth_config.get("client_secret") or ""
        ).strip()
        if not client_id or not client_secret:
            raise ValueError("clientId and clientSecret are required for oauth2_client_credentials")

        runtime = dict(runtime_auth_config or {})
        token_url = str(
            runtime.get("tokenUrl")
            or auth_config.get("tokenUrl")
            or auth_config.get("baseUrl")
            or ""
        ).strip()
        scopes = runtime.get("scopes") or auth_config.get("scopes") or []
        audience = runtime.get("audience") or auth_config.get("audience")
        metadata: Dict[str, Any] = {
            "providerId": provider_id,
            "grantType": "client_credentials",
            "tokenUrl": token_url,
            "clientId": client_id,
            "clientSecret": client_secret,
            "scopes": scopes if isinstance(scopes, list) else [str(scopes)],
        }
        if audience:
            metadata["audience"] = audience
        return PreparedAuth(metadata=metadata)


class SessionLoginAuthStrategy(AuthStrategy):
    strategy_name = "session_login"

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        username = str(auth_config.get("username") or auth_config.get("loginId") or "").strip()
        password = str(auth_config.get("password") or "").strip()
        if not username or not password:
            raise ValueError("username/loginId and password are required for session_login")

        runtime = dict(runtime_auth_config or {})
        login_path = str(runtime.get("loginPath") or auth_config.get("loginPath") or "").strip()
        return PreparedAuth(
            metadata={
                "providerId": provider_id,
                "loginPath": login_path,
                "username": username,
                "password": password,
            }
        )


class CustomAuthStrategy(AuthStrategy):
    strategy_name = "custom"

    def prepare(
        self,
        *,
        provider_id: str,
        auth_config: Mapping[str, Any],
        runtime_auth_config: Optional[Mapping[str, Any]] = None,
    ) -> PreparedAuth:
        return PreparedAuth(
            metadata={
                "providerId": provider_id,
                "authConfig": dict(auth_config),
                "runtimeAuthConfig": dict(runtime_auth_config or {}),
            }
        )


AUTH_STRATEGIES: Dict[str, AuthStrategy] = {}


def register_auth_strategy(strategy: AuthStrategy) -> None:
    AUTH_STRATEGIES[str(strategy.strategy_name).strip().lower()] = strategy


def get_auth_strategy(strategy_name: str) -> AuthStrategy:
    normalized = str(strategy_name or "").strip().lower()
    strategy = AUTH_STRATEGIES.get(normalized)
    if strategy:
        return strategy
    return UnsupportedAuthStrategy(normalized or "custom")


for _strategy in (
    ApiKeyAuthStrategy(),
    OAuth2ClientCredentialsAuthStrategy(),
    BasicAuthStrategy(),
    SessionLoginAuthStrategy(),
    CustomAuthStrategy(),
):
    register_auth_strategy(_strategy)
