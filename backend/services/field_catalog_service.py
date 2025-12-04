"""
Utility service for loading the canonical Master Field Catalog (mfc.yaml).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import yaml


class FieldCatalogService:
    """Loads and caches the canonical field catalog so APIs can expose it."""

    def __init__(self, template_path: Optional[str] = None) -> None:
        base_dir = Path(__file__).resolve().parents[1]
        default_path = base_dir / "templates" / "mfc.yaml"
        self.template_path = Path(template_path) if template_path else default_path
        self._cache: Optional[Dict[str, Any]] = None

    def get_catalog(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Return the parsed catalog. Pass force_refresh=True to reload from disk.
        """
        if force_refresh or self._cache is None:
            self._cache = self._load()
        return self._cache

    def _load(self) -> Dict[str, Any]:
        with open(self.template_path, "r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}

        semantic_groups = data.get("semantic_groups") or {}
        data["semantic_groups"] = semantic_groups
        data["fields"] = self._flatten_fields(semantic_groups)
        data["group_order"] = self._build_group_order(semantic_groups)
        return data

    def _flatten_fields(self, semantic_groups: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        flat: Dict[str, Dict[str, Any]] = {}
        for group_key, group in semantic_groups.items():
            group_fields = group.get("fields") or {}
            for field_name, meta in group_fields.items():
                field_meta = meta or {}
                normalized = dict(field_meta)
                normalized.setdefault("id", field_meta.get("id", field_name))
                normalized["semantic_group"] = {
                    "key": group_key,
                    "display_name": group.get("display_name"),
                    "description": group.get("description"),
                    "priority": group.get("priority"),
                    "icon": group.get("icon"),
                }
                flat[field_name] = normalized
        return flat

    def _build_group_order(self, semantic_groups: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flatten the semantic group metadata into a serializable dict the frontend
        can use for rendering (preserves ordering + display info).
        """
        order: Dict[str, Any] = {}
        for group_key, group in semantic_groups.items():
            order[group_key] = {
                "display_name": group.get("display_name"),
                "description": group.get("description"),
                "priority": group.get("priority", 0),
                "icon": group.get("icon"),
            }
        return order
