import { useState } from "react";
import { ConsoleChrome } from "../components/console/ConsoleChrome";
import chrome from "../components/console/ConsoleChrome.module.css";
import { useConsoleCatalog, useConsoleStore } from "../console/ConsoleContext";
import { KIND_LABEL } from "../console/types";

export function ProfilesPage() {
  const store = useConsoleStore();
  const catalog = useConsoleCatalog();
  const [templateId, setTemplateId] = useState(catalog.templates[0]?.id ?? "");
  const [name, setName] = useState("Press — line 2");
  const [selectedId, setSelectedId] = useState(catalog.profiles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const profile = catalog.profiles.find((item) => item.id === selectedId) ?? null;
  const machine = catalog.machines.find((item) => item.id === catalog.selectedMachineId) ?? null;

  function run(action: () => void): void {
    try {
      setError(null);
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update profile.");
    }
  }

  return (
    <ConsoleChrome>
      <main className={chrome.main}>
        <section className="panel">
          <div className="panel-title">Motion profiles</div>
          <p className="panel-subtitle">
            Templates are reusable. Installation CSI calibration is per machine and synthetic here. A calibrated
            template is not a measured RF fingerprint.
          </p>
        </section>
        {error ? <p className={chrome.warn}>{error}</p> : null}
        <div className={chrome.split}>
          <section className="panel">
            <div className="panel-title">Library</div>
            <div className={chrome.list}>
              {catalog.profiles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${chrome.row} ${item.id === selectedId ? chrome.rowActive : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <strong>
                    {item.name} · {KIND_LABEL[item.machineKind]} v{item.version}
                  </strong>
                  <span className={chrome.meta}>{item.phases.map((phase) => phase.name).join(" → ")}</span>
                </button>
              ))}
            </div>
            <form
              className={chrome.form}
              onSubmit={(event) => {
                event.preventDefault();
                run(() => {
                  const created = store.createProfileFromTemplate(templateId, name);
                  setSelectedId(created.id);
                });
              }}
            >
              <label>
                Template
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {catalog.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profile name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <button className={chrome.primary} type="submit">
                Create from template
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-title">Profile + calibration</div>
            {!profile ? (
              <p className={chrome.empty}>No profile selected.</p>
            ) : (
              <>
                <p className={chrome.meta}>
                  Template {profile.templateId} · version {profile.version}
                </p>
                <ol className={chrome.list}>
                  {profile.phases.map((phase) => (
                    <li key={phase.id} className={chrome.row}>
                      {phase.name} · expected {phase.expectedActivity.toFixed(2)} · {phase.durationTicks} ticks
                    </li>
                  ))}
                </ol>
                <p className={chrome.meta}>
                  Selected machine: {machine ? `${machine.name} (${machine.id})` : "none"}
                </p>
                {machine ? (
                  <div className={chrome.actions}>
                    <button
                      className={chrome.ghost}
                      type="button"
                      onClick={() => run(() => store.setCalibration(profile.id, machine.id, "calibrating"))}
                    >
                      Start calibration
                    </button>
                    <button
                      className={chrome.primary}
                      type="button"
                      onClick={() => run(() => store.setCalibration(profile.id, machine.id, "calibrated"))}
                    >
                      Capture baseline
                    </button>
                  </div>
                ) : null}
                {profile.calibrations.length === 0 ? (
                  <p className={chrome.empty}>No installation calibrations yet.</p>
                ) : (
                  profile.calibrations.map((item) => (
                    <p key={item.machineId} className={chrome.meta}>
                      {item.machineId}: {item.state} v{item.version} — {item.notes}
                    </p>
                  ))
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </ConsoleChrome>
  );
}
