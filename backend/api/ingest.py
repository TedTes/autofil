"""Inbound email ingestion routes."""

from __future__ import annotations

import base64
import io
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from flask import Blueprint, jsonify, request
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from api.error_handlers import internal_server_error
from services.client_service import ClientService
from services.submission_service import SubmissionService

ingest_bp = Blueprint("ingest", __name__)
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".csv", ".xls", ".xlsx"}
MAX_ATTACHMENT_BYTES = int(os.getenv("EMAIL_INGEST_MAX_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))


def _verify_ingest_request() -> bool:
    expected = os.getenv("EMAIL_INGEST_WEBHOOK_TOKEN")
    if not expected:
        return os.getenv("FLASK_ENV") == "development" or os.getenv("ALLOW_UNAUTHENTICATED_EMAIL_INGEST") == "1"
    provided = (
        request.headers.get("X-Ingest-Token")
        or request.headers.get("X-Webhook-Token")
        or request.args.get("token")
    )
    return bool(provided and provided == expected)


def _first_value(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            found = _first_value(*value)
            if found:
                return found
    return None


def _extract_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    match = re.search(r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}", value)
    return match.group(0).lower() if match else value.strip().lower()


def _recipient_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    recipient = _first_value(
        payload.get("recipient"),
        payload.get("to"),
        payload.get("To"),
        payload.get("OriginalRecipient"),
        payload.get("original_recipient"),
        payload.get("DeliveredTo"),
        payload.get("delivered_to"),
    )
    if recipient:
        return _extract_email(recipient)

    for key in ("ToFull", "CcFull", "Recipients", "recipients"):
        entries = payload.get(key)
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict):
                email = _extract_email(_first_value(entry.get("Email"), entry.get("email")))
                if email:
                    return email
            elif isinstance(entry, str):
                email = _extract_email(entry)
                if email:
                    return email
    return None


def _sender_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    return _extract_email(
        _first_value(
            payload.get("from"),
            payload.get("From"),
            payload.get("sender"),
            payload.get("Sender"),
            payload.get("ReplyTo"),
            payload.get("reply_to"),
        )
    )


def _message_id_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    return _first_value(
        payload.get("MessageID"),
        payload.get("MessageId"),
        payload.get("message_id"),
        payload.get("messageId"),
        payload.get("Message-Id"),
        payload.get("headers", {}).get("Message-ID") if isinstance(payload.get("headers"), dict) else None,
    )


def _subject_from_payload(payload: Dict[str, Any]) -> str:
    return _first_value(payload.get("subject"), payload.get("Subject")) or "Email Submission"


def _body_preview_from_payload(payload: Dict[str, Any]) -> str:
    body = _first_value(
        payload.get("TextBody"),
        payload.get("text_body"),
        payload.get("text"),
        payload.get("body"),
        payload.get("HtmlBody"),
        payload.get("html"),
    ) or ""
    return body[:2000]


def _iter_json_attachments(payload: Dict[str, Any]) -> Iterable[FileStorage]:
    raw_attachments = (
        payload.get("Attachments")
        or payload.get("attachments")
        or payload.get("files")
        or []
    )
    if not isinstance(raw_attachments, list):
        return []

    files: List[FileStorage] = []
    for attachment in raw_attachments:
        if not isinstance(attachment, dict):
            continue
        filename = _first_value(
            attachment.get("Name"),
            attachment.get("name"),
            attachment.get("filename"),
            attachment.get("FileName"),
        )
        content = _first_value(
            attachment.get("Content"),
            attachment.get("content"),
            attachment.get("data"),
            attachment.get("content_base64"),
        )
        if not filename or not content:
            continue
        safe_name = secure_filename(filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue
        try:
            raw = base64.b64decode(content, validate=False)
        except Exception:
            continue
        if not raw or len(raw) > MAX_ATTACHMENT_BYTES:
            continue
        files.append(
            FileStorage(
                stream=io.BytesIO(raw),
                filename=safe_name,
                content_type=_first_value(
                    attachment.get("ContentType"),
                    attachment.get("content_type"),
                    attachment.get("type"),
                ),
            )
        )
    return files


def _iter_multipart_attachments() -> Iterable[FileStorage]:
    files: List[FileStorage] = []
    for file in request.files.values():
        if not file or not file.filename:
            continue
        safe_name = secure_filename(file.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue
        file.filename = safe_name
        files.append(file)
    return files


def _existing_submission_for_message(submission_service: SubmissionService, message_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not message_id:
        return None
    for metadata in submission_service.db.list_submissions_metadata(user_id=None):
        email_meta = metadata.get("email") or {}
        if email_meta.get("message_id") == message_id:
            return metadata
    return None


@ingest_bp.route("/email", methods=["POST"])
def ingest_email():
    """Receive inbound email webhook payloads and process attachments."""
    if not _verify_ingest_request():
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        if not payload and request.form:
            payload = request.form.to_dict(flat=False)

        recipient = _recipient_from_payload(payload)
        if not recipient:
            return jsonify({"success": False, "error": "Recipient not found"}), 400

        client_service = ClientService(current_user_id=None)
        client = client_service.find_by_ingestion_email(recipient)
        if not client:
            logger.warning("email ingest unknown recipient=%s", recipient)
            return jsonify({"success": False, "error": "Unknown ingestion recipient"}), 200

        submission_service = SubmissionService(current_user_id=None)
        message_id = _message_id_from_payload(payload)
        existing = _existing_submission_for_message(submission_service, message_id)
        if existing:
            return jsonify({
                "success": True,
                "duplicate": True,
                "submission_id": existing.get("submission_id"),
            }), 200

        attachments = list(_iter_json_attachments(payload))
        if not attachments:
            attachments = list(_iter_multipart_attachments())
        if not attachments:
            return jsonify({"success": False, "error": "No supported attachments found"}), 200

        sender = _sender_from_payload(payload)
        subject = _subject_from_payload(payload)
        submission = submission_service.create_submission(
            client_id=client["client_id"],
            name=subject,
            template_type=None,
        )
        submission_id = submission["submission_id"]

        metadata = submission_service.get_submission_metadata(submission_id) or submission
        metadata["source"] = "email"
        metadata["email"] = {
            "recipient": recipient,
            "sender": sender,
            "subject": subject,
            "message_id": message_id,
            "body_preview": _body_preview_from_payload(payload),
            "received_at": datetime.utcnow().isoformat(),
            "attachment_count": len(attachments),
        }
        metadata["status"] = "uploading"
        metadata["updated_at"] = datetime.utcnow().isoformat()
        submission_service.repository.save(metadata)

        processed, errors = [], []
        for attachment in attachments:
            try:
                result = submission_service.upload_and_extract(
                    attachment,
                    client_id=client["client_id"],
                    submission_id=submission_id,
                )
                processed.append({
                    "filename": attachment.filename,
                    "submission_id": result.get("submission_id"),
                    "duplicate_of": result.get("duplicate_of"),
                })
            except Exception as exc:
                logger.warning("email ingest attachment failed filename=%s: %s", attachment.filename, exc)
                errors.append({"filename": attachment.filename, "error": str(exc)})

        metadata = submission_service.get_submission_metadata(submission_id) or metadata
        metadata.setdefault("email", {}).update({
            "processed_attachments": len(processed),
            "failed_attachments": len(errors),
            "errors": errors,
        })
        metadata["source"] = "email"
        metadata["updated_at"] = datetime.utcnow().isoformat()
        if errors and processed:
            metadata["status"] = "partial_failure"
        elif errors and not processed:
            metadata["status"] = "error"
        submission_service.repository.save(metadata)

        return jsonify({
            "success": len(processed) > 0,
            "submission_id": submission_id,
            "client_id": client["client_id"],
            "processed": processed,
            "errors": errors,
        }), 200 if processed else 400
    except Exception as exc:
        return internal_server_error(logger, "Email ingest failed", exc)
