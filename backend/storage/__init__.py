"""
Storage provider interface.

Allows swapping local filesystem with cloud/object storage without
touching business logic.
"""

from .providers import StorageProvider, LocalStorageProvider

__all__ = [
    'StorageProvider',
    'LocalStorageProvider',
]
