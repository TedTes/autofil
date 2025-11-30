"""
Template library service - lists available fillable templates from Supabase storage.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

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

    def list_templates(self, form_type: Optional[str] = None) -> List[Dict[str, Any]]:
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

            template = self._map_template(template_id, data, pdf_path)
            if form_type and template.get("formType") != form_type:
                continue
            templates.append(template)

        return templates

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        if not getattr(self.storage, "enabled", False):
            return None
        json_path = self.storage.build_path(self.templates_root, template_id, "template.json")
        pdf_path = self.storage.build_path(self.templates_root, template_id, "template.pdf")
        json_text = self.storage.download_text(json_path)
        if not json_text:
            return None
        try:
            data = json.loads(json_text)
        except json.JSONDecodeError:
            return None
        return self._map_template(template_id, data, pdf_path)

    def _map_template(self, template_id: str, data: Dict[str, Any], pdf_path: str) -> Dict[str, Any]:
        def _get(key: str, default=None):
            return data.get(key) or data.get(key.replace('_', '')) or default

        return {
            "id": data.get("id") or data.get("template_id") or template_id,
            "name": data.get("name") or template_id,
            "description": data.get("description") or "",
            "formType": _get("form_type", "CUSTOM"),
            "filler": data.get("filler"),
            "requiredDataSections": _get("required_data_sections", []) or [],
            "optionalDataSections": _get("optional_data_sections", []),
            "estimatedFields": int(_get("estimated_fields", 0) or 0),
            "version": data.get("version"),
            "icon": data.get("icon"),
            "isPopular": bool(data.get("is_popular") or data.get("isPopular", False)),
            "estimatedSize": _get("estimated_size"),
            "templateUrl": self.storage.get_public_url(pdf_path),
            "expectedDocuments": _get("expected_documents", []),
            "createdAt": data.get("created_at"),
            "updatedAt": data.get("updated_at"),
        }
