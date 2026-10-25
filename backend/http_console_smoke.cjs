// Exercise C's unmodified HttpConsoleStore against a real running backend.
// Compile the adapter to a temporary CommonJS directory first (see backend/README.md).
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2]);
const { HttpConsoleStore } = require(path.join(root, 'console/httpStore.js'));
const { createApiClient } = require(path.join(root, 'services/api.js'));

(async () => {
  const store = new HttpConsoleStore(createApiClient({ baseUrl: process.argv[3] || 'http://127.0.0.1:18001', authDisabled: true }));
  await store.refresh();
  assert.equal(store.getMeta().error, null);
  assert.equal(store.getSnapshot().zones.length, 2);
  const profile = await store.createProfileFromTemplate('tpl-press', 'HTTP integration baseline');
  assert.ok(profile.versionId);
  assert.ok(profile.phases.length);
  const machine = await store.createMachine({ name: 'HTTP integration press', kind: 'press', zoneId: 'zone-a', status: 'IDLE', profileId: profile.id });
  await store.setCalibration(profile.id, machine.id, 'calibrating');
  await store.setCalibration(profile.id, machine.id, 'calibrated');
  assert.equal(store.getSnapshot().profiles.find(p => p.id === profile.id).calibrations[0].state, 'calibrated');
  const link = await store.upsertLink({ name: 'HTTP dedicated link', mode: 'dedicated', zoneId: 'zone-a', machineIds: [machine.id], physicalSensorId: 'csi-rx-01' });
  assert.ok(link.ambiguitySummary.includes('does not provide perfect'));
  assert.ok(store.getSnapshot().machines.find(m => m.id === machine.id).sensorLinkIds.includes(link.id));
  await store.updateMachine(machine.id, { status: 'STOPPED' });
  assert.equal(store.getSnapshot().machines.find(m => m.id === machine.id).status, 'STOPPED');
  await store.deleteLink(link.id);
  await store.deleteMachine(machine.id);
  assert.ok(!store.getSnapshot().machines.some(m => m.id === machine.id));
  console.log('PASS: unmodified HttpConsoleStore profile, machine, calibration, link, update and delete integration');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
