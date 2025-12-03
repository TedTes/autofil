"""
Metadata endpoints for frontend configuration.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.field_catalog_service import FieldCatalogService

metadata_bp = Blueprint("metadata", __name__)
field_catalog_service = FieldCatalogService()


@metadata_bp.route("/fields", methods=["GET"])
def get_field_catalog():
    """
    Return the canonical field catalog (parsed from mfc.yaml) as JSON.
    """
    refresh_flag = request.args.get("refresh", "").lower()
    force_refresh = refresh_flag in {"1", "true", "yes"}
    catalog = field_catalog_service.get_catalog(force_refresh=force_refresh)
    return jsonify({"success": True, "data": catalog})
