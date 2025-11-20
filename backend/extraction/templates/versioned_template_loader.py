from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Optional, Iterable

import yaml


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
        if base_dir:
            self.base_dir = Path(base_dir)
        else:
            self.base_dir = Path(__file__).resolve().parent

    def load(self, template_id: str) -> Optional[TemplateConfig]:
        template_path = self.base_dir / f"{template_id}.yaml"
        if not template_path.exists():
            print(f"[VersionedTemplateLoader] template not found: {template_path}")
            return None

        with open(template_path, "r") as f:
            data = yaml.safe_load(f) or {}

        return TemplateConfig(
            template_id=data.get("template_id", template_id),
            version=data.get("version", "latest"),
            field_map=data.get("field_map", {}),
            repeaters=data.get("repeaters", {}),
            raw=data,
        )


class TemplateRecognizer:
    """
    Detects which template mapping should be used by checking for signature fields.
    Signatures are defined in each template YAML under `signature_fields`.
    """

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir) if base_dir else VersionedTemplateLoader().base_dir
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
        signatures: Dict[str, set] = {}
        if not self.base_dir.exists():
            return signatures

        for template_file in self.base_dir.glob("*.yaml"):
            try:
                with open(template_file, "r") as f:
                    data = yaml.safe_load(f) or {}
                fields = data.get("signature_fields", [])
                if fields:
                    signatures[template_file.stem] = set(fields)
            except Exception:
                continue
        return signatures
