import os
import zipfile
import tempfile
import time
from datetime import datetime
from typing import List, Dict, Any, Tuple

from services.submission_service import SubmissionService


class BulkExportService:
    """
    Service for exporting multiple filled PDFs as a single ZIP.

    Currently uses local filesystem; later can be wired to cloud storage/DB
    without changing callers.
    """

    def __init__(
        self,
        max_files_per_zip: int = 100,
        timeout_seconds: int = 5 * 60,
    ):
        self.submission_service = SubmissionService()
        self.max_files_per_zip = max_files_per_zip
        self.timeout_seconds = timeout_seconds

    def create_zip_for_submissions(
        self,
        submission_ids: List[str],
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Build ZIP for given submission IDs.

        Returns:
            (zip_path, results)

        results: list of { submission_id, success, filename?, error? }
        """
        if not submission_ids:
            raise ValueError("submission_ids must be a non-empty list")

        if len(submission_ids) > self.max_files_per_zip:
            raise ValueError(
                f"Maximum {self.max_files_per_zip} submissions allowed per export"
            )

        start_time = time.time()
        results: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []

        # Use a temp file on disk (avoids large in-memory buffers)
        fd, zip_path = tempfile.mkstemp(
            prefix="bulk_export_",
            suffix=".zip",
        )
        os.close(fd)

        try:
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for submission_id in submission_ids:
                    # Timeout check
                    if time.time() - start_time > self.timeout_seconds:
                        err_msg = "Bulk export timed out"
                        errors.append({
                            "submission_id": submission_id,
                            "success": False,
                            "error": err_msg,
                        })
                        results.append({
                            "submission_id": submission_id,
                            "success": False,
                            "error": err_msg,
                        })
                        break

                    try:
                        submission = self.submission_service.get_submission(submission_id)
                        if not submission:
                            raise FileNotFoundError("Submission not found")

                        pdf_bytes = self.submission_service.get_filled_pdf_bytes(submission_id)
                        if not pdf_bytes:
                            raise FileNotFoundError("Filled PDF not found")

                        original_filename = submission.get("filename", submission_id)
                        if original_filename.lower().endswith(".pdf"):
                            original_filename = original_filename[:-4]

                        arcname = f"{original_filename}_filled.pdf"

                        zipf.writestr(arcname, pdf_bytes)

                        results.append({
                            "submission_id": submission_id,
                            "success": True,
                            "filename": arcname,
                        })

                    except Exception as e:
                        msg = str(e)
                        entry = {
                            "submission_id": submission_id,
                            "success": False,
                            "error": msg,
                        }
                        errors.append(entry)
                        results.append(entry)

                # If any failures → write error_log.txt
                if errors:
                    lines = [
                        f"{e['submission_id']}: {e.get('error', 'Unknown error')}"
                        for e in errors
                    ]
                    zipf.writestr("error_log.txt", "\n".join(lines))

            return zip_path, results

        except Exception:
            # Clean up on any fatal error
            if os.path.exists(zip_path):
                os.remove(zip_path)
            raise
