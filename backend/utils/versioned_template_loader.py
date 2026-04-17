from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any, Optional, Iterable


@dataclass
class TemplateConfig:
    template_id: str
    version: str
    field_map: Dict[str, str]
    repeaters: Dict[str, Any]
    raw: Dict[str, Any]

    @property
    def pdf_to_canonical(self) -> Dict[str, str]:
        return {pdf_name: canonical for canonical, pdf_name in self.field_map.items()}


class VersionedTemplateLoader:
    def __init__(self, base_dir: Optional[str] = None):
        # Kept for compatibility with older extractors that pass this into
        # TemplateRecognizer. Runtime templates now come from Supabase storage.
        self.base_dir = base_dir

    def load(self, template_id: str) -> Optional[TemplateConfig]:
        from filling.template_loader import TemplateLoader

        config = TemplateLoader.load(template_id)
        if not config:
            return None

        return TemplateConfig(
            template_id=config.template_id,
            version=config.version,
            field_map=config.field_map,
            repeaters=config.repeater_mappings,
            raw=config.raw,
        )


class TemplateRecognizer:
    """
    Detects which template mapping should be used by checking for signature fields.
    Signatures are defined in each template YAML under `signature_fields`.
    """

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = base_dir
        self.signatures = self._load_signatures()

    def detect(self, field_names: Iterable[str]) -> Optional[str]:
        names = set(field_names)
        for template_id, signature in self.signatures.items():
            if signature and signature.issubset(names):
                return template_id

        # fallback: if it only know one template, return it to preserve legacy behavior
        if len(self.signatures) == 1:
            return next(iter(self.signatures))
        return None

    def _load_signatures(self) -> Dict[str, set]:
        from filling.template_loader import TemplateLoader

        signatures: Dict[str, set] = {}
        for name in TemplateLoader.list_template_ids():
            try:
                config = TemplateLoader.load(name)
                fields = (config.raw if config else {}).get("signature_fields", [])
                if fields:
                    signatures[name] = set(fields)
            except Exception:
                continue
        return signatures
