"""
ACORD 126 extractor – robust, type-safe, extensible.

1. Parse PDF fields
2. Map to canonical JSON
3. Compute per-field & overall confidence
4. Return a fully-populated ExtractionResult
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Tuple

from ..interfaces.extractor import IExtractor
from ..interfaces.parser import IParser
from ..interfaces.mapper import IMapper
from ..models.extraction_result import ExtractionResult
from ..parsers.pdf_field_parser import PdfFieldParser
from ..mappers.acord_126_extraction_mapper import Acord126ExtractionMapper


# --------------------------------------------------------------------------- #
# Helper constants
# --------------------------------------------------------------------------- #
CRITICAL_FIELDS = {
    "applicant.business_name": "Business name",
    "limits.each_occurrence": "Each occurrence limit",
    "limits.general_aggregate": "General aggregate limit",
}
CRITICAL_CONFIDENCE_PATHS = {
    "applicant.business_name",
    "limits.each_occurrence",
    "limits.general_aggregate",
}
CRITICAL_BUMP_PATHS = CRITICAL_CONFIDENCE_PATHS | {
    "applicant.mailing_address",
}


class Acord126Extractor(IExtractor):
    """Extractor for ACORD 126 (Commercial General Liability Application)."""

    # ------------------------------------------------------------------- #
    # Construction
    # ------------------------------------------------------------------- #
    def __init__(self, parser: IParser | None = None, mapper: IMapper | None = None):
        self.parser: IParser = parser or PdfFieldParser()
        self.mapper: IMapper = mapper or Acord126ExtractionMapper()

    # ------------------------------------------------------------------- #
    # Capability
    # ------------------------------------------------------------------- #
    def get_supported_form_type(self) -> str:
        return "126"

    def can_extract(self, pdf_path: str) -> bool:
        """Quick pre-flight check – file exists + PDF is fillable."""
        return os.path.isfile(pdf_path) and self.parser.is_fillable(pdf_path)

    # ------------------------------------------------------------------- #
    # Core extraction
    # ------------------------------------------------------------------- #
    def extract(self, pdf_path: str) -> ExtractionResult:
        # Always-initialised containers
        metadata: Dict[str, Any] = {}
        field_confidence: Dict[str, float] = {}

        try:
            # ----------------------------------------------------------- #
            # 1. Validate path
            # ----------------------------------------------------------- #
            if not os.path.isfile(pdf_path):
                return ExtractionResult(
                    json={},
                    confidence=0.0,
                    warnings=["File not found"],
                    metadata=metadata,
                    field_confidence=field_confidence,
                    error=f"PDF file not found: {pdf_path}",
                )

            # ----------------------------------------------------------- #
            # 2. Parse raw fields
            # ----------------------------------------------------------- #
            raw_fields = self.parser.extract_fields(pdf_path)
            if not raw_fields:
                metadata = self._build_metadata(pdf_path, raw_fields)
                return ExtractionResult(
                    json={},
                    confidence=0.0,
                    warnings=["No fields extracted from PDF"],
                    metadata=metadata,
                    field_confidence=field_confidence,
                    error="PDF has no readable fields",
                )

            # ----------------------------------------------------------- #
            # 3. Map to canonical JSON
            # ----------------------------------------------------------- #
            canonical_json = self.mapper.map_to_canonical(raw_fields)

            # ----------------------------------------------------------- #
            # 4. Confidence + warnings
            # ----------------------------------------------------------- #
            overall_confidence, field_confidence = self._calculate_confidence_with_fields(
                canonical_json
            )
            warnings = self._collect_warnings(raw_fields, canonical_json)

            # ----------------------------------------------------------- #
            # 5. Metadata
            # ----------------------------------------------------------- #
            metadata = self._build_metadata(pdf_path, raw_fields, field_confidence)

            # ----------------------------------------------------------- #
            # 6. Success
            # ----------------------------------------------------------- #
            return ExtractionResult(
                json=canonical_json,
                confidence=overall_confidence,
                warnings=warnings,
                metadata=metadata,
                field_confidence=field_confidence,
            )

        # ------------------------------------------------------------------- #
        # Graceful error handling
        # ------------------------------------------------------------------- #
        except ValueError as ve:
            return ExtractionResult(
                json={},
                confidence=0.0,
                warnings=[],
                metadata=metadata,
                field_confidence=field_confidence,
                error=str(ve),
            )
        except Exception as exc:  # pragma: no cover – unexpected
            return ExtractionResult(
                json={},
                confidence=0.0,
                warnings=[],
                metadata=metadata,
                field_confidence=field_confidence,
                error=f"Extraction failed: {exc}",
            )

    # ------------------------------------------------------------------- #
    # Confidence
    # ------------------------------------------------------------------- #
    def _calculate_confidence_with_fields(
        self, canonical_json: Dict[str, Any]
    ) -> Tuple[float, Dict[str, float]]:
        """
        Overall = 0.70 * (average leaf confidence) + 0.30 * (critical-field ratio)

        Critical-field ratio = #critical_fields ≥ 0.5 / total_critical_fields
        """
        field_confidence = self._build_field_confidence(canonical_json)

        avg_conf = (
            sum(field_confidence.values()) / len(field_confidence)
            if field_confidence
            else 0.0
        )

        critical_hits = sum(
            1 for p in CRITICAL_CONFIDENCE_PATHS if field_confidence.get(p, 0.0) >= 0.5
        )
        critical_ratio = critical_hits / len(CRITICAL_CONFIDENCE_PATHS)

        overall = round(avg_conf * 0.70 + critical_ratio * 0.30, 2)
        return overall, field_confidence

    def _build_field_confidence(self, canonical_json: Any) -> Dict[str, float]:
        """Traverse JSON and assign a confidence score to every leaf."""
        confidence: Dict[str, float] = {}

        def _traverse(obj: Any, path: str = "") -> None:
            if isinstance(obj, dict):
                for k, v in obj.items():
                    _traverse(v, f"{path}.{k}" if path else k)
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    _traverse(item, f"{path}[{i}]")
            else:
                confidence[path] = self._calc_single_field_confidence(path, obj)

        _traverse(canonical_json)
        return confidence

    def _calc_single_field_confidence(self, path: str, value: Any) -> float:
        """Heuristic confidence for a single leaf value."""
        if not self._is_non_empty(value):
            return 0.0

        conf = 0.60  # base for a non-empty value

        if isinstance(value, str):
            s = value.strip()
            length = len(s)

            # Length bonuses
            if length > 20:
                conf += 0.20
            elif length > 5:
                conf += 0.10

            # Pattern (lightweight, no external libs)
            patterns = (
                (r"^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$", 0.05),  # phone
                (r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", 0.05),  # email
                (r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$", 0.05),  # date
                (r"^\$?[\d,]+(\.\d{2})?$", 0.05),  # money
            )
            for regex, bonus in patterns:
                if re.fullmatch(regex, s):
                    conf += bonus

        # Critical-field bump
        if path in CRITICAL_BUMP_PATHS:
            conf += 0.10

        return min(conf, 1.0)

    @staticmethod
    def _is_non_empty(v: Any) -> bool:
        """True for any non-null, non-blank value."""
        if v is None:
            return False
        if isinstance(v, str):
            return v.strip() != ""
        return True

    # ------------------------------------------------------------------- #
    # Warnings
    # ------------------------------------------------------------------- #
    def _collect_warnings(
        self, raw_fields: Dict[str, Any], canonical_json: Dict[str, Any]
    ) -> List[str]:
        warnings: List[str] = []

        # 1. Missing critical fields
        for field_path, label in CRITICAL_FIELDS.items():
            if not self._nested_value(canonical_json, field_path):
                warnings.append(f"Missing critical field: {label}")

        # 2. Low raw field count
        if len(raw_fields) < 20:
            warnings.append(
                f"Low field count ({len(raw_fields)}). PDF may be incomplete or blank."
            )

        # 3. Coverage type
        coverage = (
            canonical_json.get("coverage_type", {})
            if isinstance(canonical_json, dict)
            else {}
        )
        if not coverage.get("occurrence") and not coverage.get("claims_made"):
            warnings.append(
                "No coverage type selected (Occurrence or Claims Made)."
            )

        return warnings

    # ------------------------------------------------------------------- #
    # Utilities
    # ------------------------------------------------------------------- #
    @staticmethod
    def _nested_value(obj: Dict[str, Any], path: str) -> Any:
        """Safely retrieve a dotted path from a nested dict."""
        cur: Any = obj
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return None
        return cur

    @staticmethod
    def _build_metadata(
        pdf_path: str,
        raw_fields: Dict[str, Any],
        field_confidence: Dict[str, float] | None = None,
    ) -> Dict[str, Any]:
        """Centralised metadata construction – easy to extend."""
        low_conf = (
            len([c for c in field_confidence.values() if c < 0.7])
            if field_confidence
            else 0
        )
        return {
            "total_fields_extracted": len(raw_fields),
            "form_type": "126",
            "pdf_path": pdf_path,
            "pdf_filename": os.path.basename(pdf_path),
            "low_confidence_count": low_conf,
        }