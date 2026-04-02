"""Template library service backed by template storage."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from filling.template_loader import TemplateLoader, TemplateConfig
from services.supabase_storage_service import SupabaseStorageService


class TemplateLibraryService:
    """
    Discover available templates and expose normalized metadata for the UI/API.

    Supabase template storage is the source of truth for the user-facing form
    library. Local templates are intentionally not exposed here.
    """

    def __init__(self) -> None:
        self.storage = SupabaseStorageService()
        self.templates_root = os.getenv("SUPABASE_TEMPLATES_PREFIX", "templates").strip("/")

    def list_templates(self, form_type: Optional[str] = None) -> List[Dict[str, Any]]:
        if not getattr(self.storage, "enabled", False):
            return []

        templates: List[Dict[str, Any]] = []
        for template_id in self._discover_template_ids():
            config = TemplateLoader._load_from_storage(template_id, version="latest")
            if not config:
                continue
            template = self._to_library_dict(config)
            if form_type and template.get("formType") != form_type:
                continue
            templates.append(template)

        templates.sort(key=lambda item: ((not item.get("isPopular", False)), item.get("name", "")))
        return templates

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        if not getattr(self.storage, "enabled", False):
            return None

        config = TemplateLoader._load_from_storage(template_id, version="latest")
        if not config:
            return None
        return self._to_library_dict(config)

    def _discover_template_ids(self) -> List[str]:
        template_ids = set()
        for entry in self.storage.list_objects(self.templates_root):
            name = entry.get("name")
            if not name or entry.get("metadata"):
                continue
            template_ids.add(name)
        return sorted(template_ids)

    def _to_library_dict(self, config: TemplateConfig) -> Dict[str, Any]:
        remote_path = self.storage.build_path(self.templates_root, config.template_id, "template.pdf")
        template_url = self.storage.resolve_download_url(remote_path, expires_in=3600) or config.pdf_url

        payload = config.to_library_dict(template_url=template_url)
        payload["estimatedSize"] = config.raw.get("estimated_size")
        payload["createdAt"] = config.raw.get("created_at")
        payload["updatedAt"] = config.raw.get("updated_at")
        payload["filler"] = config.raw.get("filler")
        return payload
