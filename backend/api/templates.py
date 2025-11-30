from datetime import datetime
from flask import Blueprint, jsonify, request
from services.template_library_service import TemplateLibraryService

template_bp = Blueprint("templates", __name__)
template_library = TemplateLibraryService()


@template_bp.route("", methods=["GET"])
def list_templates():
    form_type = request.args.get("formType") or request.args.get("form_type")
    templates = template_library.list_templates(form_type=form_type)
    return jsonify({
        "templates": templates,
        "total": len(templates),
        "timestamp": datetime.utcnow().isoformat()
    }), 200


@template_bp.route("/<template_id>", methods=["GET"])
def get_template(template_id: str):
    template = template_library.get_template(template_id)
    if not template:
        return jsonify({"error": "Template not found"}), 404
    return jsonify({
        "template": template,
        "timestamp": datetime.utcnow().isoformat()
    }), 200
