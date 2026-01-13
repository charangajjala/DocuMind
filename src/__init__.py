"""Source package initialization."""

# Add current directory to Python path for relative imports
import sys
from pathlib import Path

# Add src directory to path if not already there
src_path = Path(__file__).parent
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))
