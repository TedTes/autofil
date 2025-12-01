"""PDF filler implementations and registry loader."""

from importlib import import_module

_FILLER_MODULES = [
    'backend.filling.fillers.acord_126_filler',
]

for module_path in _FILLER_MODULES:
    import_module(module_path)

__all__ = []
