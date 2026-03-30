"""Submission fill workflow coordinator."""

from __future__ import annotations

import os
import shutil
import tempfile
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
        template_config = TemplateLoader.load(template_choice)
        if not template_config:
            raise ValueError(
                f"Unknown output template '{template_choice}'. Select a supported YAML-backed template id."
            )
        resolved_template_id = template_config.template_id

        metadata["template_type"] = resolved_template_id
        filler = self.select_filler(resolved_template_id)

        temp_output_dir = tempfile.mkdtemp(prefix=f"filled_{submission_id}_")
        try:
            default_ext = getattr(filler, "default_extension", ".pdf")
            ext = default_ext if default_ext.startswith(".") else f".{default_ext}"
            filename = f"{submission_id}_filled{ext}"
            output_path = os.path.join(temp_output_dir, filename)

            fill_report = filler.fill(
                canonical_data=canonical_data,
                output_path=output_path,
                template_id=resolved_template_id,
            )
            output_entry: Dict[str, Any] = {
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
                    "url": remote_output.get("public_url") if remote_output else None,
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
