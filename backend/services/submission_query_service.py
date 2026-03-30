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

    def list_submission_summaries(self) -> List[Dict[str, Any]]:
        summaries: List[Dict[str, Any]] = []
        for metadata in self.repository.list_all():
            if not metadata:
                continue
            submission_id = metadata.get("submission_id")
            if not submission_id:
                continue

            inputs_meta = metadata.get("inputs") or []
            primary_input = inputs_meta[-1] if inputs_meta else None
            submission_name = (
                metadata.get("name")
                or metadata.get("title")
                or f"Submission {submission_id[:8]}"
            )

            summaries.append({
                "submission_id": submission_id,
                "name": submission_name,
                "filename": (
                    (primary_input or {}).get("filename")
                    or metadata.get("filename")
                    or metadata.get("name")
                    or "Untitled.pdf"
                ),
                "input_id": (primary_input or {}).get("input_id"),
                "status": metadata.get("status") or metadata.get("workflow_status") or "uploaded",
                "uploaded_at": (primary_input or {}).get("uploaded_at") or metadata.get("uploaded_at") or metadata.get("created_at"),
                "confidence": metadata.get("confidence"),
                "folder_id": metadata.get("folder_id"),
                "client_id": metadata.get("client_id"),
                "client_name": metadata.get("client_name"),
                "template_type": metadata.get("template_type"),
                "template_metadata": metadata.get("template_metadata"),
                "file_count": metadata.get("file_count", 0),
            })
        return summaries

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
