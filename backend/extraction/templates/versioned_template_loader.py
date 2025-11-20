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
    Simple heuristics to decide which ACORD 126 template version is being processed.
    """

    def __init__(self):
        self.known_signatures = {
            "acord_126_2016": {
                "required_fields": {
                    "GeneralLiability_OccurrenceIndicator_A",
                    "GeneralLiabilityLineOfBusiness_TotalPremiumAmount_A",
                }
            }
        }

    def detect(self, field_names: Iterable[str]) -> Optional[str]:
        names = set(field_names)
        for template_id, cfg in self.known_signatures.items():
            if cfg["required_fields"].issubset(names):
                return template_id
        # Default to latest known template if nothing matches
        return "acord_126_2016" if names else None
