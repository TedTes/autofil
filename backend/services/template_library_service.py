"""
Template library service - lists available fillable templates from Supabase storage.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from services.supabase_storage_service import SupabaseStorageService


class TemplateLibraryService:
    """
    Fetch template metadata stored in Supabase Storage.

    Expected structure per template:
        templates/{template_id}/template.json
        templates/{template_id}/template.pdf

    template.json should include at least:
        {
            "template_id": "acord_126",
            "name": "ACORD 126",
            "description": "...",
            "expected_documents": [...],
            "suggested_forms": [...],
            "expected_fields": [...]
        }
    """

    def __init__(self) -> None:
        self.storage = SupabaseStorageService()
        self.templates_root = os.getenv("SUPABASE_TEMPLATES_PREFIX", "templates").strip("/")

    def list_templates(self) -> List[Dict[str, Any]]:
        if not getattr(self.storage, "enabled", False):
            return []
        items = self.storage.list_objects(self.templates_root)
        templates: List[Dict[str, Any]] = []

        for entry in items:
            name = entry.get("name")
            if not name:
                continue

            # Supabase Storage returns files with metadata; folders have metadata None
            if entry.get("metadata"):
                continue  # skip files at root level

            template_id = name
            json_path = self.storage.build_path(self.templates_root, template_id, "template.json")
            pdf_path = self.storage.build_path(self.templates_root, template_id, "template.pdf")

            json_text = self.storage.download_text(json_path)
            if not json_text:
                continue

            try:
                data = json.loads(json_text)
            except json.JSONDecodeError:
                continue

            templates.append({
                "template_id": data.get("template_id") or template_id,
                "name": data.get("name") or template_id,
                "description": data.get("description") or "",
                "expected_documents": data.get("expected_documents") or [],
                "suggested_forms": data.get("suggested_forms") or [],
                "expected_fields": data.get("expected_fields") or [],
                "template_url": self.storage.get_public_url(pdf_path),
            })

        return templates
