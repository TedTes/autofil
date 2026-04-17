import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Optional, List, Iterable

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
    form_type: str
    field_map: Dict[str, str]        # canonical → pdf field name
    repeaters: Dict[str, Any]        # table configs
    raw: Dict[str, Any]              # original JSON contents
    name: Optional[str] = None
    description: str = ""
    pdf_url: Optional[str] = None    # remote or local PDF path
    version: Optional[str] = None    # e.g. "v2016_09"
    required_data_sections: List[str] = None
    optional_data_sections: List[str] = None
    expected_documents: List[str] = None
    estimated_fields: int = 0
    icon: Optional[str] = None
    is_popular: bool = False

    def __post_init__(self) -> None:
        self.required_data_sections = list(self.required_data_sections or [])
        self.optional_data_sections = list(self.optional_data_sections or [])
        self.expected_documents = list(self.expected_documents or [])
        self.field_map = dict(self.field_map or {})
        self.repeaters = dict(self.repeaters or {})
        self.raw = dict(self.raw or {})
        self.name = self.name or self.template_id

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
            "form_type": self.form_type,
            "version": self.version,
            "pdf_url": self.pdf_url,
        }

    def to_library_dict(self, template_url: Optional[str] = None) -> Dict[str, Any]:
        return {
            "id": self.template_id,
            "name": self.name,
            "description": self.description,
            "formType": self.form_type,
            "requiredDataSections": self.required_data_sections,
            "optionalDataSections": self.optional_data_sections,
            "estimatedFields": self.estimated_fields,
            "version": self.version,
            "icon": self.icon,
            "isPopular": self.is_popular,
            "templateUrl": template_url or self.pdf_url,
            "expectedDocuments": self.expected_documents,
        }


class TemplateLoader:
    """
    Loads template definitions and fillable PDFs from Supabase storage.

    Template storage is the runtime source of truth. Local YAML files under
    backend/templates are field-catalog/development references only and are not
    used as a fallback for generated outputs.
    """

    storage_service = SupabaseStorageService()
    storage_templates_root = os.getenv("SUPABASE_TEMPLATES_PREFIX", "templates").strip("/")

    @classmethod
    def load(cls, template_id: str, version: str = "latest") -> Optional[TemplateConfig]:
        """
        Load a template from Supabase storage only.
        """
        template_id = Path(template_id).stem
        config = cls._load_from_storage(template_id, version)
        if config:
            return config

        inferred_form_type = cls._infer_form_type(template_id)
        if inferred_form_type:
            config = cls.load_matching(
                form_type=inferred_form_type,
                preferred_template_ids=[template_id, cls._base_template_prefix(template_id)],
                version=version,
            )
            if config:
                return config

        logger.warning(
            "template_loader storage template not found for template=%s version=%s",
            template_id,
            version,
        )
        return None

    @classmethod
    def list_template_ids(cls) -> List[str]:
        service = getattr(cls, "storage_service", None)
        if not service or not getattr(service, "enabled", False):
            return []

        template_ids = set()
        for entry in service.list_objects(cls.storage_templates_root):
            name = (entry.get("name") or "").strip("/")
            if not name or entry.get("metadata"):
                continue
            template_ids.add(name)
        return sorted(template_ids)

    @classmethod
    def load_matching(
        cls,
        *,
        form_type: str,
        preferred_template_ids: Optional[Iterable[str]] = None,
        field_names: Optional[Iterable[str]] = None,
        version: str = "latest",
    ) -> Optional[TemplateConfig]:
        """
        Resolve a template by form type when the exact versioned folder is not
        known. This is used during extraction: the uploaded PDF tells us the
        ACORD form type, and Supabase tells us which concrete versions exist.
        """
        normalized_form_type = (form_type or "").strip().upper()
        names = set(field_names or [])

        candidates: List[str] = []
        for template_id in preferred_template_ids or []:
            normalized = Path(str(template_id)).stem
            if normalized:
                candidates.append(normalized)

        discovered = cls.list_template_ids()
        prefixes = tuple(f"{candidate}_" for candidate in candidates)
        for template_id in discovered:
            if template_id in candidates or (prefixes and template_id.startswith(prefixes)):
                candidates.append(template_id)

        form_slug = normalized_form_type.lower()
        for template_id in discovered:
            if template_id.startswith(form_slug.lower()):
                candidates.append(template_id)

        seen = set()
        loaded: List[TemplateConfig] = []
        for template_id in candidates:
            if template_id in seen:
                continue
            seen.add(template_id)
            config = cls._load_from_storage(template_id, version)
            if not config:
                continue
            if normalized_form_type and (config.form_type or "").upper() != normalized_form_type:
                continue
            loaded.append(config)

        if not loaded:
            return None

        signature_match = cls._best_signature_match(loaded, names)
        if signature_match:
            return signature_match

        overlap_match = cls._best_field_overlap_match(loaded, names)
        if overlap_match:
            return overlap_match

        return sorted(loaded, key=lambda config: (config.version or "", config.template_id))[-1]

    @staticmethod
    def _best_signature_match(
        configs: List[TemplateConfig],
        field_names: set[str],
    ) -> Optional[TemplateConfig]:
        if not field_names:
            return None

        best: Optional[TemplateConfig] = None
        best_score = 0
        for config in configs:
            signature = set(config.raw.get("signature_fields") or [])
            if not signature:
                continue
            score = len(signature & field_names)
            if score == len(signature):
                return config
            if score > best_score:
                best = config
                best_score = score
        return best if best_score > 0 else None

    @classmethod
    def _best_field_overlap_match(
        cls,
        configs: List[TemplateConfig],
        field_names: set[str],
    ) -> Optional[TemplateConfig]:
        if not field_names:
            return None

        best: Optional[TemplateConfig] = None
        best_score = 0
        normalized_names = {cls._normalize_field_name(name) for name in field_names}
        for config in configs:
            mapped_fields = set(config.field_map.values())
            score = len(mapped_fields & field_names)
            if score == 0:
                score = len({cls._normalize_field_name(name) for name in mapped_fields} & normalized_names)
            if score > best_score:
                best = config
                best_score = score
        return best if best_score > 0 else None

    @staticmethod
    def _normalize_field_name(value: str) -> str:
        return "".join(ch for ch in str(value or "").lower() if ch.isalnum())

    @staticmethod
    def _infer_form_type(template_id: str) -> Optional[str]:
        parts = str(template_id or "").lower().split("_")
        if len(parts) >= 2 and parts[0] == "acord" and parts[1].isdigit():
            return f"ACORD_{parts[1]}"
        return None

    @staticmethod
    def _base_template_prefix(template_id: str) -> str:
        parts = str(template_id or "").lower().split("_")
        if len(parts) >= 2 and parts[0] == "acord" and parts[1].isdigit():
            return f"acord_{parts[1]}"
        return str(template_id or "")

    @classmethod
    def _build_config(
        cls,
        raw_data: Dict[str, Any],
        *,
        template_id: str,
        version: str,
        pdf_url: Optional[str],
    ) -> TemplateConfig:
        field_map = raw_data.get("field_map", {}) or {}
        repeaters = raw_data.get("repeaters", {}) or {}
        estimated_fields = int(raw_data.get("estimated_fields") or raw_data.get("estimatedFields") or 0)
        if estimated_fields <= 0 and isinstance(field_map, dict):
            estimated_fields = len(field_map)
        if estimated_fields <= 0 and isinstance(repeaters, dict):
            estimated_fields = sum(
                len((repeater or {}).get("columns", {}) or {}) * max(len((repeater or {}).get("row_ids", []) or []), 1)
                for repeater in repeaters.values()
                if isinstance(repeater, dict)
            )

        config = TemplateConfig(
            # The requested/discovered template id is authoritative. This keeps
            # the selected frontend id, storage folder name, and runtime fill
            # path aligned even if a YAML file still contains stale metadata.
            template_id=template_id,
            form_type=raw_data.get("form_type") or raw_data.get("formType") or "CUSTOM",
            field_map=field_map,
            repeaters=repeaters,
            raw=raw_data,
            name=raw_data.get("name"),
            description=raw_data.get("description", ""),
            pdf_url=pdf_url,
            version=raw_data.get("version", version),
            required_data_sections=raw_data.get("required_data_sections") or raw_data.get("requiredDataSections"),
            optional_data_sections=raw_data.get("optional_data_sections") or raw_data.get("optionalDataSections"),
            expected_documents=raw_data.get("expected_documents") or raw_data.get("expectedDocuments"),
            estimated_fields=estimated_fields,
            icon=raw_data.get("icon"),
            is_popular=bool(raw_data.get("is_popular") or raw_data.get("isPopular", False)),
        )
        cls._validate_config(config)
        return config

    @staticmethod
    def _validate_config(config: TemplateConfig) -> None:
        if not config.template_id:
            raise ValueError("template_id is required")
        if not config.form_type:
            raise ValueError(f"form_type is required for template {config.template_id}")
        if not isinstance(config.field_map, dict):
            raise ValueError(f"field_map must be a mapping for template {config.template_id}")
        if not isinstance(config.repeaters, dict):
            raise ValueError(f"repeaters must be a mapping for template {config.template_id}")

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

        config_text = None
        raw_data: Dict[str, Any] = {}

        config_candidates = []
        for name in ("template.yaml", "template.yml", "template.json"):
            config_candidates.extend(build_paths(name))

        for config_path in config_candidates:
            config_text = service.download_text(config_path)
            if not config_text:
                continue
            try:
                if config_path.endswith((".yaml", ".yml")):
                    raw_data = yaml.safe_load(config_text) or {}
                else:
                    raw_data = json.loads(config_text)
                break
            except (json.JSONDecodeError, yaml.YAMLError):
                config_text = None

        if not config_text:
            logger.debug(
                "template_loader storage config not found for template=%s version=%s",
                template_id,
                version,
            )
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

        return cls._build_config(
            raw_data,
            template_id=template_id,
            version=version,
            pdf_url=str(pdf_local_path) if pdf_local_path else None,
        )
