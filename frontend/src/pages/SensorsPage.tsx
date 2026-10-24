import { useState } from "react";
import { ConsoleChrome } from "../components/console/ConsoleChrome";
import chrome from "../components/console/ConsoleChrome.module.css";
import { linkAmbiguity } from "../console/ambiguity";
import { useConsoleCatalog, useConsoleStore } from "../console/ConsoleContext";
import type { SensingMode } from "../console/types";

export function SensorsPage() {
  const store = useConsoleStore();
  const catalog = useConsoleCatalog();
  const [name, setName] = useState("CSI link Zone A extra");
  const [mode, setMode] = useState<SensingMode>("shared_zone");
  const [zoneId, setZoneId] = useState(catalog.zones[0]?.id ?? "");
  const [machineIds, setMachineIds] = useState<string[]>(catalog.machines.slice(0, 2).map((item) => item.id));
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string): void {
    setMachineIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <ConsoleChrome>
      <main className={chrome.main}>
        <section className="panel">
          <div className="panel-title">Sensor assignment</div>
          <p className="panel-subtitle">
            Map illustrative CSI links to machines or zones. A dedicated link is not perfect isolation. Shared
            zones can overlap.
          </p>
        </section>
        {error ? <p className={chrome.warn}>{error}</p> : null}
        <div className={chrome.split}>
          <section className="panel">
            <div className="panel-title">Links</div>
            {catalog.links.length === 0 ? (
              <p className={chrome.empty}>No sensing links.</p>
            ) : (
              <div className={chrome.list}>
                {catalog.links.map((link) => (
                  <article key={link.id} className={chrome.row}>
                    <strong>
                      {link.name} · {link.mode}
                    </strong>
                    <span className={chrome.meta}>
                      {link.id} · {catalog.zones.find((zone) => zone.id === link.zoneId)?.name} · machines{" "}
                      {link.machineIds.join(", ")}
                    </span>
                    <p className={chrome.warn}>{linkAmbiguity(link, catalog)}</p>
                    <button className={chrome.danger} type="button" onClick={() => store.deleteLink(link.id)}>
                      Remove
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">Add or replace link</div>
            <form
              className={chrome.form}
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  setError(null);
                  store.upsertLink({ name, mode, zoneId, machineIds });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Unable to save link.");
                }
              }}
            >
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Mode
                <select value={mode} onChange={(event) => setMode(event.target.value as SensingMode)}>
                  <option value="dedicated">Dedicated</option>
                  <option value="shared_zone">Shared zone</option>
                </select>
              </label>
              <label>
                Zone
                <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
                  {catalog.zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className={chrome.form}>
                <legend className={chrome.meta}>Machines</legend>
                {catalog.machines.map((machine) => (
                  <label key={machine.id}>
                    <input
                      type="checkbox"
                      checked={machineIds.includes(machine.id)}
                      onChange={() => toggle(machine.id)}
                    />{" "}
                    {machine.name}
                  </label>
                ))}
              </fieldset>
              <button className={chrome.primary} type="submit">
                Save link
              </button>
            </form>
          </section>
        </div>
      </main>
    </ConsoleChrome>
  );
}
