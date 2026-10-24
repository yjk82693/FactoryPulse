"""envload copies non-empty keys and does not override process env."""
import os
import tempfile
import unittest
from pathlib import Path

from backend.envload import load_backend_env


class EnvLoadTests(unittest.TestCase):
    def test_loads_nonempty_keys_without_override(self):
        previous = os.environ.get('SENSOR_INGEST_KEY')
        previous_auth = os.environ.get('AUTH_DISABLED')
        os.environ.pop('SENSOR_INGEST_KEY', None)
        os.environ['AUTH_DISABLED'] = 'already'
        try:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / '.env'
                path.write_text('SENSOR_INGEST_KEY=from-file\nAUTH_DISABLED=true\nEMPTY_KEY=\n')
                load_backend_env(path)
            self.assertEqual(os.environ.get('SENSOR_INGEST_KEY'), 'from-file')
            self.assertEqual(os.environ['AUTH_DISABLED'], 'already')
        finally:
            if previous is None:
                os.environ.pop('SENSOR_INGEST_KEY', None)
            else:
                os.environ['SENSOR_INGEST_KEY'] = previous
            if previous_auth is None:
                os.environ.pop('AUTH_DISABLED', None)
            else:
                os.environ['AUTH_DISABLED'] = previous_auth


if __name__ == '__main__':
    unittest.main()
