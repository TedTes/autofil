"""Canonical submission input merge helpers."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any, Callable, Dict, List, Optional

from extraction.extractors.mfc import MFC
from extraction.utils.semantic_section_builder import SemanticSectionBuilder


class SubmissionMergeCoordinator:
    """Merge canonical extraction payloads from multiple submission inputs."""

    def __init__(
        self,
        *,
        load_input_data: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
    ) -> None:
        self.load_input_data = load_input_data

    def merge_inputs(self, inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not inputs:
            return {}

        merged: Dict[str, Any] = {}
        for entry in inputs:
            data = self.load_input_data(entry)
            if not data:
                continue
            deduped = self.dedupe_entity_values(copy.deepcopy(data))
            cleaned = self.clean_entities(deduped)
            merged = self.deep_merge_dict(merged, cleaned)

        merged = self.dedupe_entity_values(merged)
        return self.clean_entities(merged)

    def compute_extraction_hash(self, data: Any) -> str:
        canonical_data = self._canonicalize_value_for_hash(data)
        canonical_json = json.dumps(canonical_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    def normalize_entity_value(self, value: Any) -> str:
        canonical = self._canonicalize_value_for_hash(value)
        return json.dumps(canonical, sort_keys=True, separators=(",", ":"))

    def dedupe_entity_values(self, data: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data

        entity_map = self.semantic_sections_to_entity_map(data)
        if not entity_map:
            return data

        deduped_map: Dict[str, List[Dict[str, Any]]] = {}
        for key, values in entity_map.items():
            if not isinstance(values, list):
                continue

            seen: set[str] = set()
            deduped: List[Dict[str, Any]] = []
            for entry in values:
                payload = entry if isinstance(entry, dict) else {"value": entry}
                normalized = self.normalize_entity_value(payload.get("value"))
                if normalized in seen:
                    continue
                seen.add(normalized)
                deduped.append(payload)

            deduped.sort(
                key=lambda entry: float(entry.get("confidence") or 0),
                reverse=True,
            )

            if not self.field_allows_multiple(key) and deduped:
                deduped_map[key] = [deduped[0]]
            elif deduped:
                deduped_map[key] = deduped

        updated = copy.deepcopy(data)
        updated["semantic_sections"] = self.entity_map_to_semantic_sections(deduped_map)
        return updated

    def clean_entities(self, data: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data

        entity_map = self.semantic_sections_to_entity_map(data)
        if not entity_map:
            return data

        cleaned_entities: Dict[str, List[Dict[str, Any]]] = {}
        for field_id, values in entity_map.items():
            field_meta = MFC.field(field_id)
            if not field_meta:
                continue

            cleaned_list: List[Dict[str, Any]] = []
            values = values if isinstance(values, list) else [values]
            for entry in values:
                payload = entry if isinstance(entry, dict) else {"value": entry}
                if self.is_noise_value(payload.get("value")):
                    continue
                cleaned_list.append(payload)

            if cleaned_list:
                cleaned_entities[field_id] = cleaned_list

        updated = copy.deepcopy(data)
        updated["semantic_sections"] = self.entity_map_to_semantic_sections(cleaned_entities)
        return updated

    def semantic_sections_to_entity_map(self, data: Dict[str, Any]) -> Dict[str, List[Any]]:
        sections = data.get("semantic_sections") or data.get("semanticSections") or []
        return SemanticSectionBuilder.flatten(sections)

    def entity_map_to_semantic_sections(
        self,
        entity_map: Dict[str, List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        if not entity_map:
            return []
        sections = SemanticSectionBuilder.build(entity_map)
        return [section.model_dump(mode="json") for section in sections]

    def deep_merge_dict(self, base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
        if not base:
            return copy.deepcopy(incoming)
        for key, value in incoming.items():
            if key == "semantic_sections":
                existing_map = self.semantic_sections_to_entity_map({"semantic_sections": base.get(key, [])})
                incoming_map = self.semantic_sections_to_entity_map({"semantic_sections": value})
                for field_id, vals in incoming_map.items():
                    existing_map.setdefault(field_id, []).extend(vals)
                base[key] = self.entity_map_to_semantic_sections(existing_map)
                continue
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self.deep_merge_dict(base[key], value)
            elif key in base and isinstance(base[key], list) and isinstance(value, list):
                base[key].extend(value)
            else:
                base[key] = copy.deepcopy(value)
        return base

    def field_allows_multiple(self, field_id: str) -> bool:
        field_meta = MFC.field(field_id) or {}
        cardinality = str(field_meta.get("cardinality", "")).lower()
        return "many" in cardinality

    @staticmethod
    def is_noise_value(value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                return True
            if normalized in {"n/a", "na", "none", "null", "--"}:
                return True
        return False

    def _canonicalize_value_for_hash(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._canonicalize_value_for_hash(value[key])
                for key in sorted(value.keys())
            }
        if isinstance(value, list):
            return [self._canonicalize_value_for_hash(item) for item in value]
        if isinstance(value, str):
            collapsed = re.sub(r"\s+", " ", value.strip().lower())
            numeric_candidate = re.sub(r"[,$]", "", collapsed)
            if re.fullmatch(r"[-+]?\d+(\.\d+)?", numeric_candidate):
                try:
                    return float(numeric_candidate)
                except ValueError:
                    pass
            return collapsed
        return value
