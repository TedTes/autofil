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
        if "fields" not in data:
            data["fields"] = {}
        return data
