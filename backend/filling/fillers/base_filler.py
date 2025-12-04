from __future__ import annotations

import re
from dataclasses import dataclass
from typing import ClassVar, Dict, List, Optional, Type, Any

from extraction.utils.semantic_section_builder import SemanticSectionBuilder


@dataclass
class FillReport:
    """Summary of how well a filler populated a PDF/form output."""
    success: bool
    coverage: float                # 0.0 → 1.0
    filled_fields: int
    unmapped_fields: List[str]
    warnings: List[str]
    errors: List[str]


class BaseFiller:
    """Base class for all PDF/DOCX/FORM fillers. Provides common utilities."""

    form_type: str = "GENERIC"
    supported_templates: ClassVar[List[str]] = []
    _registry: ClassVar[Dict[str, Type['BaseFiller']]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        for template_id in getattr(cls, "supported_templates", []) or []:
            normalized = cls._normalize_template_id(template_id)
            if normalized:
                BaseFiller._registry[normalized] = cls

    def __init__(self):
        pass

    @staticmethod
    def _normalize_template_id(template_id: str) -> str:
        return re.sub(r"[^a-z0-9_-]+", "", template_id.lower())

    @classmethod
    def resolve_filler(cls, template_id: str) -> Type['BaseFiller']:
        normalized = cls._normalize_template_id(template_id)
        for key, filler_cls in cls._registry.items():
            if normalized == key or normalized.startswith(f"{key}_"):
                return filler_cls
        raise ValueError(f"No filler registered for template {template_id}")

    # -------------------------------------------------------------- #
    # Public API
    # -------------------------------------------------------------- #
    def fill_from_canonical(
        self,
        canonical_data: dict,
        output_path: str,
        template_id: str,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ):
        """
        Child classes must implement this.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__}.fill_from_canonical must be implemented by subclass."
        )

    def fill(
        self,
        canonical_data: dict,
        output_path: str,
        template_id: Optional[str] = None,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ):
        """
        Thin wrapper around fill_from_canonical.

        Child fillers can ignore template_version if they don't need it.
        """
        return self.fill_from_canonical(
            canonical_data=canonical_data,
            output_path=output_path,
            template_id=template_id or "",
            template_version=template_version,
            template_pdf_override=template_pdf_override,
        )

    # -------------------------------------------------------------- #
    # Shared canonical → template mapping
    # -------------------------------------------------------------- #
    def _canonical_to_template_fields(
        self,
        canonical: Dict[str, Any],
        template: Any = None,   # TemplateConfig-like, but not strictly required
    ) -> Dict[str, Any]:
        """
        Map CanonicalOutput.to_dict() -> flat fields for the filler.

        Strategy:
          - For most entities: take the first .value
          - For 'Classification': build a list of row dicts from .value
          - Optionally could filter by template.field_map keys in future.

        Expected canonical structure:

        {
          "entities": {
            "InsuredName": [
              { "value": "Acme Inc", "confidence": 0.98, ... },
              ...
            ],
            "Classification": [
              { "value": { "class_code": "1234", "exposure": "10000", ... }, ... },
              ...
            ]
          },
          ...
        }
        """
        sections = canonical.get("semantic_sections") or canonical.get("semanticSections") or []
        entities = SemanticSectionBuilder.flatten(sections)
        flat: Dict[str, Any] = {}

        # --- 1) Generic scalar mapping: first value of each entity ----------
        for field_id, values in entities.items():
            if not values:
                continue

            # Classification is handled separately below
            if field_id == "Classification":
                continue

            first = values[0]
            value = first.get("value")

            # Skip empty / None
            if value is None or value == "":
                continue

            flat[field_id] = value

        # --- 2) Classification repeater mapping -----------------------------
        class_entities = entities.get("Classification") or []
        rows = []

        for ev in class_entities:
            row = ev.get("value")
            # Expect row to be a dict with columns like { "class_code": "...", ... }
            if isinstance(row, dict):
                # Filter out completely empty rows {} or all empty/None
                if any(v not in ("", None, "") for v in row.values()):
                    rows.append(row)

        if rows:
            flat["Classification"] = rows

        return flat

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} form_type={self.form_type}>"
