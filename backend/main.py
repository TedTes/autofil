"""
Flask application entry point.
"""

from api import create_app
import os

app = create_app()

def init_default_folders():
    """
    Create default folder if no folders exist.
    Runs on server startup.
    """
    from services.folder_service import FolderService
    
    try:
        folder_service = FolderService()
        
        # Check if any folders exist
        folders = folder_service.list_folders()
        
        if len(folders) == 0:
            print("📁 No folders found. Creating default folder...")
            default_folder = folder_service.create_folder("My Documents")
            print(f"✅ Default folder created: {default_folder['name']} (ID: {default_folder['folder_id']})")
        else:
            print(f"✅ Found {len(folders)} existing folder(s)")
    
    except Exception as e:
        print(f"⚠️  Warning: Failed to initialize default folders: {e}")
        print("   Server will continue, but no default folder was created.")

if __name__ == '__main__':
    # Initialize default folders before starting server
    print("\n" + "="*50)
    print("🚀 Starting AutoFil Backend")
    print("="*50)
    
    init_default_folders()
    
    port = int(os.environ.get("PORT", 5000))
    print(f"\n🌐 Server starting on http://0.0.0.0:{port}")
    print("="*50 + "\n")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.environ.get("FLASK_ENV") == "development"
    )