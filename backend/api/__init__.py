"""
API initialization and configuration.
"""

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

# Ensure backend/.env is loaded so services see Supabase credentials, etc.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, '.env'), override=False)

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
    from api.ingest import ingest_bp


    app.register_blueprint(submission_bp, url_prefix='/api/submissions')
    app.register_blueprint(bulk_bp, url_prefix='/api/bulk')

    app.register_blueprint(folder_bp, url_prefix='/api/folders')
    app.register_blueprint(extraction_bp, url_prefix='/api/extraction')
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(client_bp, url_prefix='/api/clients')
    app.register_blueprint(template_bp, url_prefix='/api/templates')
    app.register_blueprint(metadata_bp, url_prefix='/api/metadata')
    app.register_blueprint(ingest_bp, url_prefix='/api/ingest')
    
    # Enable CORS for frontend
    CORS(app, resources={
        r"/api/*": {
            "origins": os.environ.get("CORS_ORIGINS","http://localhost:3000").split(","), 
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Ingest-Token", "X-Webhook-Token"]
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
