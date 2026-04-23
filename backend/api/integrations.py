"""Integration destination and job API routes."""

import logging

from flask import Blueprint, jsonify, request

from api.auth import get_current_user_id, require_auth
from api.error_handlers import internal_server_error
from services.integration_service import IntegrationService

integration_bp = Blueprint("integrations", __name__)
logger = logging.getLogger(__name__)


def _integration_service() -> IntegrationService:
    return IntegrationService(current_user_id=get_current_user_id())


@integration_bp.route("/providers", methods=["GET"])
@require_auth
def list_providers():
    try:
        providers = _integration_service().list_providers()
        return jsonify({"success": True, "data": providers}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to list integration providers", exc)


@integration_bp.route("/destinations", methods=["GET"])
@require_auth
def list_destinations():
    try:
        client_id = request.args.get("client_id")
        destinations = _integration_service().list_destinations(client_id=client_id)
        return jsonify({"success": True, "data": destinations}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to list integration destinations", exc)


@integration_bp.route("/connections", methods=["GET"])
@require_auth
def list_connections():
    try:
        client_id = request.args.get("client_id")
        connections = _integration_service().list_destinations(client_id=client_id)
        return jsonify({"success": True, "data": connections}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to list integration connections", exc)


@integration_bp.route("/destinations", methods=["POST"])
@require_auth
def create_destination():
    try:
        payload = request.get_json(silent=True) or {}
        destination = _integration_service().create_destination(payload)
        return jsonify({"success": True, "data": destination}), 201
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return internal_server_error(logger, "Failed to create integration destination", exc)


@integration_bp.route("/connections", methods=["POST"])
@require_auth
def create_connection():
    try:
        payload = request.get_json(silent=True) or {}
        connection = _integration_service().create_destination(payload)
        return jsonify({"success": True, "data": connection}), 201
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return internal_server_error(logger, "Failed to create integration connection", exc)


@integration_bp.route("/destinations/<destination_id>", methods=["PATCH"])
@require_auth
def update_destination(destination_id: str):
    try:
        payload = request.get_json(silent=True) or {}
        destination = _integration_service().update_destination(destination_id, payload)
        if not destination:
            return jsonify({"success": False, "error": "Integration destination not found"}), 404
        return jsonify({"success": True, "data": destination}), 200
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return internal_server_error(logger, "Failed to update integration destination", exc)


@integration_bp.route("/connections/<connection_id>", methods=["PATCH"])
@require_auth
def update_connection(connection_id: str):
    try:
        payload = request.get_json(silent=True) or {}
        connection = _integration_service().update_destination(connection_id, payload)
        if not connection:
            return jsonify({"success": False, "error": "Integration connection not found"}), 404
        return jsonify({"success": True, "data": connection}), 200
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return internal_server_error(logger, "Failed to update integration connection", exc)


@integration_bp.route("/destinations/<destination_id>", methods=["DELETE"])
@require_auth
def delete_destination(destination_id: str):
    try:
        deleted = _integration_service().delete_destination(destination_id)
        if not deleted:
            return jsonify({"success": False, "error": "Integration destination not found"}), 404
        return jsonify({"success": True, "message": "Integration destination disabled"}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to delete integration destination", exc)


@integration_bp.route("/connections/<connection_id>", methods=["DELETE"])
@require_auth
def delete_connection(connection_id: str):
    try:
        deleted = _integration_service().delete_destination(connection_id)
        if not deleted:
            return jsonify({"success": False, "error": "Integration connection not found"}), 404
        return jsonify({"success": True, "message": "Integration connection disabled"}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to delete integration connection", exc)


@integration_bp.route("/submissions/<submission_id>/jobs", methods=["GET"])
@require_auth
def list_submission_jobs(submission_id: str):
    try:
        jobs = _integration_service().list_jobs(submission_id)
        return jsonify({"success": True, "data": jobs}), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to list integration jobs", exc)


@integration_bp.route("/submissions/<submission_id>/send", methods=["POST"])
@require_auth
def send_submission(submission_id: str):
    try:
        payload = request.get_json(silent=True) or {}
        destination_id = payload.get("destination_id")
        if not destination_id:
            return jsonify({"success": False, "error": "destination_id is required"}), 400
        job = _integration_service().send_submission(
            submission_id=submission_id,
            destination_id=destination_id,
        )
        return jsonify({"success": True, "data": job}), 200
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return internal_server_error(logger, "Failed to send integration payload", exc)
