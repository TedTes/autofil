"""Template library service backed by normalized YAML template configs."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from filling.template_loader import TemplateLoader, TemplateConfig
from services.supabase_storage_service import SupabaseStorageService


class TemplateLibraryService:
    """
    Discover available templates and expose normalized metadata for the UI/API.

    The canonical source of truth is the YAML/JSON template config loaded through
    ``TemplateLoader``. Supabase storage is used only as an optional source of
    discoverable template ids when configured.
    """

    def __init__(self) -> None:
        self.storage = SupabaseStorageService()
        self.templates_root = os.getenv("SUPABASE_TEMPLATES_PREFIX", "templates").strip("/")

    def list_templates(self, form_type: Optional[str] = None) -> List[Dict[str, Any]]:
        templates: List[Dict[str, Any]] = []
        for template_id in self._discover_template_ids():
            config = TemplateLoader.load(template_id)
            if not config:
                continue
            template = self._to_library_dict(config)
            if form_type and template.get("formType") != form_type:
                continue
            templates.append(template)

        templates.sort(key=lambda item: ((not item.get("isPopular", False)), item.get("name", "")))
        return templates

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        config = TemplateLoader.load(template_id)
        if not config:
            return None
        return self._to_library_dict(config)

    def _discover_template_ids(self) -> List[str]:
        if getattr(self.storage, "enabled", False):
            template_ids = set()
            for entry in self.storage.list_objects(self.templates_root):
                name = entry.get("name")
                if not name or entry.get("metadata"):
                    continue
                template_ids.add(name)
            return sorted(template_ids)

        template_ids = set()
        local_dir = getattr(TemplateLoader, "local_template_dir", None)
        if isinstance(local_dir, Path) and local_dir.exists():
            for candidate in local_dir.iterdir():
                if candidate.name.startswith("."):
                    continue
                if candidate.is_file() and candidate.suffix.lower() in {".yaml", ".yml", ".json"}:
                    template_ids.add(candidate.stem)
                elif candidate.is_dir():
                    template_ids.add(candidate.name)

        return sorted(template_ids)

    def _to_library_dict(self, config: TemplateConfig) -> Dict[str, Any]:
        template_url = config.pdf_url
        if getattr(self.storage, "enabled", False):
            remote_path = self.storage.build_path(self.templates_root, config.template_id, "template.pdf")
            template_url = self.storage.get_public_url(remote_path) or template_url

        payload = config.to_library_dict(template_url=template_url)
        payload["estimatedSize"] = config.raw.get("estimated_size")
        payload["createdAt"] = config.raw.get("created_at")
        payload["updatedAt"] = config.raw.get("updated_at")
        payload["filler"] = config.raw.get("filler")
        return payload
