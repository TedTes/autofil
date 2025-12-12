"""
Lightweight fillers for non-Acord document types.

These fillers don't rely on PDF templates; they generate CSV/JSON summaries
from canonical data so the fill pipeline can still produce an artifact.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from .base_filler import BaseFiller, FillReport


class _BaseDataExportFiller(BaseFiller):
    """
    Base utility class for data export fillers.

    Child classes should implement _export() to write an artifact to disk.
    """

    default_extension: str = ".json"

    def fill_from_canonical(
        self,
        canonical_data: Dict[str, Any],
        output_path: str,
        template_id: str = "",
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ) -> FillReport:
        # We keep the provided output_path to stay compatible with callers that
        # expect a specific filename (often *.pdf). We just warn if the suffix
        # differs from what we'd prefer.
        out_path = Path(output_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            filled_fields, warnings = self._export(canonical_data, out_path)
            if out_path.suffix.lower() != self.default_extension:
                warnings.append(
                    f"Output written to {out_path.name}; consider using {self.default_extension} for this filler type."
                )
            success = filled_fields > 0
            coverage = 1.0 if success else 0.0
            return FillReport(
                success=success,
                coverage=coverage,
                filled_fields=filled_fields,
                unmapped_fields=[],
                warnings=warnings,
                errors=[],
            )
        except Exception as exc:
            return FillReport(
                success=False,
                coverage=0.0,
                filled_fields=0,
                unmapped_fields=[],
                warnings=[],
                errors=[str(exc)],
            )

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        raise NotImplementedError


class LossRunFiller(_BaseDataExportFiller):
    """
    Export loss run claims to CSV.
    """

    form_type = "LOSS_RUN"
    supported_templates = ["loss_run", "lossrun"]
    default_extension = ".csv"

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        warnings: List[str] = []
        claims = canonical_data.get("claims") or canonical_data.get("data", {}).get("claims") or []
        if not isinstance(claims, list):
            warnings.append("No claims data available to export.")
            claims = []

        if not claims:
            # Write an empty CSV with a note
            output_path.write_text("claim_number,loss_date,amount,status\n", encoding="utf-8")
            return 0, warnings

        # Collect all keys to create a stable header
        header_keys = set()
        for claim in claims:
            if isinstance(claim, dict):
                header_keys.update(claim.keys())
        headers = sorted(header_keys) if header_keys else ["claim_number", "loss_date", "amount", "status"]

        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            for claim in claims:
                writer.writerow({k: claim.get(k, "") for k in headers})

        return len(claims) * len(headers), warnings


class SovFiller(_BaseDataExportFiller):
    """
    Export Statement of Values property schedules to CSV.
    """

    form_type = "SOV"
    supported_templates = ["sov", "statement_of_values"]
    default_extension = ".csv"

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        warnings: List[str] = []
        properties = canonical_data.get("properties") or canonical_data.get("data", {}).get("properties") or []

        if not isinstance(properties, list):
            warnings.append("No property schedule data available to export.")
            properties = []

        if not properties:
            output_path.write_text("location_name,address,building_value,content_value\n", encoding="utf-8")
            return 0, warnings

        header_keys = set()
        for prop in properties:
            if isinstance(prop, dict):
                header_keys.update(prop.keys())
        headers = sorted(header_keys) if header_keys else ["location_name", "address", "building_value", "content_value"]

        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            for prop in properties:
                writer.writerow({k: prop.get(k, "") for k in headers})

        return len(properties) * len(headers), warnings


class SupplementalFiller(_BaseDataExportFiller):
    """
    Export supplemental Q&A or tabular data to JSON.
    """

    form_type = "SUPPLEMENTAL"
    supported_templates = ["supplemental", "supp"]

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        output_path.write_text(json.dumps(canonical_data, indent=2), encoding="utf-8")
        # Count roughly as number of top-level keys
        filled = len(canonical_data.keys())
        return filled, []


class FinancialStatementFiller(_BaseDataExportFiller):
    """
    Export financial statements to JSON.
    """

    form_type = "FINANCIAL_STATEMENT"
    supported_templates = ["financial_statement", "financials"]

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        output_path.write_text(json.dumps(canonical_data, indent=2), encoding="utf-8")
        filled = len(canonical_data.keys())
        return filled, []


class GenericFiller(_BaseDataExportFiller):
    """
    Fallback filler that just dumps canonical data to JSON.
    """

    form_type = "GENERIC"
    supported_templates = ["generic", "default"]

    def _export(self, canonical_data: Dict[str, Any], output_path: Path) -> tuple[int, List[str]]:
        output_path.write_text(json.dumps(canonical_data, indent=2), encoding="utf-8")
        filled = len(canonical_data.keys())
        return filled, []
