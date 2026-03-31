"""Authentication helpers backed by Supabase Auth."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

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
        self.enabled = bool(self.url and self.key and Client and create_client)
        self._client: Optional[Client] = None

        if self.enabled:
            try:
                self._client = create_client(self.url, self.key)
            except Exception as exc:  # pragma: no cover
                logger.warning("auth-service failed to initialize Supabase client: %s", exc)
                self.enabled = False
                self._client = None

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        if not self.enabled or not self._client or not token:
            return None

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
            logger.warning("auth-service token verification failed: %s", exc)
            return None
