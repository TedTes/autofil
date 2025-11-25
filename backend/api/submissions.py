"""
Submission API routes.

Handles individual submission operations: upload, retrieval,
update, PDF fill, versioning, comparisons, and stats.
"""

import io
import os
import json
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, Response
from services.submission_service import SubmissionService

# Blueprint for submission-specific routes
submission_bp = Blueprint("submissions", __name__)
submission_service = SubmissionService()

@submission_bp.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Upload one or more documents and extract data.
    Supports PDF (native/scanned), images, CSV/Excel, DOCX, TXT.
    """
    try:
        folder_id = request.form.get("folder_id")
        client_id = request.form.get("client_id")
        submission_id = request.form.get("submission_id")
        if submission_id:
            client_id = client_id or None
        files = (
            [request.files["file"]]
            if "file" in request.files
            else request.files.getlist("files")
            if "files" in request.files
            else request.files.getlist("files[]")
            if "files[]" in request.files
            else []
        )
        if not files:
            return jsonify({"error": "No files provided"}), 400

        if submission_id and len(files) > 1:
            return jsonify({"error": "Cannot upload multiple files to the same submission package at once"}), 400

        results, errors = [], []

        for idx, file in enumerate(files):
            if not file or not file.filename:
                errors.append({
                    "index": idx,
                    "filename": "unnamed",
                    "error": "No file selected",
                })
                continue

            try:
                result = submission_service.upload_and_extract(
                    file,
                    folder_id=folder_id,
                    client_id=client_id,
                    submission_id=submission_id,
                )
                results.append({
                    "index": idx,
                    "filename": file.filename,
                    "submission_id": result["submission_id"],
                    "extraction": {"data": result["data"]},
                })
            except Exception as e:
                errors.append({
                    "index": idx,
                    "filename": file.filename,
                    "error": str(e),
                })

        if len(files) == 1:
            if results:
                single = results[0]
                return jsonify({
                    "success": True,
                    "submission_id": single["submission_id"],
                    "extraction": single["extraction"],
                }), 201
            else:
                return jsonify({"error": errors[0]["error"]}), 400

        status = 207 if (errors and results) else 201 if results else 400
        return jsonify({
            "success": bool(results),
            "data": {
                "total": len(files),
                "successful": len(results),
                "failed": len(errors),
                "results": results,
                "errors": errors or [],
            },
            "message": f"Processed {len(files)} files: "
                       f"{len(results)} succeeded, {len(errors)} failed",
        }), status

    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@submission_bp.route("/<submission_id>", methods=["GET"])
def get_submission(submission_id):
    """Retrieve submission data with field-level confidence/hints."""
    try:
        submission = submission_service.get_submission(submission_id)
        if not submission:
            return jsonify({"error": "Submission not found"}), 404

        metadata = submission_service.get_submission_metadata(submission_id) or {}
        field_confidence = metadata.get("field_confidence", {})
        field_hints = metadata.get("field_hints", {})
        extraction_issues = metadata.get("extraction_issues", {})
        suggested_fixes = metadata.get("suggested_fixes", {})

        return jsonify({
            "success": True,
            "data": {
                **submission,
                "field_confidence": field_confidence,
                "field_hints": field_hints,
                "extraction_issues": extraction_issues,
                "suggested_fixes": suggested_fixes,
            },
            "message": "Submission retrieved successfully",
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>", methods=["PUT"])
def update_submission(submission_id):
    """Update a submission's JSON data (full replacement)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        result = submission_service.update_data(submission_id, data)
        return jsonify({
            "success": True,
            "data": result,
            "message": "Submission updated successfully",
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>", methods=["DELETE"])
def delete_submission(submission_id):
    """Delete a submission and all its files."""
    try:
        deleted = submission_service.delete_submission(submission_id)
        if not deleted:
            return jsonify({"error": "Submission not found"}), 404

        return jsonify({
            "success": True,
            "message": "Submission deleted successfully",
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/fill", methods=["POST"])
def fill_pdf(submission_id):
    """Fill a single submission's PDF with extracted data."""
    try:
        payload = request.get_json(silent=True) or {}
        input_ids = payload.get("input_ids")

        report = submission_service.fill_pdf(submission_id, input_ids=input_ids)
        
        return jsonify({
            "success": True,
            "data": {
                "written": report.filled_fields,
                "skipped": len(report.unmapped_fields),
                "coverage": report.coverage,
                "unmapped_fields": report.unmapped_fields,
                "warnings": report.warnings,
                "errors": report.errors,
                "submission_id": submission_id
            },
            "message": "PDF filled successfully" if report.success else "PDF fill completed with issues"
        }), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Fill failed: {str(e)}"}), 500


@submission_bp.route("/<submission_id>/download", methods=["GET"])
def download_pdf(submission_id):
    """Download the filled PDF for a submission."""
    try:
        metadata = submission_service.get_submission_metadata(submission_id)
        if not metadata:
            return jsonify({"error": "Submission not found"}), 404

        file_bytes = submission_service.get_filled_pdf_bytes(submission_id)
        if not file_bytes:
            return jsonify({"error": "File not found"}), 404

        outputs = metadata.get("outputs") or []
        filename = next(
            (entry.get("filename") for entry in outputs if entry.get("filename")),
            None,
        ) or f"{submission_id}_filled.pdf"
        buffer = io.BytesIO(file_bytes)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        print(f"Download error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/preview-input", methods=["GET"])
def preview_input_pdf(submission_id):
    """Preview the original input file inline (for iframes)."""
    try:
        metadata = submission_service.get_submission_metadata(submission_id)
        if not metadata:
            return jsonify({"error": "Submission metadata not found"}), 404

        file_bytes = submission_service.get_original_pdf_bytes(submission_id)
        if file_bytes:
            response = Response(
                file_bytes,
                mimetype="application/pdf",
            )
            response.headers["Content-Disposition"] = "inline"
            response.headers["Cache-Control"] = "no-store"
            return response

        return jsonify({"error": "File not found"}), 404
    except Exception as e:
        print(f"❌ Preview error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/preview-output", methods=["GET"])
def preview_output_pdf(submission_id):
    """Preview the filled PDF inline (for iframes)."""
    try:
        metadata = submission_service.get_submission_metadata(submission_id)
        if not metadata:
            return jsonify({"error": "Submission metadata not found"}), 404

        file_bytes = submission_service.get_filled_pdf_bytes(submission_id)
        if file_bytes:
            response = Response(
                file_bytes,
                mimetype="application/pdf",
            )
            response.headers["Content-Disposition"] = "inline"
            response.headers["Cache-Control"] = "no-store"
            return response

        return jsonify({"error": "File not found"}), 404
    except Exception as e:
        print(f"❌ Preview error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/versions", methods=["GET"])
def get_version_history(submission_id):
    """Get the version history for a submission."""
    try:
        versions = submission_service.get_version_history(submission_id)
        return jsonify({
            "success": True,
            "data": {
                "submission_id": submission_id,
                "versions": versions,
                "total_versions": len(versions),
            },
            "message": "Version history retrieved successfully",
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/versions/<version_id>", methods=["GET"])
def get_specific_version(submission_id, version_id):
    """Get a specific version's data for a submission."""
    try:
        version = submission_service.version_service.get_version(
            submission_id, version_id
        )
        if not version:
            return jsonify({"error": "Version not found"}), 404

        return jsonify({
            "success": True,
            "version": version,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/versions/<version_id>/rollback",
                     methods=["POST"])
def rollback_to_version(submission_id, version_id):
    """Roll back a submission to a specific version."""
    try:
        data = request.get_json() or {}
        user = data.get("user", "user")
        notes = data.get("notes", "")

        target_version = submission_service.version_service.get_version(
            submission_id, version_id
        )
        if not target_version:
            return jsonify({"error": "Version not found"}), 404

        new_version_id = submission_service.version_service.rollback_to_version(
            submission_id, version_id, user
        )
        submission_service.update_data(
            submission_id,
            target_version["data"],
            user=user,
            notes=notes or f"Rolled back to version {target_version['version_number']}",
        )

        return jsonify({
            "success": True,
            "data": {
                "new_version_id": new_version_id,
                "rolled_back_to": {
                    "version_id": version_id,
                    "version_number": target_version["version_number"],
                },
            },
            "message": "Successfully rolled back",
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/versions/compare", methods=["POST"])
def compare_versions(submission_id):
    """Compare two versions of a submission."""
    try:
        data = request.get_json()
        version_id_1 = data.get("version_id_1")
        version_id_2 = data.get("version_id_2")

        if not version_id_1 or not version_id_2:
            return jsonify({"error": "Both version IDs required"}), 400

        comparison = submission_service.version_service.compare_versions(
            submission_id, version_id_1, version_id_2
        )

        return jsonify({
            "success": True,
            "data": comparison,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/compare", methods=["POST"])
def compare_data(submission_id):
    """Compare two arbitrary data snapshots for a submission."""
    try:
        data = request.get_json()
        source_a = data.get("source_a")
        source_b = data.get("source_b")
        source_a_label = data.get("source_a_label", "Source A")
        source_b_label = data.get("source_b_label", "Source B")

        if not source_a or not source_b:
            return jsonify({"error": "Both data sources required"}), 400

        comparison = submission_service.comparison_service.compare_data(
            source_a=source_a,
            source_b=source_b,
            source_a_label=source_a_label,
            source_b_label=source_b_label,
        )

        return jsonify({
            "success": True,
            "data": comparison,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/compare-with-original", methods=["GET"])
def compare_with_original(submission_id):
    """Compare the current data with the original extraction."""
    try:
        comparison = submission_service.compare_with_original(submission_id)
        return jsonify({
            "success": True,
            "data": comparison,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/conflicts/<field>/suggest",
                     methods=["POST"])
def suggest_resolution(submission_id, field):
    """Get a resolution suggestion for a specific conflict field."""
    try:
        data = request.get_json()
        conflict = data.get("conflict")
        context = data.get("context", {})

        if not conflict:
            return jsonify({"error": "Conflict information required"}), 400

        suggestion = submission_service.comparison_service.suggest_resolution(
            conflict=conflict, context=context
        )
        return jsonify({
            "success": True,
            "data": suggestion,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/conflicts/resolve", methods=["POST"])
def resolve_conflicts(submission_id):
    """Apply conflict resolutions to a submission's data."""
    try:
        data = request.get_json()
        comparison_id = data.get("comparison_id")
        resolutions = data.get("resolutions", [])
        user = data.get("user", "user")

        if not comparison_id or not resolutions:
            return jsonify({"error": "Comparison ID and resolutions required"}), 400

        submission = submission_service.get_submission(submission_id)
        if not submission:
            return jsonify({"error": "Submission not found"}), 404

        current_data = submission["data"]

        recorded_resolutions = []
        for resolution in resolutions:
            rec = submission_service.comparison_service.resolve_conflict(
                comparison_id=comparison_id,
                field=resolution["field"],
                resolution=resolution,
                user=user,
            )
            recorded_resolutions.append(rec)

        updated_data = submission_service.comparison_service.apply_resolutions(
            base_data=current_data, resolutions=recorded_resolutions
        )

        submission_service.update_data(
            submission_id=submission_id,
            data=updated_data,
            user=user,
            notes=f"Resolved {len(resolutions)} conflict(s)",
        )

        return jsonify({
            "success": True,
            "message": f"Resolved {len(resolutions)} conflict(s)",
            "data": recorded_resolutions,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/form", methods=["GET"])
def get_submission_form(submission_id):
    """Get a dynamic form definition for a submission."""
    try:
        include_optional = request.args.get("include_optional", "true").lower() == "true"
        form = submission_service.generate_form(
            submission_id=submission_id,
            include_optional=include_optional,
        )
        return jsonify({
            "success": True,
            "data": form,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/data", methods=["PATCH"])
def patch_submission_data(submission_id):
    """Patch a submission's data without changing its workflow status."""
    try:
        payload = request.get_json() or {}
        new_data = payload.get("data")

        if not isinstance(new_data, dict):
            return jsonify({"error": "`data` object is required"}), 400

        user = payload.get("user", "user")
        notes = payload.get("notes", "Manual data update via API")

        submission_service.update_data(
            submission_id=submission_id,
            data=new_data,
            user=user,
            notes=notes,
        )

        return jsonify({
            "success": True,
            "submission_id": submission_id,
            "message": "Updated",
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/<submission_id>/status", methods=["PATCH"])
def update_submission_status(submission_id):
    """
    Update the workflow status for a submission.
    Expects JSON body with "workflow_status".
    """
    try:
        payload = request.get_json() or {}
        new_status = payload.get("workflow_status")
        if not new_status:
            return jsonify({"error": "`workflow_status` is required"}), 400

        submission_service.update_status(
            submission_id=submission_id,
            status=new_status,
            user=payload.get("user", "system"),
        )

        return jsonify({
            "success": True,
            "data": {
                "submission_id": submission_id,
                "workflow_status": new_status,
            },
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/list", methods=["GET"])
def list_all_submissions():
    """List submissions with pagination and optional status filter."""
    try:
  
        limit = int(request.args.get("limit", 100))
        print("1")
        offset = int(request.args.get("offset", 0))
        print("11")
        status_filter = request.args.get("status")
        print("111")

        all_subs = submission_service.get_all_submissions()
 
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",")]
            all_subs = [s for s in all_subs if s.get("status") in statuses]

        total = len(all_subs)
        submissions = all_subs[offset : offset + limit]
        submission_list = [
            {
                "submission_id": s.get("submission_id"),
                "filename": s.get("filename"),
                "status": s.get("status"),
                "uploaded_at": s.get("uploaded_at"),
                "confidence": s.get("confidence"),
                "folder_id": s.get("folder_id"),
            }
            for s in submissions
        ]

        return jsonify({
            "success": True,
            "data": {
                "submissions": submission_list,
                "total": total,
                "limit": limit,
                "offset": offset,
            },
            "message": "Submissions retrieved successfully",
        }), 200
    except Exception as e:
        print("error in list_all_submissions method", str(e))
        return jsonify({"error": str(e)}), 500


@submission_bp.route("/stats", methods=["GET"])
def get_submissions_stats():
    """Get aggregate statistics about submissions."""
    try:
        all_subs = submission_service.get_all_submissions()
        total = len(all_subs)
        by_status = {}
        total_confidence = 0
        confidence_count = 0

        for sub in all_subs:
            status = sub.get("status", "unknown")
            by_status[status] = by_status.get(status, 0) + 1
            confidence = sub.get("confidence")
            if confidence is not None:
                total_confidence += confidence
                confidence_count += 1

        avg_conf = (total_confidence / confidence_count) if confidence_count else 0

        return jsonify({
            "success": True,
            "data": {
                "total_submissions": total,
                "by_status": by_status,
                "average_confidence": round(avg_conf, 2),
                "last_updated": datetime.utcnow().isoformat(),
            },
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@submission_bp.route('/recent', methods=['GET'])
def list_recent_submissions():
    """
    List recent submissions by last activity (uploaded/edited/filled/updated).
    
    Query params:
      - limit (int, default 20)
      - offset (int, default 0)
      - status (comma-separated list, optional)
      - folder_id (str, optional)
      - since (ISO datetime, optional) -> only items with activity >= since
    """
    try:
        limit = int(request.args.get('limit', 20))
        offset = int(request.args.get('offset', 0))
        status_param = request.args.get('status')
        folder_id = request.args.get('folder_id')
        since = request.args.get('since')

        statuses = [s.strip() for s in status_param.split(',')] if status_param else None

        result = submission_service.get_recent_submissions(
            limit=limit,
            offset=offset,
            status=statuses,
            folder_id=folder_id,
            since=since,
        )

        return jsonify({
            "success": True,
            "data": {
                "submissions": result["items"],
                "total": result["total"],
                "limit": limit,
                "offset": offset
            },
            "message": "Recent submissions retrieved successfully"
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
