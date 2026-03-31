"""
Merged Data Service

Loads the persisted semantic sections for a submission and returns them
without any additional reshaping or legacy metadata.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.submission_service import SubmissionService


class MergedDataService:
    """Expose merged semantic sections for a submission."""

    def __init__(
        self,
        submission_service: Optional[SubmissionService] = None,
    ) -> None:
        self.submission_service = submission_service or SubmissionService()

    def get_merged_data(self, submission_id: str) -> Dict[str, Any]:
        """
        Load the normalized semantic sections stored for a submission.
        """
        metadata = self.submission_service.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        canonical = self._resolve_canonical_payload(metadata.get("data") or {})
        semantic_sections_raw = canonical.get("semantic_sections") or canonical.get("semanticSections")
        semantic_sections = self._normalize_semantic_sections(semantic_sections_raw)
        return {
            "semantic_sections": semantic_sections,
        }

    def _resolve_canonical_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            return {}

        if "semantic_sections" in payload or "semanticSections" in payload:
            return payload

        nested = payload.get("data")
        if isinstance(nested, dict) and (
            "semantic_sections" in nested or "semanticSections" in nested
        ):
            return nested

        return payload

    def _normalize_semantic_sections(
        self, sections: Optional[List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        if not sections:
            return []

        normalized: List[Dict[str, Any]] = []
        for section in sections:
            if section is None:
                continue
            key = section.get("key") or section.get("displayName") or section.get("display_name")
            if not key:
                continue
            normalized.append(
                {
                    "key": key,
                    "displayName": section.get("displayName") or section.get("display_name"),
                    "description": section.get("description"),
                    "priority": section.get("priority", 0),
                    "icon": section.get("icon"),
                    "fields": [
                        {
                            "id": field.get("id"),
                            "label": field.get("label"),
                            "type": field.get("type"),
                            "aliases": field.get("aliases", []),
                            "values": field.get("values", []),
                        }
                        for field in section.get("fields") or []
                        if field
                    ],
                }
            )

        normalized.sort(key=lambda section: (section.get("priority", 0), section["key"]))
        return normalized
