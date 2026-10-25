"""Use backend/.env for sensor credentials without exposing them in arguments."""
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from backend.envload import load_backend_env

load_backend_env()
sensor = root / 'sensing' / 'processing' / 'python' / 'csi_stream.py'
sys.path.insert(0, str(sensor.parent))
sys.argv[0] = str(sensor)
runpy.run_path(str(sensor), run_name='__main__')
