"""
Universal file readers.

Each reader registers itself for specific MIME types.
"""

import logging

logger = logging.getLogger(__name__)

__all__ = []


def _optional_import(module_name: str, export_name: str) -> None:
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=[export_name])
        globals()[export_name] = getattr(module, export_name)
        __all__.append(export_name)
    except Exception as exc:
        logger.warning("failed to import reader %s: %s", module_name, exc)


_optional_import("pdf_reader", "PdfReader")
_optional_import("excel_reader", "ExcelReader")
_optional_import("image_reader", "ImageReader")
_optional_import("text_reader", "TextReader")
_optional_import("docx_reader", "DocxReader")
_optional_import("generic_reader", "GenericReader")
