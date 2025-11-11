# backend/api/routes/bulk_export_routes.py

import os
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, after_this_request

from services.bulk_export_service import BulkExportService

bulk_export_bp = Blueprint("bulk_export", __name__)
bulk_export_service = BulkExportService()


@bulk_export_bp.route("/export-zip", methods=["POST"])
def bulk_export_zip():
    """
    Export multiple filled PDFs as a single ZIP.

    Request JSON:
        {
            "submission_ids": ["id1", "id2", ...]
        }

    Response:
      - Binary ZIP (application/zip)
      - 200 OK if all succeeded
      - 207 Multi-Status if partial success (ZIP includes error_log.txt)
      - 400 if all failed or invalid request
    """
    try:
        payload = request.get_json() or {}
        submission_ids = payload.get("submission_ids")

        if not isinstance(submission_ids, list) or not submission_ids:
            return jsonify({"error": "submission_ids (non-empty array) is required"}), 400

        zip_path, results = bulk_export_service.create_zip_for_submissions(submission_ids)

        if not os.path.exists(zip_path):
            return jsonify({"error": "Failed to generate ZIP"}), 500

        success_count = sum(1 for r in results if r.get("success"))
        failure_count = sum(1 for r in results if not r.get("success"))

        if success_count == 0:
            # Nothing usable; return JSON error, no ZIP
            os.remove(zip_path)
            return jsonify({
                "success": False,
                "message": "No filled PDFs could be exported",
                "results": results,
            }), 400

        # Decide status code
        status_code = 200 if failure_count == 0 else 207  # Multi-Status on partial

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"export_{timestamp}.zip"

        @after_this_request
        def cleanup(response):
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass
            return response

        response = send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name=filename,
        )

        # TODO:optionally expose basic info via headers if frontend wants
        # response.headers["X-Export-Success-Count"] = str(success_count)
        # response.headers["X-Export-Failure-Count"] = str(failure_count)

        return response, status_code

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
