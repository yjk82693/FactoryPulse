-- Composite foreign keys preserve tenant boundaries, even for direct DB writes.
ALTER TABLE console_profile_versions ADD COLUMN profile_id TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED;
ALTER TABLE console_profile_versions ADD FOREIGN KEY(company_id,profile_id) REFERENCES console_profiles(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE console_machines ADD COLUMN zone_id TEXT GENERATED ALWAYS AS (data->>'zone_id') STORED;
ALTER TABLE console_machines ADD COLUMN profile_id TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED;
ALTER TABLE console_machines ADD FOREIGN KEY(company_id,zone_id) REFERENCES console_zones(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE console_machines ADD FOREIGN KEY(company_id,profile_id) REFERENCES console_profiles(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE console_calibrations ADD COLUMN machine_id TEXT GENERATED ALWAYS AS (data->>'machine_id') STORED;
ALTER TABLE console_calibrations ADD COLUMN profile_id TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED;
ALTER TABLE console_calibrations ADD COLUMN profile_version_id TEXT GENERATED ALWAYS AS (data->>'profile_version_id') STORED;
ALTER TABLE console_calibrations ADD FOREIGN KEY(company_id,machine_id) REFERENCES console_machines(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE console_calibrations ADD FOREIGN KEY(company_id,profile_id) REFERENCES console_profiles(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE console_calibrations ADD FOREIGN KEY(company_id,profile_version_id) REFERENCES console_profile_versions(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sensing_links ADD COLUMN zone_id TEXT GENERATED ALWAYS AS (data->>'zone_id') STORED;
ALTER TABLE sensing_links ADD COLUMN physical_sensor_id TEXT GENERATED ALWAYS AS (data->>'physical_sensor_id') STORED;
ALTER TABLE sensing_links ADD FOREIGN KEY(company_id,zone_id) REFERENCES console_zones(company_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sensing_links ADD FOREIGN KEY(company_id,physical_sensor_id) REFERENCES physical_sensors(company_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION reject_profile_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Profile versions are immutable'; END $$;
CREATE TRIGGER immutable_profile_version BEFORE UPDATE ON console_profile_versions FOR EACH ROW EXECUTE FUNCTION reject_profile_version_update();
