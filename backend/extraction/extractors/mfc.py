from __future__ import annotations

import yaml
from pathlib import Path
from typing import Dict, Any, List, Optional


class MFC:
    _cache: Optional[Dict[str, Any]] = None

    @classmethod
    def _load(cls) -> Dict[str, Any]:
        if cls._cache is None:
            path = Path(__file__).parent / "mfc.yaml"
            with open(path, "r", encoding="utf-8") as f:
                cls._cache = yaml.safe_load(f)
        return cls._cache

    @classmethod
    def field(cls, field_id: str) -> Optional[Dict[str, Any]]:
        """Return the full field definition."""
        return cls._load()["fields"].get(field_id)

    @classmethod
    def required_for(cls, form_type: str) -> List[str]:
        """List of field IDs required for a given form."""
        req = []
        for fid, defn in cls._load()["fields"].items():
            if form_type in defn.get("required_for", []):
                req.append(fid)
        return req

    @classmethod
    def aliases(cls, field_id: str) -> List[str]:
        """All label variations for fuzzy matching."""
        return cls.field(field_id).get("aliases", [])