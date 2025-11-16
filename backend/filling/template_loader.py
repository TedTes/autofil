"""
Template Loader — loads PDF template metadata (JSON config)
from either:
- Local disk (development)
- Cloud storage (Supabase/S3/GCS) in production

Supports:
- template_id (e.g. "acord_126")
- versioning (e.g. "v2016_09")
- caching
"""

import json
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Any, Optional
import os
import requests


@dataclass
class TemplateConfig:
    template_id: str
    field_map: Dict[str, str]        # canonical → pdf field name
    repeaters: Dict[str, Any]        # table configs
    raw: Dict[str, Any]              # original JSON contents
    pdf_url: Optional[str] = None    # remote PDF
    version: Optional[str] = None    # e.g. "v2016_09"


class TemplateLoader:
    """
    Loads template JSON files from:
        - Local filesystem (default)
        - Cloud storage (if TEMPLATE_CLOUD_BASE_URL is set)

    Example cloud structure:
        {base_url}/acord_126/v2016_09/template.json
        {base_url}/acord_126/v2016_09/template.pdf
    """

    local_template_dir = Path(__file__).parent / "templates"
    cloud_base_url = os.environ.get("TEMPLATE_CLOUD_BASE_URL")  # optional

    @classmethod
    def load(cls, template_id: str, version: str = "latest") -> Optional[TemplateConfig]:
        """
        High-level loader:
            1) Try cloud (if configured)
            2) Fallback to local disk
        """
        # 1. Try cloud storage
        if cls.cloud_base_url:
            config = cls._load_from_cloud(template_id, version)
            if config:
                return config

        # 2. Fallback local
        return cls._load_from_local(template_id, version)

    # ----------------------------------------------------------------------
    # CLOUD LOADER
    # ----------------------------------------------------------------------
    @classmethod
    def _load_from_cloud(cls, template_id: str, version: str) -> Optional[TemplateConfig]:
        version_path = version if version != "latest" else "latest"

        base = cls.cloud_base_url.rstrip("/")
        json_url = f"{base}/{template_id}/{version_path}/template.json"

        try:
            r = requests.get(json_url, timeout=5)
            if r.status_code != 200:
                print(f"[template_loader] cloud: missing JSON: {json_url}")
                return None

            raw = r.json()
            return TemplateConfig(
                template_id=raw.get("template_id", template_id),
                field_map=raw.get("field_map", {}),
                repeaters=raw.get("repeaters", {}),
                raw=raw,
                pdf_url=raw.get("pdf_url"),
                version=raw.get("version", version)
            )

        except Exception as e:
            print(f"[template_loader] cloud load error: {e}")
            return None

    # ----------------------------------------------------------------------
    # LOCAL LOADER
    # ----------------------------------------------------------------------
    @classmethod
    def _load_from_local(cls, template_id: str, version: str) -> Optional[TemplateConfig]:
        """
        Local template layout:
            filling/templates/acord_126/v2016_09/template.json
        """

        template_dir = cls.local_template_dir / template_id

        # Version folder:
        if version == "latest":
            # Pick the newest version folder
            version_dirs = sorted([d for d in template_dir.iterdir() if d.is_dir()])
            if not version_dirs:
                print("[template_loader] no versions found")
                return None
            version_dir = version_dirs[-1]  # last = latest
        else:
            version_dir = template_dir / version

        json_path = version_dir / "template.json"

        if not json_path.exists():
            print(f"[template_loader] missing local file: {json_path}")
            return None

        try:
            with open(json_path, "r") as f:
                raw = json.load(f)

            return TemplateConfig(
                template_id=raw.get("template_id", template_id),
                field_map=raw.get("field_map", {}),
                repeaters=raw.get("repeaters", {}),
                raw=raw,
                pdf_url=str(version_dir / "template.pdf"),
                version=raw.get("version", version)
            )
        except Exception as e:
            print(f"[template_loader] local load error: {e}")
            return None
