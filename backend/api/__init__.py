"""
API initialization and configuration.
"""

import logging
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

_init_logger = logging.getLogger(__name__)

# Ensure backend/.env is loaded so services see Supabase credentials, etc.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, '.env'), override=False)


def _get_cors_origins():
    cors_origins_env = os.environ.get("CORS_ORIGINS")
    if cors_origins_env:
        return [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]

    if os.environ.get("FLASK_ENV") != "development":
        _init_logger.warning(
            "CORS_ORIGINS is not set — falling back to local development origins. "
            "Set CORS_ORIGINS in production."
        )

    local_ports = "3000|3001|3002|3003|3004|3005"
    return [
        rf"http://localhost:({local_ports})",
        rf"http://127\.0\.0\.1:({local_ports})",
        rf"http://192\.168\.\d{{1,3}}\.\d{{1,3}}:({local_ports})",
        rf"http://10\.\d{{1,3}}\.\d{{1,3}}\.\d{{1,3}}:({local_ports})",
        rf"http://172\.(1[6-9]|2\d|3[0-1])\.\d{{1,3}}\.\d{{1,3}}:({local_ports})",
    ]


def create_app():
    """
    Create and configure Flask application.
    
    Returns:
        Configured Flask app
    """
    app = Flask(__name__)
    # Register blueprints

    from api.submissions import submission_bp
    from api.bulk import bulk_bp
    from api.clients import client_bp
    from api.extraction import extraction_bp
    from api.health  import health_bp
    from api.folders import folder_bp
    from api.templates import template_bp
    from api.metadata import metadata_bp
    from api.integrations import integration_bp


    app.register_blueprint(submission_bp, url_prefix='/api/submissions')
    app.register_blueprint(bulk_bp, url_prefix='/api/bulk')

    app.register_blueprint(folder_bp, url_prefix='/api/folders')
    app.register_blueprint(extraction_bp, url_prefix='/api/extraction')
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(client_bp, url_prefix='/api/clients')
    app.register_blueprint(template_bp, url_prefix='/api/templates')
    app.register_blueprint(metadata_bp, url_prefix='/api/metadata')
    app.register_blueprint(integration_bp, url_prefix='/api/integrations')
    
    # Enable CORS for frontend
    CORS(app, resources={
        r"/api/*": {
            "origins": _get_cors_origins(),
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    # Configuration
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

    
    
 
    @app.route('/')
    def index():
        return {
            'message': 'ACORD Extraction API',
            'status': 'running',
            'endpoints': {
                'health': '/api/health',
                'ready': '/api/ready',
                'submissions': '/api/submissions',
                'folders': '/api/folders'
            }
        }
    
    return app
