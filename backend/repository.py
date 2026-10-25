"""Memory development storage or transactional PostgreSQL/Tiger Data storage.

All SQL identifiers come from the fixed table map. Tenant data never selects its own company.
Configured database failures fail closed, rather than silently discarding writes in memory.
"""
from contextlib import contextmanager
from copy import deepcopy
from datetime import timezone
import hashlib
import os
from pathlib import Path
from threading import RLock
from types import SimpleNamespace
from uuid import uuid4

from backend.common import now
from backend.seeds import demo_catalog, empty_catalog

TABLES = dict(zones='console_zones', profiles='console_profiles', profile_versions='console_profile_versions',
              machines='console_machines', calibrations='console_calibrations', sensors='physical_sensors',
              sensing_links='sensing_links')


class Repository:
    def __init__(self, url=None):
        self.url = url
        self.lock = RLock()
        self.catalogs = {'demo-co': demo_catalog()}
        self.identities = {}
        self.owner_connection = None

    @property
    def mode(self):
        return 'tiger_data' if self.url else 'memory'

    def connect(self):
        import psycopg
        conn = psycopg.connect(self.url, connect_timeout=5, autocommit=True)
        try:
            conn.execute("SET TIME ZONE 'UTC'")
            conn.autocommit = False
        except Exception:
            conn.close()
            raise
        return conn

    @contextmanager
    def session(self):
        conn = self.connect()
        try:
            with conn.transaction():
                yield conn
        finally:
            # A deferred constraint can fail during COMMIT, so close in finally.
            conn.close()

    def acquire_live_owner(self):
        # The v1.3 live cell is an in-process aggregate. Multiple simulators must not
        # write stale snapshots or generate competing assembly cycles.
        if self.url:
            self.owner_connection = self.connect()
            if not self.owner_connection.execute('SELECT pg_try_advisory_lock(6413002)').fetchone()[0]:
                self.close()
                raise RuntimeError('Live backend already running; use a single worker')
            self.owner_connection.commit()

    def close(self):
        if self.owner_connection:
            self.owner_connection.close()
            self.owner_connection = None

    def initialize(self):
        if not self.url:
            return
        with self.session() as conn:
            conn.execute('SELECT pg_advisory_xact_lock(6413001)')
            conn.execute('CREATE TABLE IF NOT EXISTS backend_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
            for path in sorted((Path(__file__).parent / 'migrations').glob('*.sql')):
                if not conn.execute('SELECT 1 FROM backend_migrations WHERE version=%s', (path.name,)).fetchone():
                    conn.execute(path.read_text(encoding='utf-8'))
                    conn.execute('INSERT INTO backend_migrations(version) VALUES (%s)', (path.name,))
            conn.execute("INSERT INTO companies VALUES ('demo-co','Demo Manufacturing') ON CONFLICT DO NOTHING")
            # Seed only on the first migration, never recreate user-deleted resources on restart.
            if not conn.execute("SELECT 1 FROM backend_migrations WHERE version='demo-seed'").fetchone():
                self._save_catalog(conn, 'demo-co', demo_catalog())
                conn.execute("INSERT INTO backend_migrations(version) VALUES ('demo-seed')")

    @contextmanager
    def catalog(self, company, write=False):
        if not self.url:
            with self.lock:
                data = deepcopy(self.catalogs.get(company, empty_catalog()))
                yield data
                if write:
                    self.catalogs[company] = data
            return
        with self.session() as conn:
            # Serialize mutations of a company's aggregate across workers.
            conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (company,))
            data = {key: [row[0] for row in conn.execute(f'SELECT data FROM {table} WHERE company_id=%s ORDER BY id', (company,))]
                    for key, table in TABLES.items()}
            yield data
            if write:
                self._save_catalog(conn, company, data)

    def _save_catalog(self, conn, company, data):
        from psycopg.types.json import Jsonb
        conn.execute('DELETE FROM sensing_link_machines WHERE company_id=%s', (company,))
        for key, table in TABLES.items():
            if key == 'sensors':
                continue  # Credentials are provisioned only by startup configuration.
            ids = [row['id'] for row in data[key]]
            conn.execute(f'DELETE FROM {table} WHERE company_id=%s AND NOT (id=ANY(%s::text[]))', (company, ids))
            for row in data[key]:
                if key == 'profile_versions':
                    conn.execute(f'INSERT INTO {table}(company_id,id,data) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING', (company, row['id'], Jsonb(row)))
                else:
                    conn.execute(f'INSERT INTO {table}(company_id,id,data) VALUES (%s,%s,%s) ON CONFLICT(company_id,id) DO UPDATE SET data=excluded.data', (company, row['id'], Jsonb(row)))
        for link in data['sensing_links']:
            for machine in link['machine_ids']:
                conn.execute('INSERT INTO sensing_link_machines VALUES (%s,%s,%s)', (company, link['id'], machine))

    def provision_sensor(self):
        sid = os.getenv('SENSOR_ID', 'csi-rx-01')
        key_hash = hashlib.sha256(os.environ['SENSOR_INGEST_KEY'].encode()).hexdigest()
        row = dict(id=sid, company_id='demo-co', bound_machine_id='assembly_01', active=True, created_at=now())
        if self.url:
            from psycopg.types.json import Jsonb
            with self.session() as conn:
                conn.execute('INSERT INTO physical_sensors VALUES (%s,%s,%s,%s) ON CONFLICT(company_id,id) DO UPDATE SET key_hash=excluded.key_hash, data=excluded.data', ('demo-co', sid, Jsonb(row), key_hash))
        else:
            with self.lock:
                self.catalogs['demo-co']['sensors'] = [row]
        self.sensor_id, self.sensor_hash = sid, key_hash

    def identity(self, subject, auto_join=False):
        if not self.url:
            with self.lock:
                if subject not in self.identities and auto_join:
                    self.identities[subject] = dict(user=dict(id=str(uuid4()), name=subject, email=None), company=dict(id='demo-co', name='Demo Manufacturing'), role='operator')
                return deepcopy(self.identities.get(subject))
        with self.session() as conn:
            if auto_join:
                conn.execute('INSERT INTO users VALUES (%s,%s,%s,NULL) ON CONFLICT(auth0_sub) DO NOTHING', (str(uuid4()), subject, subject))
                conn.execute("INSERT INTO memberships SELECT id,'demo-co','operator' FROM users WHERE auth0_sub=%s AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id=users.id) ON CONFLICT DO NOTHING", (subject,))
            rows = conn.execute('SELECT u.id,u.name,u.email,c.id,c.name,m.role FROM users u JOIN memberships m ON m.user_id=u.id JOIN companies c ON c.id=m.company_id WHERE u.auth0_sub=%s ORDER BY c.id', (subject,)).fetchall()
            # Contract has no tenant-selection header: ambiguous multi-membership fails closed.
            if len(rows) != 1:
                return None
            uid, name, email, cid, cname, role = rows[0]
            return dict(user=dict(id=uid, name=name, email=email), company=dict(id=cid, name=cname), role=role)

    @contextmanager
    def live_transaction(self, company):
        if not self.url:
            yield None
            return
        with self.session() as conn:
            conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,1))', (company,))
            yield conn

    def record_event(self, company, event, conn=None):
        if not self.url:
            return True
        from psycopg.types.json import Jsonb
        result = conn.execute('INSERT INTO event_ids(event_id,company_id) VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING event_id', (event['event_id'], company)).fetchone()
        if not result:
            return False
        conn.execute('INSERT INTO events(ts,event_id,company_id,data) VALUES (%s,%s,%s,%s)', (event['timestamp'], event['event_id'], company, Jsonb(event)))
        return True

    def save_live(self, company, hub, conn):
        if not self.url:
            return
        from psycopg.types.json import Jsonb
        for alert in hub.alerts:
            conn.execute('INSERT INTO alerts VALUES (%s,%s,%s) ON CONFLICT(company_id,id) DO UPDATE SET data=excluded.data', (company, alert['alert_id'], Jsonb(alert)))
        snapshot = dict(machine=hub.machine, sensor=hub.sensor, review_cycle=hub.review_cycle)
        conn.execute('INSERT INTO live_snapshots VALUES (%s,%s) ON CONFLICT(company_id) DO UPDATE SET data=excluded.data', (company, Jsonb(snapshot)))

    def restore_live(self, company, hub):
        if not self.url:
            return
        with self.session() as conn:
            hub.events.extend(row[0] for row in conn.execute('SELECT data FROM events WHERE company_id=%s ORDER BY ts DESC LIMIT 10000', (company,)))
            hub.alerts.extend(row[0] for row in conn.execute("SELECT data FROM alerts WHERE company_id=%s ORDER BY (data->>'created_at') DESC", (company,)))
            snapshot = conn.execute('SELECT data FROM live_snapshots WHERE company_id=%s', (company,)).fetchone()
            if snapshot:
                for key, value in snapshot[0].items():
                    setattr(hub, key, value)
                hub.sensor['connected'] = False
            hub.ids.extend(e['event_id'] for e in hub.events)
            hub.seen.update(hub.ids)

    def event_history(self, company, limit, before=None):
        with self.session() as conn:
            return [row[0] for row in conn.execute('SELECT data FROM events WHERE company_id=%s AND (%s::timestamptz IS NULL OR ts<%s) ORDER BY ts DESC LIMIT %s', (company, before, before, limit))]

    def briefing_context(self, company, alert_id, hub):
        """Provide C's router durable context, even after the event ring has rotated."""
        if not self.url:
            return hub
        with self.session() as conn:
            row = conn.execute('SELECT data FROM alerts WHERE company_id=%s AND id=%s', (company, alert_id)).fetchone()
            alerts = [row[0]] if row else []
            related = row[0].get('related_event_ids', []) if row else []
            events = [r[0] for r in conn.execute('SELECT data FROM events WHERE company_id=%s AND event_id=ANY(%s::uuid[]) ORDER BY ts DESC', (company, related))]
            return SimpleNamespace(alerts=alerts, events=events, machine=hub.machine, sensor=hub.sensor)

    def metrics(self, company):
        with self.session() as conn:
            rows = conn.execute("SELECT data->'payload'->>'step',avg((data->'payload'->>'duration_ms')::float),count(*),date_trunc('hour',ts) FROM events WHERE company_id=%s AND data->>'event_type'='STEP_COMPLETED' GROUP BY 1,4 ORDER BY 4 DESC", (company,)).fetchall()
            return [dict(step=s, avg_ms=a, count=c, bucket=b.astimezone(timezone.utc).isoformat().replace('+00:00','Z')) for s,a,c,b in rows]
