"""Read-only submission query helpers."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from services.submission_repository import SubmissionRepository


class SubmissionQueryService:
    """Build read models for submissions from stored metadata."""

    def __init__(
        self,
        *,
        repository: SubmissionRepository,
        get_submission: Callable[[str], Optional[Dict[str, Any]]],
    ) -> None:
        self.repository = repository
        self.get_submission = get_submission

    def list_submission_summaries(
        self,
        limit: Optional[int] = None,
        offset: int = 0,
        statuses: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        normalized_statuses = {
            status.strip().lower()
            for status in (statuses or [])
            if status and status.strip()
        }
        summaries: List[Dict[str, Any]] = []
        for metadata in self.repository.list_all():
            summary = self.build_submission_summary(metadata)
            if not summary:
                continue
            status = summary.get("status")
            if normalized_statuses and str(status).lower() not in normalized_statuses:
                continue
            summaries.append(summary)

        summaries.sort(key=lambda item: item.get("uploaded_at") or "", reverse=True)
        total = len(summaries)
        if limit is not None:
            start = max(offset, 0)
            summaries = summaries[start : start + max(limit, 0)]
        return {"items": summaries, "total": total}

    def build_submission_summary(self, metadata: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not metadata:
            return None
        submission_id = metadata.get("submission_id")
        if not submission_id:
            return None

        inputs_meta = metadata.get("inputs") or []
        primary_input = inputs_meta[-1] if inputs_meta else None
        submission_name = (
            metadata.get("name")
            or metadata.get("title")
            or f"Submission {submission_id[:8]}"
        )
        status = metadata.get("status") or metadata.get("workflow_status") or "uploaded"

        return {
            "submission_id": submission_id,
            "name": submission_name,
            "filename": (
                (primary_input or {}).get("filename")
                or metadata.get("filename")
                or metadata.get("name")
                or "Untitled.pdf"
            ),
            "input_id": (primary_input or {}).get("input_id"),
            "status": status,
            "uploaded_at": (primary_input or {}).get("uploaded_at") or metadata.get("uploaded_at") or metadata.get("created_at"),
            "last_edited_at": metadata.get("last_edited_at"),
            "filled_at": metadata.get("filled_at"),
            "updated_at": metadata.get("updated_at"),
            "confidence": metadata.get("confidence"),
            "folder_id": metadata.get("folder_id"),
            "client_id": metadata.get("client_id"),
            "client_name": metadata.get("client_name"),
            "document_type": (primary_input or {}).get("document_type") or metadata.get("document_type"),
            "template_type": metadata.get("template_type"),
            "template_metadata": metadata.get("template_metadata"),
            "file_count": metadata.get("file_count", 0),
        }

    def get_all_submissions(self) -> List[Dict[str, Any]]:
        submissions: List[Dict[str, Any]] = []
        for metadata in self.repository.list_all():
            submission_id = metadata.get("submission_id")
            if not submission_id:
                continue
            submission = self.get_submission(submission_id)
            if submission:
                submissions.append(submission)
        return submissions

    def get_submissions_by_ids(self, submission_ids: List[str]) -> List[Dict[str, Any]]:
        submissions: List[Dict[str, Any]] = []
        for submission_id in submission_ids:
            try:
                submission = self.get_submission(submission_id)
            except Exception:
                submission = None
            if submission:
                submissions.append(submission)
        return submissions
