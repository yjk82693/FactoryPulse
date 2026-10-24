import { useMemo, useState } from "react";
import { getConfig } from "../config";
import { useAccessToken } from "../auth/useAccessToken";
import { DemoSource } from "../data/DemoSource";
import { LiveSource } from "../data/LiveSource";
import { useFactoryStream } from "../hooks/useFactoryStream";
import { DemoBanner } from "../components/DemoBanner";
import { Header } from "../components/Header";
import { MachineStatusCard } from "../components/MachineStatusCard";
import { WorkflowStepper } from "../components/WorkflowStepper";
import { ActivityChart } from "../components/ActivityChart";
import { ActivityIndicator } from "../components/ActivityIndicator";
import { AlertPanel } from "../components/AlertPanel";
import { EventTimeline } from "../components/EventTimeline";
import { StepDurationChart } from "../components/StepDurationChart";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const config = getConfig();
  const { getToken, userName } = useAccessToken();
  const source = useMemo(() => {
    if (config.demoMode) {
      return new DemoSource({
        authDisabled: config.authDisabled,
        authName: userName,
      });
    }
    return new LiveSource({
      apiUrl: config.apiUrl as string,
      wsUrl: config.wsUrl as string,
      authDisabled: config.authDisabled,
      getToken,
    });
  }, [config, getToken, userName]);

  const stream = useFactoryStream(source);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const companyName = config.demoMode
    ? `${stream.state?.company.name ?? stream.ready?.company.name ?? "Demo Manufacturing"} (demo data)`
    : (stream.state?.company.name ?? stream.ready?.company.name ?? "—");
  const resolvedUser =
    stream.ready?.user.name ??
    userName ??
    (config.authDisabled && config.demoMode ? "Demo Operator" : config.authDisabled ? "Dev User" : "—");

  async function onAcknowledge(alertId: string): Promise<void> {
    setPendingId(alertId);
    try {
      await stream.acknowledge(alertId);
    } finally {
      setPendingId(null);
    }
  }

  const method = stream.state?.sensor.method ?? null;
  const connected = stream.state?.sensor.connected ?? true;

  return (
    <>
      {config.demoMode ? <DemoBanner /> : null}
      <Header
        companyName={companyName}
        userName={resolvedUser}
        status={stream.status}
        statusDetail={stream.statusDetail}
      />
      <main className={styles.dashboard}>
        {stream.statusDetail &&
        (stream.status === "reconnecting" || stream.status === "offline" || stream.status === "error") ? (
          <div className={styles.statusNote}>{stream.statusDetail}</div>
        ) : null}
        <div className={styles.machineCard}>
          {stream.state ? (
            <MachineStatusCard machine={stream.state.machine} />
          ) : (
            <section className="panel">
              <div className="panel-title">Machine</div>
              <p className="panel-subtitle">
                Waiting for machine state. Last known state will remain visible if the connection drops.
              </p>
            </section>
          )}
        </div>
        <div className={styles.workflowCard}>
          {stream.state ? (
            <WorkflowStepper
              currentStep={stream.state.machine.current_step}
              status={stream.state.machine.status}
              stepStartedAt={stream.state.machine.step_started_at}
            />
          ) : (
            <section className="panel">
              <div className="panel-title">Workflow</div>
            </section>
          )}
        </div>
        <div className={styles.activityChart}>
          <ActivityChart samples={stream.samples} method={method} connected={connected} />
        </div>
        <div className={styles.activityIndicator}>
          {stream.state ? (
            <ActivityIndicator sensor={stream.state.sensor} />
          ) : (
            <section className="panel">
              <div className="panel-title">Activity score</div>
              <p className="panel-subtitle">Waiting for sensor state.</p>
            </section>
          )}
        </div>
        <div className={styles.alertPanel}>
          <AlertPanel
            alerts={stream.state?.alerts ?? []}
            voiceEnabled={Boolean(stream.state?.server.voice_enabled)}
            onAcknowledge={(id) => void onAcknowledge(id)}
            pendingId={pendingId}
          />
        </div>
        <div className={styles.eventTimeline}>
          <EventTimeline events={stream.events} />
          <StepDurationChart />
        </div>
      </main>
      <p className="disclaimer">
        Prototype only. The assembly cell is a simulated machine. Wi-Fi CSI activity is an operational
        observation for review, not certified safety monitoring, localization, or identification.
      </p>
    </>
  );
}
