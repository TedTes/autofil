from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from extraction.utils.semantic_section_builder import SemanticSectionBuilder


@dataclass(frozen=True)
class ProjectedField:
    """Projected canonical field values for fill/export consumers."""

    field_id: str
    values: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def first(self) -> Optional[Dict[str, Any]]:
        return self.values[0] if self.values else None

    @property
    def first_value(self) -> Any:
        first = self.first or {}
        return first.get("value")

    def scalar_value(self) -> Any:
        """Return the first scalar-ish value for this field."""
        value = self.first_value
        if isinstance(value, list):
            return None
        return value

    def rows(self) -> List[Dict[str, Any]]:
        """Return repeated row objects for this field."""
        rows: List[Dict[str, Any]] = []
        for item in self.values:
            value = item.get("value")
            if isinstance(value, dict):
                if any(v not in ("", None) for v in value.values()):
                    rows.append(value)
            elif isinstance(value, list):
                for row in value:
                    if isinstance(row, dict) and any(v not in ("", None) for v in row.values()):
                        rows.append(row)
        return rows


@dataclass
class CanonicalFillView:
    """Normalized view of canonical data for fillers and exporters."""

    entities: Dict[str, ProjectedField] = field(default_factory=dict)

    @classmethod
    def from_canonical(cls, canonical_data: Dict[str, Any]) -> "CanonicalFillView":
        sections = (
            canonical_data.get("semantic_sections")
            or canonical_data.get("semanticSections")
            or []
        )
        entity_map = SemanticSectionBuilder.flatten(sections)
        return cls(
            entities={
                field_id: ProjectedField(field_id=field_id, values=list(values or []))
                for field_id, values in entity_map.items()
            }
        )

    def get(self, field_id: str) -> ProjectedField:
        return self.entities.get(field_id, ProjectedField(field_id=field_id))

    def first_value(self, field_id: str) -> Any:
        return self.get(field_id).first_value

    def scalar_fields(self, exclude: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        excluded = set(exclude or [])
        projected: Dict[str, Any] = {}
        for field_id, field in self.entities.items():
            if field_id in excluded:
                continue
            value = field.scalar_value()
            if value in (None, ""):
                continue
            projected[field_id] = value
        return projected

    def repeated_rows(self, *field_ids: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for field_id in field_ids:
            rows.extend(self.get(field_id).rows())
        return rows
