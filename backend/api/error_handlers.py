"""Shared API error helpers."""

from __future__ import annotations

import logging

from flask import jsonify


def internal_server_error(
    logger: logging.Logger,
    public_message: str,
    exc: Exception,
    *,
    success: bool | None = None,
):
    logger.exception(public_message)
    payload = {"error": public_message}
    if success is not None:
        payload["success"] = success
    return jsonify(payload), 500
