from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence, Union

from ..core.schema import EntityValue, SemanticField, SemanticSection, SourceRef
from ..extractors.mfc import MFC


class SemanticSectionBuilder:
    """Utility helpers to build/flatten semantic sections."""

    @classmethod
    def build(
        cls,
        entities: Dict[str, Sequence[Union[EntityValue, Dict[str, Any]]]],
    ) -> List[SemanticSection]:
        """
        Build semantic sections from a canonical entity map where keys are canonical
        field ids and values are lists of EntityValue (or dict representations).
        """
        sections: List[SemanticSection] = []
        semantic_groups = MFC.semantic_groups() or {}

        for key, group in semantic_groups.items():
            fields: List[SemanticField] = []
            group_fields = group.get("fields") or {}

            for field_id, field_meta in group_fields.items():
                values = entities.get(field_id)
                if not values:
                    continue

                entity_values = [cls._to_entity_value(value) for value in values]

                fields.append(
                    SemanticField(
                        id=field_id,
                        label=field_meta.get("label") or cls._label_for(field_id),
                        type=field_meta.get("type"),
                        aliases=field_meta.get("aliases", []),
                        values=entity_values,
                    )
                )

            if fields:
                sections.append(
                    SemanticSection(
                        key=key,
                        display_name=group.get("display_name"),
                        description=group.get("description"),
                        priority=group.get("priority", 0),
                        icon=group.get("icon"),
                        fields=fields,
                    )
                )

        sections.sort(key=lambda section: (section.priority, section.key))
        return sections

    @staticmethod
    def flatten(
        sections: Iterable[Union[SemanticSection, Dict[str, Any]]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Convert semantic sections (objects or plain dicts) into a legacy entity map.
        Values are returned as JSON-serializable dicts.
        """
        mapping: Dict[str, List[Dict[str, Any]]] = {}
        if not sections:
            return mapping

        for section in sections:
            if isinstance(section, SemanticSection):
                fields_iterable = section.fields
            else:
                fields_iterable = section.get("fields") or []

            for field in fields_iterable:
                if isinstance(field, SemanticField):
                    values = [value.model_dump(mode="json") for value in field.values]
                    field_id = field.id
                else:
                    field_id = field.get("id")
                    raw_values = field.get("values") or []
                    values = [
                        value if isinstance(value, dict) else {"value": value}
                        for value in raw_values
                    ]

                if not field_id:
                    continue
                mapping[field_id] = values

        return mapping

    @staticmethod
    def _to_entity_value(raw: Union[EntityValue, Dict[str, Any]]) -> EntityValue:
        if isinstance(raw, EntityValue):
            return raw

        payload = raw if isinstance(raw, dict) else {"value": raw}
        source_payload = payload.get("source") or {}
        if isinstance(source_payload, SourceRef):
            source = source_payload
        else:
            try:
                source = SourceRef.model_validate(source_payload)
            except Exception:
                source = SourceRef()

        tags = payload.get("tags") or []
        if not isinstance(tags, list):
            tags = [tags]

        confidence = payload.get("confidence", 0.5)
        try:
            confidence_value = float(confidence)
        except (TypeError, ValueError):
            confidence_value = 0.5

        return EntityValue(
            value=payload.get("value"),
            confidence=confidence_value,
            source=source,
            tags=tags,
        )

    @staticmethod
    def _label_for(field_id: str) -> str:
        label = re.sub(r"([A-Z])", r" \1", field_id).strip()
        return re.sub(r"\s+", " ", label)
