"""Compatibility helpers for submission templates backed by YAML configs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from filling.template_loader import TemplateLoader, TemplateConfig


@dataclass(frozen=True)
class SubmissionTemplate:
    """Thin compatibility view over a normalized fill template config."""

    template_id: str
    name: str
    description: str
    expected_documents: List[str]
    suggested_forms: List[str]
    expected_fields: List[str]
    form_type: str
    version: str | None = None

    @classmethod
    def from_config(cls, config: TemplateConfig) -> "SubmissionTemplate":
        return cls(
            template_id=config.template_id,
            name=config.name or config.template_id,
            description=config.description,
            expected_documents=list(config.expected_documents or []),
            suggested_forms=[config.template_id],
            expected_fields=sorted(config.field_map.keys()),
            form_type=config.form_type,
            version=config.version,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "template_id": self.template_id,
            "name": self.name,
            "description": self.description,
            "expected_documents": self.expected_documents,
            "suggested_forms": self.suggested_forms,
            "expected_fields": self.expected_fields,
            "form_type": self.form_type,
            "version": self.version,
        }


def _discover_template_ids() -> List[str]:
    return TemplateLoader.list_template_ids()


def _load_templates() -> Dict[str, SubmissionTemplate]:
    templates: Dict[str, SubmissionTemplate] = {}
    for template_id in _discover_template_ids():
        config = TemplateLoader.load(template_id)
        if not config:
            continue
        if not config.field_map:
            continue
        template = SubmissionTemplate.from_config(config)
        templates[template.template_id] = template
    return templates


TEMPLATES: Dict[str, SubmissionTemplate] = _load_templates()


def get_template(template_id: str) -> SubmissionTemplate:
    if template_id not in TEMPLATES:
        raise ValueError(f"Template '{template_id}' not found")
    return TEMPLATES[template_id]


def list_templates() -> List[Dict[str, Any]]:
    return [template.to_dict() for template in TEMPLATES.values()]


def get_template_metadata(template_id: str) -> Dict[str, Any]:
    template = get_template(template_id)
    return {
        "template_id": template.template_id,
        "name": template.name,
        "description": template.description,
        "form_type": template.form_type,
        "version": template.version,
    }
