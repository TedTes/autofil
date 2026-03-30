from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from ..core.document import Document
from ..core.schema import CanonicalOutput
from ..models.extraction_result import ExtractionResult
from ..utils.semantic_section_builder import SemanticSectionBuilder


class BaseExtractor(ABC):
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

        field_provenance = {
            field_id: [
                source
                for source in (
                    value.get("source")
                    for value in values
                    if isinstance(value, dict)
                )
                if isinstance(source, dict) and source
            ]
            for field_id, values in entity_map.items()
        }

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
