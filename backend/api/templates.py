import logging

from datetime import datetime
from flask import Blueprint, jsonify, request
from api.auth import require_auth
from api.error_handlers import internal_server_error
from services.template_library_service import TemplateLibraryService

template_bp = Blueprint("templates", __name__)
logger = logging.getLogger(__name__)


def _template_library() -> TemplateLibraryService:
    return TemplateLibraryService()


@template_bp.route("", methods=["GET"])
@require_auth
def list_templates():
    try:
        form_type = request.args.get("formType") or request.args.get("form_type")
        templates = _template_library().list_templates(form_type=form_type)
        return jsonify({
            "templates": templates,
            "total": len(templates),
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to list templates", exc)


@template_bp.route("/<template_id>", methods=["GET"])
@require_auth
def get_template(template_id: str):
    try:
        template = _template_library().get_template(template_id)
        if not template:
            return jsonify({"error": "Template not found"}), 404
        return jsonify({
            "template": template,
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as exc:
        return internal_server_error(logger, "Failed to retrieve template", exc)
