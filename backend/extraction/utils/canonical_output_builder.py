from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

from ..core.document import Document
from ..core.schema import (
    CanonicalOutput,
    EntityValue,
    Metadata,
    SemanticField,
    SemanticSection,
    SourceInfo,
    SourceRef,
)


@dataclass
class SectionPayload:
    """Simple description of an ad-hoc semantic section."""

    key: str
    fields: Dict[str, Any]
    display_name: Optional[str] = None
    description: Optional[str] = None
    priority: int = 0
    icon: Optional[str] = None


def build_generic_canonical_output(
    document: Document,
    *,
    section_payloads: Sequence[SectionPayload],
    extraction_method: str,
    metadata: Optional[Metadata] = None,
    raw: Optional[Dict[str, Any]] = None,
    default_confidence: float = 0.85,
) -> CanonicalOutput:
    """
    Build a CanonicalOutput for extractors that do not rely on the MFC mapping.
    """
    sections = [
        _build_section(payload, default_confidence) for payload in section_payloads
    ]
    sections = [section for section in sections if section.fields]

    file_type = _infer_file_type(document)
    meta = metadata or Metadata(
        form_type_detected=document.document_type.value.upper(),
        line_of_business=document.metadata.get("line_of_business")
        if hasattr(document, "metadata")
        else None,
    )

    return CanonicalOutput(
        job_id=document.job_id,
        source=SourceInfo(
            file_name=document.file_name,
            file_type=file_type,
            extraction_method=extraction_method,
            extracted_at=datetime.utcnow(),
        ),
        semantic_sections=sections,
        metadata=meta,
        raw=raw,
    )


def _build_section(payload: SectionPayload, default_confidence: float) -> SemanticSection:
    fields: List[SemanticField] = []
    for field_id, value in payload.fields.items():
        entity_values = _ensure_entity_values(value, default_confidence)
        if not entity_values:
            continue
        fields.append(SemanticField(id=field_id, values=entity_values))

    return SemanticSection(
        key=payload.key,
        display_name=payload.display_name,
        description=payload.description,
        priority=payload.priority,
        icon=payload.icon,
        fields=fields,
    )


def _ensure_entity_values(
    value: Any, default_confidence: float
) -> List[EntityValue]:
    """
    Convert arbitrary python data into a list of EntityValue.
    """
    if value is None:
        return []

    if isinstance(value, EntityValue):
        return [value]

    if isinstance(value, list):
        values: List[EntityValue] = []
        for item in value:
            ev = _coerce_entity_value(item, default_confidence)
            if ev:
                values.append(ev)
        return values

    ev = _coerce_entity_value(value, default_confidence)
    return [ev] if ev else []


def _coerce_entity_value(value: Any, default_confidence: float) -> Optional[EntityValue]:
    if value is None:
        return None

    if isinstance(value, EntityValue):
        return value

    # Allow dicts shaped like {"value": ..., "confidence": ..., "source": ...}
    if isinstance(value, dict) and "value" in value:
        confidence = float(value.get("confidence", default_confidence))
        source_payload = value.get("source") or {}
        if isinstance(source_payload, SourceRef):
            source = source_payload
        else:
            try:
                source = SourceRef.model_validate(source_payload)
            except Exception:
                source = None

        tags = value.get("tags") or []
        if not isinstance(tags, list):
            tags = [tags]

        return EntityValue(
            value=value.get("value"),
            confidence=confidence,
            source=source,
            tags=tags,
        )

    # Any other object/dict is treated as the extracted value itself
    return EntityValue(value=value, confidence=default_confidence)


def _infer_file_type(document: Document) -> str:
    ext = (document.file_extension or "").lower()
    if ext in (".xlsx", ".xls"):
        return "excel"
    if ext == ".csv":
        return "csv"
    if ext in (".doc", ".docx"):
        return "docx"
    return "pdf"
