"""React frontend runner."""

import subprocess
import sys
from pathlib import Path

def run_frontend():
    """Start the React frontend development server."""
    frontend_path = Path(__file__).parent / "src" / "frontend"
    
    if not frontend_path.exists():
        print("❌ Frontend directory not found!")
        sys.exit(1)
    
    print("🌐 Starting Document OCR React Frontend...")
    print("📖 Frontend UI: http://localhost:5173")
    print("🔧 Development server with hot reload enabled")
    print("=" * 50)
    
    try:
        # Change to frontend directory and run npm dev
        result = subprocess.run(
            ["npm", "run", "dev"],
            cwd=frontend_path,
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start frontend: {e}")
        print("\n💡 Make sure to install dependencies first:")
        print(f"   cd {frontend_path}")
        print("   npm install")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ npm not found! Please install Node.js and npm.")
        sys.exit(1)

if __name__ == "__main__":
    run_frontend()
