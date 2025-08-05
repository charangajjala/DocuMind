"""Document OCR Application Launcher."""

import subprocess
import sys
import time
import signal
import threading
from pathlib import Path

class DocumentOCRLauncher:
    def __init__(self):
        self.processes = []
        self.running = True
        
    def signal_handler(self, signum, frame):
        """Handle Ctrl+C gracefully."""
        print("\n🛑 Shutting down servers...")
        self.running = False
        for process in self.processes:
            try:
                process.terminate()
            except:
                pass
        sys.exit(0)
    
    def start_backend(self):
        """Start the FastAPI backend server."""
        print("🚀 Starting FastAPI backend...")
        try:
            process = subprocess.Popen([
                sys.executable, "run_api.py"
            ], cwd=Path(__file__).parent)
            self.processes.append(process)
            return process
        except Exception as e:
            print(f"❌ Failed to start backend: {e}")
            return None
    
    def start_frontend(self):
        """Start the React frontend development server."""
        print("🌐 Starting React frontend...")
        frontend_path = Path(__file__).parent / "src" / "frontend"
        
        if not frontend_path.exists():
            print("❌ Frontend directory not found!")
            return None
            
        try:
            process = subprocess.Popen([
                "npm", "run", "dev"
            ], cwd=frontend_path)
            self.processes.append(process)
            return process
        except FileNotFoundError:
            print("❌ npm not found! Please install Node.js and npm.")
            return None
        except Exception as e:
            print(f"❌ Failed to start frontend: {e}")
            return None
    
    def install_frontend_deps(self):
        """Install frontend dependencies if needed."""
        frontend_path = Path(__file__).parent / "src" / "frontend"
        node_modules = frontend_path / "node_modules"
        
        if not node_modules.exists():
            print("📦 Installing frontend dependencies...")
            try:
                subprocess.run([
                    "npm", "install"
                ], cwd=frontend_path, check=True)
                print("✅ Frontend dependencies installed!")
                return True
            except subprocess.CalledProcessError:
                print("❌ Failed to install frontend dependencies!")
                return False
            except FileNotFoundError:
                print("❌ npm not found! Please install Node.js and npm.")
                return False
        return True
    
    def run_single_terminal(self):
        """Run both servers sequentially in single terminal."""
        print("🔄 Single terminal mode - starting servers sequentially...")
        
        # Install frontend deps if needed
        if not self.install_frontend_deps():
            return
            
        # Start backend
        backend = self.start_backend()
        if not backend:
            return
            
        # Wait a bit for backend to start
        time.sleep(3)
        
        # Start frontend
        frontend = self.start_frontend()
        if not frontend:
            return
        
        print("\n✅ Both servers started successfully!")
        print("🌐 Frontend: http://localhost:5173")
        print("🚀 Backend: http://localhost:8000")
        print("📖 API Docs: http://localhost:8000/docs")
        print("\nPress Ctrl+C to stop all servers")
        
        # Wait for processes
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.signal_handler(None, None)
    
    def run_dev_mode(self):
        """Run in development mode with auto-reload."""
        print("🛠️  Starting development mode...")
        print("🔄 Auto-reload enabled for both frontend and backend")
        print("=" * 60)
        
        self.run_single_terminal()
    
    def show_manual_instructions(self):
        """Show manual startup instructions."""
        print("📋 Manual Startup Instructions")
        print("=" * 40)
        print("\n1. Start Backend (Terminal 1):")
        print("   python run_api.py")
        print("\n2. Start Frontend (Terminal 2):")
        print("   cd src/frontend")
        print("   npm install  # (if first time)")
        print("   npm run dev")
        print("\n3. Access the application:")
        print("   - Frontend: http://localhost:5173")
        print("   - Backend API: http://localhost:8000")
        print("   - API Documentation: http://localhost:8000/docs")

def main():
    """Main application launcher."""
    launcher = DocumentOCRLauncher()
    
    # Set up signal handler
    signal.signal(signal.SIGINT, launcher.signal_handler)
    
    print("Document OCR Application")
    print("=" * 50)
    print("Choose startup mode:")
    print("1. Single terminal (sequential) - Default")
    print("2. Development mode (Auto-reload enabled)")
    print("3. Manual instructions")
    
    try:
        choice = input("Enter your choice (1-3) or press Enter for default: ").strip()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
    
    if choice == "2":
        launcher.run_dev_mode()
    elif choice == "3":
        launcher.show_manual_instructions()
    else:  # Default or "1"
        launcher.run_single_terminal()

if __name__ == "__main__":
    main()
