"""
Metadata endpoints for frontend configuration.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from api.auth import require_auth
from api.error_handlers import internal_server_error
from services.field_catalog_service import FieldCatalogService

metadata_bp = Blueprint("metadata", __name__)
logger = logging.getLogger(__name__)


def _field_catalog_service() -> FieldCatalogService:
    return FieldCatalogService()


@metadata_bp.route("/fields", methods=["GET"])
@require_auth
def get_field_catalog():
    """
    Return the canonical field catalog (parsed from mfc.yaml) as JSON.
    """
    try:
        refresh_flag = request.args.get("refresh", "").lower()
        force_refresh = refresh_flag in {"1", "true", "yes"}
        catalog = _field_catalog_service().get_catalog(force_refresh=force_refresh)
        return jsonify({"success": True, "data": catalog})
    except Exception as exc:
        return internal_server_error(logger, "Failed to load metadata catalog", exc, success=False)
