"""
Document extractors for orchestrating extraction workflows.
"""

import logging

from .registry import ExtractorRegistry, extractor_registry
from .factory import ExtractorFactory, extract_from_document
from .mfc import MFC

logger = logging.getLogger(__name__)
__all__ = []


def _optional_import(module_name: str, export_name: str) -> None:
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=[export_name])
        globals()[export_name] = getattr(module, export_name)
        __all__.append(export_name)
    except Exception as exc:
        globals()[export_name] = None
        if export_name not in __all__:
            __all__.append(export_name)
        logger.warning("failed to import extractor %s: %s", module_name, exc)


_optional_import("acord_126_extractor", "ACORD126Extractor")
_optional_import("acord_125_extractor", "ACORD125Extractor")
_optional_import("acord_130_extractor", "ACORD130Extractor")
_optional_import("acord_140_extractor", "ACORD140Extractor")
_optional_import("loss_run_extractor", "LossRunExtractor")
_optional_import("sov_extractor", "SovExtractor")
_optional_import("financial_statement_extractor", "FinancialStatementExtractor")
_optional_import("generic_extractor", "GenericExtractor")
_optional_import("supplemental_extractor", "SupplementalExtractor")

__all__.extend([

    # Extractors
    'MFC',
    # Registry & Factory
    'ExtractorRegistry', 
    'extractor_registry',
    'ExtractorFactory',
    'extract_from_document'
    ])
