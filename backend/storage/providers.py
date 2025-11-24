"""
Storage provider abstractions.

Currently only a local filesystem implementation is provided, but the
interface can be adapted for cloud storage (S3, GCS, etc.) later.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Optional


class StorageProvider(ABC):
    """Abstract storage provider."""

    @abstractmethod
    def save_upload(self, file_storage, *path: str) -> str:
        """Persist an uploaded file and return the absolute path."""

    @abstractmethod
    def write_json(self, relative_path: str, data: dict) -> str:
        """Persist JSON data and return the absolute path."""

    @abstractmethod
    def read_json(self, relative_path: str) -> Optional[dict]:
        """Read JSON data from storage."""

    @abstractmethod
    def delete(self, relative_path: str) -> None:
        """Delete the file at the given relative path (if it exists)."""

    @abstractmethod
    def exists(self, relative_path: str) -> bool:
        """Return True if a relative path exists."""

    @abstractmethod
    def ensure_dir(self, *parts: str) -> str:
        """Ensure a directory exists and return its absolute path."""

    @abstractmethod
    def full_path(self, relative_path: str) -> str:
        """Return the absolute path for a relative path without creating files."""


class LocalStorageProvider(StorageProvider):
    """Filesystem-backed storage provider."""

    def __init__(self, base_path: str = 'storage'):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def _full_path(self, *parts: str, ensure_parent: bool = True) -> str:
        relative_path = os.path.join(*parts) if parts else ''
        full_path = os.path.join(self.base_path, relative_path)
        directory = os.path.dirname(full_path)
        if ensure_parent and directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
        return full_path

    def save_upload(self, file_storage, *path: str) -> str:
        dest = self._full_path(*path)
        file_storage.save(dest)
        return dest

    def write_json(self, relative_path: str, data: dict) -> str:
        full_path = self._full_path(relative_path)
        temp_path = f"{full_path}.tmp"
        with open(temp_path, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_path, full_path)
        return full_path

    def read_json(self, relative_path: str) -> Optional[dict]:
        path = self._full_path(relative_path, ensure_parent=False)
        if not os.path.exists(path):
            return None
        with open(path, 'r') as f:
            return json.load(f)

    def delete(self, relative_path: str) -> None:
        path = self._full_path(relative_path, ensure_parent=False)
        if os.path.exists(path):
            os.remove(path)

    def exists(self, relative_path: str) -> bool:
        path = self._full_path(relative_path, ensure_parent=False)
        return os.path.exists(path)

    def ensure_dir(self, *parts: str) -> str:
        path = self._full_path(*parts)
        os.makedirs(path, exist_ok=True)
        return path

    def full_path(self, relative_path: str) -> str:
        return self._full_path(relative_path, ensure_parent=False)
