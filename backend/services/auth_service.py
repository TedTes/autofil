"""Authentication helpers backed by Supabase Auth."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover
    Client = None  # type: ignore
    create_client = None  # type: ignore

logger = logging.getLogger(__name__)


class AuthService:
    """Verify bearer tokens and return the authenticated user."""

    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.enabled = bool(self.url and self.key)
        self._client: Optional[Client] = None

        if self.enabled and Client and create_client:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover
                logger.warning("auth-service failed to initialize Supabase client: %s", exc)
                self._client = None

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        if not self.enabled or not token:
            return None

        if self._client:
            return self._verify_with_client(token)

        return self._verify_with_http(token)

    def _verify_with_client(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            response = self._client.auth.get_user(token)
            user = getattr(response, "user", None)
            if user is None and isinstance(response, dict):
                user = response.get("user")
            if not user:
                return None

            user_id = getattr(user, "id", None)
            email = getattr(user, "email", None)
            if user_id is None and isinstance(user, dict):
                user_id = user.get("id")
                email = user.get("email")
            if not user_id:
                return None

            return {
                "user_id": user_id,
                "email": email,
            }
        except Exception as exc:
            logger.warning("auth-service token verification failed (client): %s: %s", type(exc).__name__, exc)
            return None

    def _verify_with_http(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            req = Request(
                f"{self.url}/auth/v1/user",
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {token}",
                },
                method="GET",
            )
            with urlopen(req, timeout=10) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))

            user_id = payload.get("id")
            email = payload.get("email")
            if not user_id:
                return None

            return {
                "user_id": user_id,
                "email": email,
            }
        except HTTPError as exc:
            if exc.code in (401, 403):
                logger.warning("auth-service token rejected: HTTP %s", exc.code)
            else:
                logger.warning("auth-service upstream error: HTTP %s", exc.code)
            return None
        except (URLError, TimeoutError) as exc:
            logger.warning("auth-service network failure (Supabase unreachable): %s: %s", type(exc).__name__, exc)
            return None
        except json.JSONDecodeError as exc:
            logger.warning("auth-service malformed response: %s", exc)
            return None
