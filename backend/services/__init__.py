"""Application services package.

Keep package import side effects minimal. Concrete services should be imported
from their modules directly, or resolved lazily through ``__getattr__`` below.
"""

from importlib import import_module
from typing import Any

__all__ = [
    "SubmissionService",
    "BulkExportService",
]


def __getattr__(name: str) -> Any:
    if name == "SubmissionService":
        return import_module(".submission_service", __name__).SubmissionService
    if name == "BulkExportService":
        return import_module(".bulk_export_service", __name__).BulkExportService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
