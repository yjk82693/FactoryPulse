"""Load backend/.env into os.environ. Never logs values. Does not override existing process env."""
from pathlib import Path
import os


def load_backend_env(path: Path | None = None) -> None:
    env_path = path if path is not None else Path(__file__).resolve().parent / '.env'
    if not env_path.is_file():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        if value:
            os.environ[key] = value
