"""Flask request authentication helpers."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Optional

from flask import g, jsonify, request

from services.auth_service import AuthService


def _extract_bearer_token() -> Optional[str]:
    header = request.headers.get("Authorization", "").strip()
    if not header.lower().startswith("bearer "):
      return None
    return header[7:].strip() or None


def _get_auth_service() -> AuthService:
    """
    Build the auth service at request time so backend restarts/env edits do not
    leave a stale singleton holding missing or outdated Supabase config.
    """
    return AuthService()


def require_auth(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        token = _extract_bearer_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401

        identity = _get_auth_service().verify_token(token)
        if not identity:
            return jsonify({"error": "Invalid or expired session"}), 401

        g.current_user_id = identity["user_id"]
        g.current_user_email = identity.get("email")
        return view(*args, **kwargs)

    return wrapped


def get_current_user_id() -> str:
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        raise RuntimeError("No authenticated user in request context")
    return str(user_id)
