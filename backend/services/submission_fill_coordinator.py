"""Submission fill workflow coordinator."""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from filling.fillers.base_filler import FillReport
from filling.template_loader import TemplateLoader
from services.submission_file_store import SubmissionFileStore
from services.submission_repository import SubmissionRepository


class SubmissionFillCoordinator:
    """Generate output artifacts from merged canonical submission data."""

    def __init__(
        self,
        *,
        repository: SubmissionRepository,
        file_store: SubmissionFileStore,
        select_filler: Callable[[str], Any],
        merge_input_data: Callable[[List[Dict[str, Any]]], Dict[str, Any]],
    ) -> None:
        self.repository = repository
        self.file_store = file_store
        self.select_filler = select_filler
        self.merge_input_data = merge_input_data

    def fill_submission(
        self,
        submission_id: str,
        input_ids: Optional[List[str]] = None,
        template_id: Optional[str] = None,
    ) -> Tuple[FillReport, Dict[str, Any]]:
        metadata = self.repository.get(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        inputs_meta = metadata.get("inputs", [])
        if input_ids:
            inputs_meta = [entry for entry in inputs_meta if entry.get("input_id") in input_ids]
            if not inputs_meta:
                raise ValueError("No matching input files selected")

        canonical_data = self.merge_input_data(inputs_meta) or metadata.get("data")
        if not canonical_data:
            raise ValueError("Extracted data not found")

        template_choice = template_id or metadata.get("template_type")
        if not template_choice:
            raise ValueError(
                "template_id is required when filling a document. Please select a destination template."
            )

        template_choice = Path(str(template_choice)).stem
        filler = self.select_filler(template_choice)
        template_config = TemplateLoader.load(template_choice)
        resolved_template_id = template_config.template_id if template_config else template_choice

        default_ext = getattr(filler, "default_extension", ".pdf")
        normalized_ext = default_ext if str(default_ext).startswith(".") else f".{default_ext}"
        is_export_filler = normalized_ext.lower() != ".pdf"

        if not template_config and not is_export_filler:
            raise ValueError(
                f"Unknown output template '{template_choice}'. Select a supported YAML-backed template id."
            )

        metadata["template_type"] = resolved_template_id

        temp_output_dir = tempfile.mkdtemp(prefix=f"filled_{submission_id}_")
        try:
            ext = normalized_ext
            output_id = str(uuid.uuid4())
            safe_template_id = self._safe_filename_part(resolved_template_id)
            filename = f"{submission_id}_{safe_template_id}_{output_id[:8]}{ext}"
            output_path = os.path.join(temp_output_dir, filename)

            fill_report = filler.fill(
                canonical_data=canonical_data,
                output_path=output_path,
                template_id=resolved_template_id,
            )
            fill_report.warnings.extend(
                self._low_confidence_warnings(canonical_data, template_config)
            )
            output_entry: Dict[str, Any] = {
                "output_id": output_id,
                "template_id": resolved_template_id,
                "generated_at": datetime.utcnow().isoformat(),
            }

            remote_output = None
            if fill_report.success and os.path.exists(output_path):
                remote_output = self.file_store.upload(
                    local_path=output_path,
                    content_type=self._content_type_for_extension(ext),
                    client_id=metadata.get("client_id"),
                    submission_id=submission_id,
                    category="outputs",
                    filename=os.path.basename(output_path),
                )

                metadata["status"] = "filled"
                metadata["filled_at"] = output_entry["generated_at"]
                output_entry.update({
                    "filename": os.path.basename(output_path),
                    "url": (
                        remote_output.get("signed_url")
                        or remote_output.get("public_url")
                        if remote_output
                        else None
                    ),
                    "storage": remote_output,
                })
                outputs_meta = metadata.setdefault("outputs", [])
                outputs_meta.append(output_entry)
                if remote_output:
                    metadata["output_storage"] = remote_output
            else:
                metadata["status"] = "extracted"
                output_entry["filename"] = os.path.basename(output_path)
                output_entry["url"] = None

            metadata["fill_report"] = {
                "success": fill_report.success,
                "coverage": fill_report.coverage,
                "filled_fields": fill_report.filled_fields,
                "unmapped_fields": fill_report.unmapped_fields,
                "warnings": fill_report.warnings,
                "errors": fill_report.errors,
            }
            self.repository.save(metadata)
            return fill_report, output_entry
        finally:
            shutil.rmtree(temp_output_dir, ignore_errors=True)

    @staticmethod
    def _content_type_for_extension(ext: str) -> str:
        return {
            ".pdf": "application/pdf",
            ".csv": "text/csv",
            ".json": "application/json",
        }.get(ext.lower(), "application/octet-stream")

    @staticmethod
    def _safe_filename_part(value: str) -> str:
        cleaned = "".join(
            char.lower() if char.isalnum() else "_"
            for char in str(value or "output")
        ).strip("_")
        while "__" in cleaned:
            cleaned = cleaned.replace("__", "_")
        return cleaned or "output"

    @staticmethod
    def _low_confidence_warnings(
        canonical_data: Dict[str, Any],
        template_config: Optional[Any] = None,
        threshold: float = 0.8,
    ) -> List[Dict[str, Any]]:
        sections = canonical_data.get("semantic_sections") or canonical_data.get("semanticSections") or []
        template_field_ids = set()
        repeater_field_ids = set()
        if template_config is not None:
            template_field_ids.update((template_config.field_map or {}).keys())
            repeater_field_ids.update((template_config.repeaters or {}).keys())
            template_field_ids.update(repeater_field_ids)

        warnings: List[Dict[str, Any]] = []
        seen_fields = set()
        for section in sections:
            if not isinstance(section, dict):
                continue
            for field in section.get("fields") or []:
                if not isinstance(field, dict):
                    continue
                field_id = str(field.get("id") or "")
                if template_field_ids and field_id not in template_field_ids:
                    continue
                if field_id in seen_fields:
                    continue

                lowest_confidence, lowest_payload, nested_field = (
                    SubmissionFillCoordinator._lowest_confidence_payload(
                        field.get("values") or [],
                        threshold,
                        inspect_nested=field_id in repeater_field_ids,
                    )
                )

                if lowest_confidence is not None:
                    label = str(field.get("label") or field_id or "Unknown field")
                    if nested_field:
                        label = f"{label} {nested_field}".strip()
                    source = lowest_payload.get("source") if isinstance(lowest_payload, dict) else {}
                    source_document = None
                    if isinstance(source, dict):
                        source_document = (
                            source.get("source_file")
                            or source.get("file_name")
                            or source.get("filename")
                        )
                    warnings.append({
                        "field_id": field_id or None,
                        "field_name": label,
                        "message": (
                            f"Review recommended: {label} was filled from "
                            f"{lowest_confidence * 100:.0f}% confidence source data."
                        ),
                        "severity": "medium",
                        "confidence": round(lowest_confidence, 4),
                        "value": lowest_payload.get("value"),
                        "source_document": source_document,
                        "reason": "source_confidence_below_threshold",
                    })
                    seen_fields.add(field_id)

        return warnings[:20]

    @staticmethod
    def _lowest_confidence_payload(
        values: Any,
        threshold: float,
        *,
        inspect_nested: bool = False,
    ) -> Tuple[Optional[float], Dict[str, Any], Optional[str]]:
        if not isinstance(values, list):
            values = [values]

        lowest_confidence = None
        lowest_payload: Dict[str, Any] = {}
        nested_field = None

        for value in values:
            payload = value if isinstance(value, dict) else {}
            candidates: List[Tuple[Dict[str, Any], Optional[str]]] = [(payload, None)]
            raw_value = payload.get("value")

            if inspect_nested and isinstance(raw_value, dict):
                candidates.extend(
                    (
                        {
                            "value": nested_value,
                            "confidence": payload.get("confidence"),
                            "source": payload.get("source"),
                        },
                        str(nested_key),
                    )
                    for nested_key, nested_value in raw_value.items()
                    if nested_value not in (None, "")
                )

            for candidate, candidate_nested_field in candidates:
                if candidate.get("value") in (None, ""):
                    continue
                try:
                    confidence = float(candidate.get("confidence"))
                except (TypeError, ValueError):
                    continue
                if confidence < threshold and (
                    lowest_confidence is None or confidence < lowest_confidence
                ):
                    lowest_confidence = confidence
                    lowest_payload = candidate
                    nested_field = candidate_nested_field

        return lowest_confidence, lowest_payload, nested_field
