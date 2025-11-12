"""
API routes initialization.
"""

from .submission_routes import submission_bp
from .folder_routes import folder_bp
from .health_routes import health_bp
from .client_routes import client_bp
from .extraction_routes import extraction_bp
from .bulk_export_routes import bulk_export_bp
__all__ = ['submission_bp', 'folder_bp', 'health_bp','client_bp','extraction_bp','bulk_export_bp']