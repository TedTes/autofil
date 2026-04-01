"""
Bulk operations for submissions.

Endpoints for multi-submission fill, export, download, webhook send, and delete.
"""

import os
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, after_this_request

from api.auth import require_auth, get_current_user_id
from api.error_handlers import internal_server_error
from services.submission_service import SubmissionService
from services.bulk_export_service import BulkExportService

bulk_bp = Blueprint("bulk", __name__)
logger = logging.getLogger(__name__)


def _submission_service() -> SubmissionService:
    return SubmissionService(current_user_id=get_current_user_id())


def _bulk_export_service() -> BulkExportService:
    return BulkExportService(current_user_id=get_current_user_id())


@bulk_bp.route("/fill", methods=["POST"])
@require_auth
def bulk_fill():
    """
    Fill multiple submissions.

    Request JSON:
        { "submission_ids": ["id1", "id2", ...] }

    Returns:
        200 with per-item results
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}
        ids = data.get("submission_ids", [])
        template_id = data.get("template_id") or data.get("templateId")
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "submission_ids must be a non-empty array"}), 400
        if not template_id:
            return jsonify({"error": "template_id is required for bulk fill operations"}), 400

        results, errors = [], []
        for sid in ids:
            try:
                report, output_meta = submission_service.fill_pdf(
                    sid,
                    template_id=template_id,
                )
                results.append({
                    "submission_id": sid,
                    "fill_report": {
                        "written": report.filled_fields,
                        "skipped": len(report.unmapped_fields),
                        "warnings": report.warnings,
                        "errors": report.errors,
                    },
                    "download_url": f"/api/submissions/{sid}/download",
                    "template_id": template_id,
                    "output": output_meta,
                })
            except Exception as e:
                logger.warning("bulk fill failed for submission_id=%s: %s", sid, e)
                errors.append({"submission_id": sid, "error": "Fill failed"})

        return jsonify({
            "success": len(results) > 0,
            "data": {
                "total": len(ids),
                "successful": len(results),
                "failed": len(errors),
                "results": results,
                "errors": errors,
            },
            "message": f"Bulk fill: {len(results)} succeeded, {len(errors)} failed",
        }), 200
    except Exception as e:
        return internal_server_error(logger, "Bulk fill failed", e)


@bulk_bp.route("/download", methods=["POST"])
@require_auth
def bulk_download_zip():
    """
    Download multiple filled PDFs as a ZIP.

    Request JSON:
        { "submission_ids": ["id1", "id2", ...] }

    Response:
        application/zip (200 if all available, 207 if partial)
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}
        ids = data.get("submission_ids", [])
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "submission_ids must be a non-empty array"}), 400

        import io, zipfile

        buf = io.BytesIO()
        success, fail = 0, 0
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for sid in ids:
                try:
                    pdf_bytes = submission_service.get_filled_pdf_bytes(sid)
                    if pdf_bytes:
                        meta = submission_service.get_submission(sid)
                        name = f"{(meta.get('filename') or sid).replace('.pdf','')}_filled.pdf"
                        zf.writestr(name, pdf_bytes)
                        success += 1
                    else:
                        fail += 1
                except Exception:
                    fail += 1

            if fail and success:
                zf.writestr("error_log.txt", f"{fail} file(s) were missing or failed to add.")

        if success == 0:
            return jsonify({"success": False, "message": "No filled PDFs to download"}), 400

        buf.seek(0)
        status = 200 if fail == 0 else 207
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=f"filled_pdfs_{ts}.zip"), status

    except Exception as e:
        return internal_server_error(logger, "Bulk download failed", e)


@bulk_bp.route("/export-zip", methods=["POST"])
@require_auth
def bulk_export_zip():
    """
    Export multiple filled PDFs as a single ZIP via BulkExportService.

    Request JSON:
        { "submission_ids": ["id1", "id2", ...] }

    Response:
        application/zip
        - 200 OK if all succeeded
        - 207 Multi-Status if partial success (ZIP may include error_log.txt)
        - 400 if none succeeded
    """
    try:
        bulk_export_service = _bulk_export_service()
        payload = request.get_json() or {}
        ids = payload.get("submission_ids")

        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "submission_ids (non-empty array) is required"}), 400

        zip_path, results = bulk_export_service.create_zip_for_submissions(ids)
        if not os.path.exists(zip_path):
            return jsonify({"error": "Failed to generate ZIP"}), 500

        success_count = sum(1 for r in results if r.get("success"))
        failure_count = sum(1 for r in results if not r.get("success"))

        if success_count == 0:
            os.remove(zip_path)
            return jsonify({
                "success": False,
                "message": "No filled PDFs could be exported",
                "results": results,
            }), 400

        status_code = 200 if failure_count == 0 else 207
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"export_{ts}.zip"

        @after_this_request
        def cleanup(resp):
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass
            return resp

        return send_file(zip_path, mimetype="application/zip", as_attachment=True, download_name=filename), status_code

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return internal_server_error(logger, "Bulk export failed", e)


@bulk_bp.route("/export/csv", methods=["POST"])
@require_auth
def bulk_export_csv():
    """
    Export submissions to CSV.

    Request JSON:
        {
          "submission_ids": ["id1","id2",...],  # optional (exports all if omitted)
          "fields": ["field1","field2",...]     # optional
        }
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}

        submissions = (
            submission_service.get_submissions_by_ids(data["submission_ids"])
            if data.get("submission_ids")
            else submission_service.get_all_submissions()
        )
        if not submissions:
            return jsonify({"error": "No submissions to export"}), 400

        fields = data.get("fields")
        csv_path = submission_service.export_service.export_to_csv(submissions=submissions, fields=fields)

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return send_file(csv_path, mimetype="text/csv", as_attachment=True, download_name=f"submissions_{ts}.csv")
    except Exception as e:
        return internal_server_error(logger, "CSV export failed", e)


@bulk_bp.route("/export/json", methods=["POST"])
@require_auth
def bulk_export_json():
    """
    Export submissions to JSON.

    Request JSON:
        {
          "submission_ids": ["id1","id2",...],  # optional
          "pretty": true                        # optional (default true)
        }
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}

        submissions = (
            submission_service.get_submissions_by_ids(data["submission_ids"])
            if data.get("submission_ids")
            else submission_service.get_all_submissions()
        )
        if not submissions:
            return jsonify({"error": "No submissions to export"}), 400

        pretty = data.get("pretty", True)
        json_path = submission_service.export_service.export_to_json(submissions=submissions, pretty=pretty)

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return send_file(json_path, mimetype="application/json", as_attachment=True, download_name=f"submissions_{ts}.json")
    except Exception as e:
        return internal_server_error(logger, "JSON export failed", e)


@bulk_bp.route("/export/package", methods=["POST"])
@require_auth
def bulk_export_package():
    """
    Export a complete package (PDFs, JSON, CSV) as a ZIP.

    Request JSON:
        {
          "submission_ids": ["id1","id2",...],  # optional
          "include_pdfs": true,
          "include_json": true,
          "include_csv": true
        }
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}

        submissions = (
            submission_service.get_submissions_by_ids(data["submission_ids"])
            if data.get("submission_ids")
            else submission_service.get_all_submissions()
        )
        if not submissions:
            return jsonify({"error": "No submissions to export"}), 400

        zip_path = submission_service.export_service.create_export_package(
            submissions=submissions,
            include_pdfs=data.get("include_pdfs", True),
            include_json=data.get("include_json", True),
            include_csv=data.get("include_csv", True),
        )

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return send_file(zip_path, mimetype="application/zip", as_attachment=True, download_name=f"submissions_package_{ts}.zip")
    except Exception as e:
        return internal_server_error(logger, "Package export failed", e)


@bulk_bp.route("/export/webhook", methods=["POST"])
@require_auth
def bulk_send_webhook():
    """
    Send multiple submissions to a webhook.

    Request JSON:
        {
          "webhook_url": "https://example.com/webhook",
          "submission_ids": ["id1","id2",...],  # optional
          "format": "full" | "summary" | "ids_only",
          "headers": { ... }                    # optional
        }
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}
        webhook_url = data.get("webhook_url")
        if not webhook_url:
            return jsonify({"error": "webhook_url is required"}), 400

        submissions = (
            submission_service.get_submissions_by_ids(data["submission_ids"])
            if data.get("submission_ids")
            else submission_service.get_all_submissions()
        )
        if not submissions:
            return jsonify({"error": "No submissions to send"}), 400

        payload = submission_service.export_service.generate_api_payload(
            submissions=submissions,
            format=data.get("format", "full"),
        )
        headers = data.get("headers", {})

        resp = submission_service.export_service.send_webhook(
            webhook_url=webhook_url,
            payload=payload,
            headers=headers,
        )
        return jsonify({"success": resp["success"], "data": resp}), (200 if resp["success"] else 500)
    except Exception as e:
        return internal_server_error(logger, "Webhook export failed", e)


@bulk_bp.route("/delete", methods=["DELETE"])
@require_auth
def bulk_delete():
    """
    Delete multiple submissions.

    Request JSON:
        { "submission_ids": ["id1","id2",...] }

    Returns:
        { "success": true, "results": [{ id, success, error? }, ...] }
    """
    try:
        submission_service = _submission_service()
        data = request.get_json() or {}
        ids = data.get("submission_ids", [])
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "submission_ids must be a non-empty array"}), 400

        results = []
        for sid in ids:
            try:
                deleted = submission_service.delete_submission(sid)
                if not deleted:
                    results.append({"id": sid, "success": False, "error": "Submission not found"})
                else:
                    results.append({"id": sid, "success": True})
            except Exception as e:
                logger.warning("bulk delete failed for submission_id=%s: %s", sid, e)
                results.append({"id": sid, "success": False, "error": "Delete failed"})

        return jsonify({"success": True, "results": results}), 200
    except Exception as e:
        return internal_server_error(logger, "Bulk delete failed", e)
