import { useState } from "react";
import { Link } from "react-router-dom";
import { ConsoleChrome } from "../components/console/ConsoleChrome";
import chrome from "../components/console/ConsoleChrome.module.css";
import { useConsoleCatalog, useConsoleStore } from "../console/ConsoleContext";
import { KIND_LABEL, type MachineKind, type OperatingStatus } from "../console/types";
import { machineAmbiguity } from "../console/ambiguity";

const STATUSES: OperatingStatus[] = ["IDLE", "RUNNING", "MAINTENANCE", "STOPPED"];

export function MachinesPage() {
  const store = useConsoleStore();
  const catalog = useConsoleCatalog();
  const selected = catalog.machines.find((item) => item.id === catalog.selectedMachineId) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Press-02");
  const [kind, setKind] = useState<MachineKind>("press");
  const profiles = catalog.profiles.filter((profile) => profile.machineKind === kind);

  function run(action: () => void): void {
    try {
      setError(null);
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update registry.");
    }
  }

  return (
    <ConsoleChrome>
      <main className={chrome.main}>
        <section className="panel">
          <div className="panel-title">Machine registry</div>
          <p className="panel-subtitle">
            Functional mock CRUD. Types are Press, Picker, and Conveyor. This is not the four-phase contract
            machine simulator.
          </p>
        </section>
        {error ? <p className={chrome.warn}>{error}</p> : null}
        <div className={chrome.split}>
          <section className="panel">
            <div className="panel-title">Machines · {catalog.machines.length}</div>
            {catalog.machines.length === 0 ? (
              <p className={chrome.empty}>No machines registered.</p>
            ) : (
              <div className={chrome.list}>
                {catalog.machines.map((machine) => (
                  <button
                    key={machine.id}
                    type="button"
                    className={`${chrome.row} ${machine.id === selected?.id ? chrome.rowActive : ""}`}
                    onClick={() => store.selectMachine(machine.id)}
                  >
                    <strong>
                      {machine.name} · {KIND_LABEL[machine.kind]}
                    </strong>
                    <span className={chrome.meta}>
                      {machine.id} · {catalog.zones.find((zone) => zone.id === machine.zoneId)?.name} ·{" "}
                      {machine.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <form
              className={chrome.form}
              onSubmit={(event) => {
                event.preventDefault();
                run(() =>
                  store.createMachine({
                    name,
                    kind,
                    zoneId: catalog.zones[0]?.id ?? "zone-a",
                    status: "IDLE",
                    profileId: profiles[0]?.id ?? "",
                  }),
                );
              }}
            >
              <label>
                New machine
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Type
                <select value={kind} onChange={(event) => setKind(event.target.value as MachineKind)}>
                  {Object.entries(KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button className={chrome.primary} type="submit">
                Register
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-title">Selected machine</div>
            {!selected ? (
              <p className={chrome.empty}>Select a machine to edit.</p>
            ) : (
              <div className={chrome.form}>
                <p className={chrome.meta}>{selected.id}</p>
                <label>
                  Name
                  <input
                    value={selected.name}
                    onChange={(event) => run(() => store.updateMachine(selected.id, { name: event.target.value }))}
                  />
                </label>
                <label>
                  Zone
                  <select
                    value={selected.zoneId}
                    onChange={(event) => run(() => store.updateMachine(selected.id, { zoneId: event.target.value }))}
                  >
                    {catalog.zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operating status
                  <select
                    value={selected.status}
                    onChange={(event) =>
                      run(() => store.updateMachine(selected.id, { status: event.target.value as OperatingStatus }))
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Motion profile
                  <select
                    value={selected.profileId}
                    onChange={(event) =>
                      run(() => store.updateMachine(selected.id, { profileId: event.target.value }))
                    }
                  >
                    {catalog.profiles
                      .filter((profile) => profile.machineKind === selected.kind)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} v{profile.version}
                        </option>
                      ))}
                  </select>
                </label>
                <p className={chrome.meta}>
                  Sensors: {selected.sensorLinkIds.join(", ") || "none"} ·{" "}
                  <Link to="/simulator">Open simulator</Link>
                </p>
                {machineAmbiguity(selected.id, catalog).map((note) => (
                  <p key={note} className={chrome.warn}>
                    {note}
                  </p>
                ))}
                <div className={chrome.actions}>
                  <button className={chrome.danger} type="button" onClick={() => run(() => store.deleteMachine(selected.id))}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </ConsoleChrome>
  );
}
