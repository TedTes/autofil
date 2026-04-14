from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from ..core.document import Document
from ..core.schema import CanonicalOutput, SourceRef
from ..models.extraction_result import ExtractionResult
from ..utils.semantic_section_builder import SemanticSectionBuilder


class BaseExtractor(ABC):
    def _source_ref_for_pdf_field(
        self,
        field_name: str,
        field_metadata: Optional[Dict[str, Dict[str, Any]]],
        extraction_rule: str,
    ) -> SourceRef:
        metadata = (field_metadata or {}).get(field_name) or {}
        return SourceRef(
            page=metadata.get("page") or 1,
            bbox=metadata.get("bbox"),
            extraction_rule=extraction_rule,
        )

    def _build_field_provenance(self, canonical: CanonicalOutput) -> Dict[str, List[Dict[str, Any]]]:
        entity_map = SemanticSectionBuilder.flatten(canonical.semantic_sections)
        raw = canonical.raw or {}
        field_evidence = raw.get("field_evidence", {}) if isinstance(raw, dict) else {}
        provenance: Dict[str, List[Dict[str, Any]]] = {}

        for field_id, values in entity_map.items():
            evidence = field_evidence.get(field_id)
            provenance[field_id] = []
            for index, value in enumerate(values):
                if not isinstance(value, dict):
                    continue
                source = value.get("source")
                if not isinstance(source, dict):
                    continue

                entry = {
                    **source,
                    "source_file": canonical.source.file_name,
                    "extraction_method": canonical.source.extraction_method,
                }
                if isinstance(evidence, list) and index < len(evidence):
                    entry["evidence_snippet"] = evidence[index]
                elif isinstance(evidence, str):
                    entry["evidence_snippet"] = evidence
                provenance[field_id].append(entry)
        return provenance

    @abstractmethod
    def extract(self, doc: Document) -> ExtractionResult:
        pass

    def _success_result(
        self,
        canonical: CanonicalOutput,
        *,
        confidence: Optional[float] = None,
        warnings: Optional[List[str]] = None,
        errors: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ExtractionResult:
        entity_map = SemanticSectionBuilder.flatten(canonical.semantic_sections)
        field_confidence = {
            field_id: max(
                (
                    float(value.get("confidence", 0.0))
                    for value in values
                    if isinstance(value, dict)
                ),
                default=0.0,
            )
            for field_id, values in entity_map.items()
        }

        field_provenance = self._build_field_provenance(canonical)

        if confidence is None:
            confidence = (
                sum(field_confidence.values()) / len(field_confidence)
                if field_confidence
                else 0.0
            )

        result_metadata = dict(metadata or {})
        result_metadata["field_provenance"] = field_provenance

        raw = canonical.raw or {}
        validation_warnings = raw.get("validation_warnings", [])
        merged_warnings = [*(warnings or [])]
        if isinstance(validation_warnings, list):
            merged_warnings.extend(str(item) for item in validation_warnings)

        return ExtractionResult(
            success=True,
            data=canonical.to_dict(),
            confidence=confidence,
            field_confidence=field_confidence,
            warnings=merged_warnings,
            errors=list(errors or []),
            metadata=result_metadata,
        )

    def _failure_result(
        self,
        *errors: str,
        warnings: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ExtractionResult:
        return ExtractionResult(
            success=False,
            data={},
            confidence=0.0,
            warnings=list(warnings or []),
            errors=[error for error in errors if error],
            metadata=dict(metadata or {}),
        )
