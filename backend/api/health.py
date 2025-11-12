"""
Health check routes for Docker/Railway monitoring.
"""

from flask import Blueprint, jsonify
import sys

health_bp = Blueprint('health', __name__)


@health_bp.route('/health', methods=['GET'])
def health_check():
    """
    Basic health check endpoint.
    
    Returns:
        JSON with status and version info
    """
    return jsonify({
        'status': 'healthy',
        'service': 'acord-extraction-api',
        'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    }), 200


@health_bp.route('/ready', methods=['GET'])
def readiness_check():
    """
    Readiness check - verifies dependencies are loaded.
    
    Returns:
        JSON with readiness status
    """
    dependencies = {
        'flask': True,
        'pypdf': True,
        'camelot': False,
        'tesseract': False,
        'pandas': False
    }
    
    # Check if heavy dependencies are available
    try:
        import camelot
        dependencies['camelot'] = True
    except:
        pass
    
    try:
        import pytesseract
        dependencies['tesseract'] = True
    except:
        pass
    
    try:
        import pandas
        dependencies['pandas'] = True
    except:
        pass
    
    return jsonify({
        'status': 'ready',
        'service': 'acord-extraction-api',
        'dependencies': dependencies
    }), 200