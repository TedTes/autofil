"""PDF filler implementations and registry loader."""

from importlib import import_module

_FILLER_MODULES = [
    '.acord_28_filler',
    '.acord_27_filler',
    '.acord_25_filler',
    '.acord_101_filler',
    '.acord_126_filler',
    '.acord_125_filler',
    '.acord_130_filler',
    '.acord_140_filler',
    '.data_export_fillers',
]

for module_path in _FILLER_MODULES:
    import_module(module_path, __name__)

# Re-export fillers for convenience
from .acord_28_filler import Acord28Filler
from .acord_27_filler import Acord27Filler
from .acord_25_filler import Acord25Filler
from .acord_101_filler import Acord101Filler
from .acord_125_filler import Acord125Filler
from .acord_126_filler import Acord126Filler
from .acord_130_filler import Acord130Filler
from .acord_140_filler import Acord140Filler
from .data_export_fillers import (
    LossRunFiller,
    SovFiller,
    SupplementalFiller,
    FinancialStatementFiller,
    GenericFiller,
)

__all__ = [
    'Acord28Filler',
    'Acord27Filler',
    'Acord25Filler',
    'Acord101Filler',
    'Acord125Filler',
    'Acord126Filler',
    'Acord130Filler',
    'Acord140Filler',
    'LossRunFiller',
    'SovFiller',
    'SupplementalFiller',
    'FinancialStatementFiller',
    'GenericFiller',
]
