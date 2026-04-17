from __future__ import annotations

import yaml
from pathlib import Path
from typing import Dict, Any, List, Optional


class MFC:
    _cache: Optional[Dict[str, Any]] = None

    @classmethod
    def _load(cls) -> Dict[str, Any]:
        if cls._cache is None:
            path = Path(__file__).resolve().parents[2] / "templates" / "mfc.yaml"
            with open(path, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f) or {}

            semantic_groups = raw.get("semantic_groups", {})
            flat_fields = cls._flatten_fields(semantic_groups)

            cls._cache = {
                **raw,
                "semantic_groups": semantic_groups,
                "fields": flat_fields,
            }
        return cls._cache

    @classmethod
    def field(cls, field_id: str) -> Optional[Dict[str, Any]]:
        """Return the full field definition."""
        return cls._load().get("fields", {}).get(field_id)

    @classmethod
    def required_for(cls, form_type: str) -> List[str]:
        """List of field IDs required for a given form."""
        req = []
        for fid, defn in cls._load().get("fields", {}).items():
            if form_type in defn.get("required_for", []):
                req.append(fid)
        return req

    @classmethod
    def aliases(cls, field_id: str) -> List[str]:
        """All label variations for fuzzy matching."""
        field = cls.field(field_id)
        if not field:
            return []
        return field.get("aliases", [])

    @classmethod
    def semantic_groups(cls) -> Dict[str, Any]:
        """Return the semantic grouping metadata."""
        return cls._load().get("semantic_groups", {})

    @staticmethod
    def _flatten_fields(semantic_groups: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """
        Flatten the semantic_groups structure into the legacy fields map,
        annotating each field with its semantic metadata so existing code
        can keep using MFC.field(...) without understanding groups.
        """
        flat: Dict[str, Dict[str, Any]] = {}
        for group_key, group in (semantic_groups or {}).items():
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
