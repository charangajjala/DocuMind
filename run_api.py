"""FastAPI backend server runner."""

import sys
import uvicorn
from pathlib import Path

# Add src directory to Python path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

if __name__ == "__main__":
    print("🚀 Starting Document OCR API Server...")
    print("📖 API Documentation: http://localhost:8000/docs")
    print("🔍 Health Check: http://localhost:8000/health")
    print("=" * 50)
    
    uvicorn.run(
        "api.main:app",  # Use string format for module reloading
        host="localhost",
        port=8000,
        reload=True,  # Enable auto-reload on code changes
        reload_dirs=[str(Path(__file__).parent / "src")],  # Watch src directory
        log_level="info"
    )
