-- Additive migration; executed transactionally under an advisory lock.
CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE users (id TEXT PRIMARY KEY, auth0_sub TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT);
CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  role TEXT NOT NULL CHECK (role IN ('operator', 'supervisor')),
  PRIMARY KEY (user_id, company_id)
);
CREATE TABLE console_zones (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE console_profiles (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE console_profile_versions (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE UNIQUE INDEX profile_version_number ON console_profile_versions(company_id,(data->>'profile_id'),((data->>'version')::int));
CREATE TABLE console_machines (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE console_calibrations (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE UNIQUE INDEX calibration_installation ON console_calibrations(company_id,(data->>'profile_id'),(data->>'machine_id'));
CREATE TABLE physical_sensors (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, key_hash TEXT NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE sensing_links (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE sensing_link_machines (
  company_id TEXT NOT NULL, link_id TEXT NOT NULL, machine_id TEXT NOT NULL,
  PRIMARY KEY(company_id,link_id,machine_id),
  FOREIGN KEY(company_id,link_id) REFERENCES sensing_links(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,machine_id) REFERENCES console_machines(company_id,id) ON DELETE CASCADE
);
CREATE TABLE event_ids (event_id UUID PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE events (ts TIMESTAMPTZ NOT NULL, event_id UUID NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id), received_at TIMESTAMPTZ NOT NULL DEFAULT now(), data JSONB NOT NULL);
CREATE INDEX events_id ON events(event_id);
CREATE INDEX events_company_ts ON events(company_id,ts DESC);
-- Tiger Data supplies TimescaleDB. Ordinary PostgreSQL can also run this schema.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb') THEN
    PERFORM create_hypertable('events','ts',if_not_exists=>TRUE);
  END IF;
END $$;
CREATE TABLE alerts (company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY(company_id,id));
CREATE TABLE live_snapshots (company_id TEXT PRIMARY KEY REFERENCES companies(id), data JSONB NOT NULL);
