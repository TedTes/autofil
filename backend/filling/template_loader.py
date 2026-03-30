import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Optional, List

import requests
import yaml

from services.supabase_storage_service import SupabaseStorageService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RepeaterMapping:
    key: str
    row_ids: List[str]
    columns: Dict[str, str]
    raw: Dict[str, Any]

    @classmethod
    def from_raw(cls, key: str, raw: Any) -> "RepeaterMapping":
        raw_dict = raw if isinstance(raw, dict) else {}
        return cls(
            key=key,
            row_ids=list(raw_dict.get("row_ids", []) or []),
            columns=dict(raw_dict.get("columns", {}) or {}),
            raw=raw_dict,
        )


@dataclass
class TemplateConfig:
    template_id: str
    field_map: Dict[str, str]        # canonical → pdf field name
    repeaters: Dict[str, Any]        # table configs
    raw: Dict[str, Any]              # original JSON contents
    pdf_url: Optional[str] = None    # remote or local PDF path
    version: Optional[str] = None    # e.g. "v2016_09"

    def get_pdf_field(self, canonical_field: str) -> Optional[str]:
        return self.field_map.get(canonical_field)

    def has_pdf_field(self, canonical_field: str) -> bool:
        return canonical_field in self.field_map

    @property
    def repeater_mappings(self) -> Dict[str, RepeaterMapping]:
        return {
            key: RepeaterMapping.from_raw(key, config)
            for key, config in self.repeaters.items()
        }

    def get_repeater(self, key: str) -> Optional[RepeaterMapping]:
        return self.repeater_mappings.get(key)

    @property
    def version_metadata(self) -> Dict[str, Any]:
        return {
            "template_id": self.template_id,
            "version": self.version,
            "pdf_url": self.pdf_url,
        }


class TemplateLoader:
    """
    Loads template JSON files from:
        - Local filesystem (default)
        - Cloud storage (if TEMPLATE_CLOUD_BASE_URL is set)

    Local layouts supported under backend/templates:

    1) Versioned:
        backend/templates/acord_126_2016/v2016_09/template.json
        backend/templates/acord_126_2016/v2016_09/template.pdf

    2) Simple (no version folders):
        backend/templates/acord_126_2016/template.json
        backend/templates/acord_126_2016/template.pdf
    """

    local_template_dir = Path(__file__).resolve().parent.parent / "templates"
    cloud_base_url = os.environ.get("TEMPLATE_CLOUD_BASE_URL")  # optional
    storage_service = SupabaseStorageService()
    storage_templates_root = os.getenv("SUPABASE_TEMPLATES_PREFIX", "templates").strip("/")

    @classmethod
    def load(cls, template_id: str, version: str = "latest") -> Optional[TemplateConfig]:
        """
        High-level loader:
            1) Normalize template_id
            2) Try cloud (if configured)
            3) Fallback to local disk
        """

        # Normalize: accept "acord_126_2016.pdf" or "acord_126_2016"
        template_id = Path(template_id).stem

        # 1. Try Supabase storage if available
        config = cls._load_from_storage(template_id, version)
        if config:
            return config

        # 2. Try cloud URL override
        if cls.cloud_base_url:
            config = cls._load_from_cloud(template_id, version)
            if config:
                return config

        # 3. Fallback local
        return cls._load_from_local(template_id, version)

    @classmethod
    def _load_from_storage(cls, template_id: str, version: str) -> Optional[TemplateConfig]:
        service = getattr(cls, "storage_service", None)
        if not service or not getattr(service, "enabled", False):
            return None

        # Build candidate paths (version-specific first)
        def build_paths(filename: str):
            paths = []
            if version and version != "latest":
                paths.append(service.build_path(cls.storage_templates_root, template_id, version, filename))
            paths.append(service.build_path(cls.storage_templates_root, template_id, filename))
            return paths

        json_text = None
        raw_data: Dict[str, Any] = {}

        for json_path in build_paths("template.json"):
            json_text = service.download_text(json_path)
            if json_text:
                try:
                    raw_data = json.loads(json_text)
                    break
                except json.JSONDecodeError:
                    json_text = None

        if not json_text:
            return None

        # Determine PDF source
        pdf_bytes = None
        pdf_storage_path = raw_data.get("pdf_storage_path")
        pdf_candidates = []
        if isinstance(pdf_storage_path, str):
            pdf_candidates.append(pdf_storage_path)
        pdf_candidates.extend(build_paths("template.pdf"))

        for pdf_path in pdf_candidates:
            if not pdf_path:
                continue
            pdf_bytes = service.download_file(pdf_path)
            if pdf_bytes:
                break

        # Fallback to remote URL if provided
        if not pdf_bytes and raw_data.get("pdf_url"):
            try:
                resp = requests.get(raw_data["pdf_url"], timeout=10)
                if resp.ok:
                    pdf_bytes = resp.content
            except Exception:
                pdf_bytes = None

        pdf_local_path: Optional[Path] = None
        if pdf_bytes:
            cache_dir = Path(tempfile.gettempdir()) / "template_cache" / template_id
            cache_dir.mkdir(parents=True, exist_ok=True)
            pdf_local_path = cache_dir / "template.pdf"
            try:
                with open(pdf_local_path, "wb") as handle:
                    handle.write(pdf_bytes)
            except Exception:
                pdf_local_path = None

        return TemplateConfig(
            template_id=raw_data.get("template_id", template_id),
            field_map=raw_data.get("field_map", {}),
            repeaters=raw_data.get("repeaters", {}),
            raw=raw_data,
            pdf_url=str(pdf_local_path) if pdf_local_path else raw_data.get("pdf_url"),
            version=raw_data.get("version", version),
        )

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
                logger.warning("template_loader cloud missing JSON: %s", json_url)
                return None

            raw = r.json()
            return TemplateConfig(
                template_id=raw.get("template_id", template_id),
                field_map=raw.get("field_map", {}),
                repeaters=raw.get("repeaters", {}),
                raw=raw,
                pdf_url=raw.get("pdf_url"),
                version=raw.get("version", version),
            )

        except Exception as e:
            logger.warning("template_loader cloud load error: %s", e)
            return None

    # ----------------------------------------------------------------------
    # LOCAL LOADER
    # ----------------------------------------------------------------------
    @classmethod
    def _load_from_local(cls, template_id: str, version: str) -> Optional[TemplateConfig]:
        """
        Local template layout inside backend/templates:

        Versioned:
            templates/{template_id}/{version}/template.json
        Simple:
            templates/{template_id}/template.json
        """

        template_dir = cls.local_template_dir / template_id

        # Support legacy "folder per template" layout first
        if template_dir.exists() and template_dir.is_dir():
            if version == "latest":
                try:
                    version_dirs = [d for d in template_dir.iterdir() if d.is_dir()]
                except OSError as e:
                    logger.warning("template_loader iterdir error on %s: %s", template_dir, e)
                    return None

                version_dir = sorted(version_dirs)[-1] if version_dirs else template_dir
            else:
                version_dir = template_dir / version

            template_path = cls._find_template_file(version_dir)
            if not template_path:
                logger.warning("template_loader missing local template file in %s", version_dir)
                return None

            try:
                raw = cls._load_template_contents(template_path)
                pdf_path = cls._resolve_pdf_path(
                    base_dir=version_dir,
                    pdf_ref=raw.get("pdf_url"),
                    default_name="template.pdf",
                )

                return TemplateConfig(
                    template_id=raw.get("template_id", template_id),
                    field_map=raw.get("field_map", {}),
                    repeaters=raw.get("repeaters", {}),
                    raw=raw,
                    pdf_url=pdf_path,
                    version=raw.get("version", version),
                )
            except Exception as e:
                logger.warning("template_loader local load error: %s", e)
                return None

        return cls._load_flat_file(template_id)

    @classmethod
    def _load_flat_file(cls, template_id: str) -> Optional[TemplateConfig]:
        for ext in (".yaml", ".yml", ".json"):
            candidate = cls.local_template_dir / f"{template_id}{ext}"
            if not candidate.exists():
                continue

            try:
                raw = cls._load_template_contents(candidate)
            except Exception as e:
                logger.warning("template_loader failed to read %s: %s", candidate, e)
                return None

            pdf_path = cls._resolve_pdf_path(
                base_dir=candidate.parent,
                pdf_ref=raw.get("pdf_url"),
                default_name="template.pdf",
                fallback_name=f"{candidate.stem}.pdf",
            )

            return TemplateConfig(
                template_id=raw.get("template_id", template_id),
                field_map=raw.get("field_map", {}),
                repeaters=raw.get("repeaters", {}),
                raw=raw,
                pdf_url=pdf_path,
                version=raw.get("version", "latest"),
            )

        logger.warning("template_loader template not found for id=%s", template_id)
        return None

    @classmethod
    def _find_template_file(cls, version_dir: Path) -> Optional[Path]:
        for name in ("template.yaml", "template.yml", "template.json"):
            candidate = version_dir / name
            if candidate.exists():
                return candidate
        return None

    @classmethod
    def _load_template_contents(cls, path: Path) -> Dict[str, Any]:
        if path.suffix.lower() in (".yaml", ".yml"):
            with open(path, "r") as f:
                return yaml.safe_load(f) or {}
        with open(path, "r") as f:
            return json.load(f)

    @staticmethod
    def _resolve_pdf_path(
        *,
        base_dir: Path,
        pdf_ref: Optional[str],
        default_name: Optional[str] = None,
        fallback_name: Optional[str] = None,
    ) -> Optional[str]:
        """
        Resolve template pdf reference into an absolute string path.
        """
        if pdf_ref:
            # URLs should be returned as-is
            if isinstance(pdf_ref, str) and pdf_ref.startswith(("http://", "https://")):
                return pdf_ref
            pdf_path = Path(pdf_ref)
            if not pdf_path.is_absolute():
                pdf_path = (base_dir / pdf_path).resolve()
            return str(pdf_path)

        # fallback to default filenames if provided
        for name in (default_name, fallback_name):
            if not name:
                continue
            candidate = (base_dir / name).resolve()
            if candidate.exists():
                return str(candidate)
            # Even if it doesn't exist yet, still return the location so callers
            # can place/generated output relative to it.
            return str(candidate)

        return None
