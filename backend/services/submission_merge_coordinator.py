"""Canonical submission input merge helpers."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from extraction.extractors.mfc import MFC
from extraction.utils.field_value_validator import FieldValueValidator
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
        sources: List[Dict[str, Any]] = []
        for entry in inputs:
            data = self.load_input_data(entry)
            if not data:
                continue
            sources.append(self.input_source_summary(entry, data))
            annotated = self.annotate_input_provenance(copy.deepcopy(data), entry)
            deduped = self.dedupe_entity_values(annotated)
            cleaned = self.clean_entities(deduped)
            merged = self.deep_merge_dict(merged, cleaned)

        merged = self.dedupe_entity_values(merged)
        merged = self.clean_entities(merged)
        merged = self.clean_raw_mapped_fields(merged)
        return self.with_package_source(merged, sources)

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
                key=lambda entry: (
                    float(entry.get("confidence") or 0),
                    self.source_quality_score(entry),
                ),
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
                if not FieldValueValidator.is_valid(field_id, payload.get("value")):
                    continue
                cleaned_list.append(payload)

            if cleaned_list:
                cleaned_entities[field_id] = cleaned_list

        updated = copy.deepcopy(data)
        updated["semantic_sections"] = self.entity_map_to_semantic_sections(cleaned_entities)
        return updated

    def clean_raw_mapped_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data

        raw = data.get("raw")
        if not isinstance(raw, dict):
            return data

        updated = copy.deepcopy(data)
        updated_raw = copy.deepcopy(raw)
        for key in ("mapped_fields", "shared_fields"):
            field_map = updated_raw.get(key)
            if not isinstance(field_map, dict):
                continue
            updated_raw[key] = {
                field_id: value
                for field_id, value in field_map.items()
                if self.is_raw_field_value_valid(field_id, value)
            }
        updated["raw"] = updated_raw
        return updated

    @staticmethod
    def is_raw_field_value_valid(field_id: str, value: Any) -> bool:
        if SubmissionMergeCoordinator.is_noise_value(value):
            return False
        if isinstance(value, (dict, list)):
            return True
        return FieldValueValidator.is_valid(field_id, value)

    def semantic_sections_to_entity_map(self, data: Dict[str, Any]) -> Dict[str, List[Any]]:
        sections = data.get("semantic_sections") or data.get("semanticSections") or []
        return SemanticSectionBuilder.flatten(sections)

    def annotate_input_provenance(
        self,
        data: Dict[str, Any],
        entry: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data

        source_file = entry.get("filename")
        input_id = entry.get("input_id")
        document_type = entry.get("document_type") or entry.get("documentType")
        entity_map = self.semantic_sections_to_entity_map(data)
        if not entity_map:
            return data

        annotated_map: Dict[str, List[Dict[str, Any]]] = {}
        for field_id, values in entity_map.items():
            annotated_values: List[Dict[str, Any]] = []
            for value in values if isinstance(values, list) else [values]:
                payload = copy.deepcopy(value if isinstance(value, dict) else {"value": value})
                source = payload.get("source")
                if not isinstance(source, dict):
                    source = {}
                if source_file:
                    source["source_file"] = source_file
                if input_id:
                    source["input_id"] = input_id
                if document_type:
                    source["document_type"] = str(document_type)
                payload["source"] = source
                annotated_values.append(payload)
            annotated_map[field_id] = annotated_values

        updated = copy.deepcopy(data)
        updated["semantic_sections"] = self.entity_map_to_semantic_sections(annotated_map)
        return updated

    @staticmethod
    def input_source_summary(entry: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        metadata = data.get("metadata") if isinstance(data, dict) else {}
        source = data.get("source") if isinstance(data, dict) else {}
        return {
            "input_id": entry.get("input_id"),
            "file_name": entry.get("filename") or (source or {}).get("file_name"),
            "document_type": entry.get("document_type") or entry.get("documentType"),
            "form_type_detected": (metadata or {}).get("form_type_detected"),
            "line_of_business": (metadata or {}).get("line_of_business"),
            "confidence": entry.get("confidence"),
            "included_in_merge": entry.get("included_in_merge", True),
            "uploaded_at": entry.get("uploaded_at"),
        }

    @staticmethod
    def with_package_source(data: Dict[str, Any], sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            return data
        updated = copy.deepcopy(data)
        filtered_sources = [
            source for source in sources
            if source.get("file_name") or source.get("input_id")
        ]
        updated["source"] = {
            "file_name": "merged_submission",
            "file_type": "package",
            "extraction_method": "multi_document_merge",
            "extracted_at": datetime.utcnow().isoformat(),
        }
        updated["sources"] = filtered_sources
        raw = updated.get("raw") if isinstance(updated.get("raw"), dict) else {}
        raw["merged_input_count"] = len(filtered_sources)
        raw["merged_input_filenames"] = [
            source["file_name"] for source in filtered_sources if source.get("file_name")
        ]
        updated["raw"] = raw
        metadata = updated.get("metadata") if isinstance(updated.get("metadata"), dict) else {}
        form_types = sorted(
            {
                str(source.get("form_type_detected"))
                for source in filtered_sources
                if source.get("form_type_detected")
            }
        )
        lines_of_business = sorted(
            {
                str(source.get("line_of_business"))
                for source in filtered_sources
                if source.get("line_of_business")
            }
        )
        metadata.update(
            {
                "form_type_detected": "MULTI_DOCUMENT_PACKAGE",
                "line_of_business": "Multi-line" if len(lines_of_business) > 1 else (lines_of_business[0] if lines_of_business else None),
                "included_form_types": form_types,
                "included_lines_of_business": lines_of_business,
            }
        )
        updated["metadata"] = metadata
        return updated

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

    @staticmethod
    def source_quality_score(entry: Dict[str, Any]) -> int:
        source = entry.get("source") if isinstance(entry, dict) else {}
        extraction_rule = ""
        if isinstance(source, dict):
            extraction_rule = str(source.get("extraction_rule") or "").lower()
        tags = entry.get("tags") if isinstance(entry, dict) else []
        tag_text = " ".join(str(tag).lower() for tag in tags) if isinstance(tags, list) else str(tags).lower()

        if "template" in extraction_rule or "template" in tag_text:
            return 30
        if "pdf_field" in extraction_rule or "fillable_pdf" in tag_text:
            return 20
        if "ocr" in extraction_rule or "ocr" in tag_text:
            return 10
        return 0

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
