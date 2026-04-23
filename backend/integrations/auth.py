"""Auth strategy contracts for config-driven provider integrations."""

from __future__ import annotations

from abc import ABC, abstractmethod
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


AUTH_STRATEGIES: Dict[str, AuthStrategy] = {}


def register_auth_strategy(strategy: AuthStrategy) -> None:
    AUTH_STRATEGIES[str(strategy.strategy_name).strip().lower()] = strategy


def get_auth_strategy(strategy_name: str) -> AuthStrategy:
    normalized = str(strategy_name or "").strip().lower()
    strategy = AUTH_STRATEGIES.get(normalized)
    if strategy:
        return strategy
    return UnsupportedAuthStrategy(normalized or "custom")
