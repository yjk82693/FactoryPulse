import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getConfig } from "../config";
import { useAccessToken } from "../auth/useAccessToken";
import { DemoSource } from "../data/DemoSource";
import { LiveSource } from "../data/LiveSource";
import { useFactoryStream } from "../hooks/useFactoryStream";
import { Header } from "../components/Header";
import { MachineStatusCard } from "../components/MachineStatusCard";
import { WorkflowStepper } from "../components/WorkflowStepper";
import { ActivityChart } from "../components/ActivityChart";
import { ActivityIndicator } from "../components/ActivityIndicator";
import { AlertPanel } from "../components/AlertPanel";
import { EventTimeline } from "../components/EventTimeline";
import { StepDurationChart } from "../components/StepDurationChart";
import { ApiClientError } from "../services/api";
import { NO_COMPANY_MESSAGE } from "../services/ws";
import type { MeResponse } from "../types/contract";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const config = getConfig();
  const navigate = useNavigate();
  const { getToken, userName } = useAccessToken();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const stableGetToken = useCallback(() => getTokenRef.current(), []);
  const demoUserName = config.demoMode ? userName : null;

  const source = useMemo(() => {
    if (config.demoMode) {
      return new DemoSource({
        authDisabled: config.authDisabled,
        authName: demoUserName,
      });
    }
    return new LiveSource({
      apiUrl: config.apiUrl as string,
      wsUrl: config.wsUrl as string,
      authDisabled: config.authDisabled,
      getToken: stableGetToken,
    });
  }, [config, demoUserName, stableGetToken]);

  const stream = useFactoryStream(source);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (config.demoMode || !(source instanceof LiveSource)) {
      return;
    }
    let cancelled = false;
    void source
      .fetchMe()
      .then((identity) => {
        if (!cancelled) {
          setMe(identity);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.status === 403) {
          navigate("/access-denied", { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, config.demoMode, navigate]);

  useEffect(() => {
    if (stream.status === "error" && stream.statusDetail === NO_COMPANY_MESSAGE) {
      navigate("/access-denied", { replace: true });
    }
  }, [stream.status, stream.statusDetail, navigate]);

  const companyName = config.demoMode
    ? `${stream.state?.company.name ?? stream.ready?.company.name ?? "Demo Manufacturing"} (demo data)`
    : (me?.company.name ?? stream.state?.company.name ?? stream.ready?.company.name ?? "—");
  const resolvedUser =
    me?.user.name ??
    stream.ready?.user.name ??
    userName ??
    (config.authDisabled && config.demoMode ? "Demo Operator" : config.authDisabled ? "Dev User" : "—");
  const role = config.demoMode ? null : (me?.role ?? null);

  async function onAcknowledge(alertId: string): Promise<void> {
    setPendingId(alertId);
    try {
      await stream.acknowledge(alertId);
    } catch {
      /* Rollback is handled in the stream hook. Keep last known alerts visible. */
    } finally {
      setPendingId(null);
    }
  }

  const method = stream.state?.sensor.method ?? null;
  const connected = stream.state?.sensor.connected ?? false;
  const backendLive = stream.status === "live" || stream.status === "demo";
  const connectionNote =
    stream.status === "connecting" && !stream.state
      ? (stream.statusDetail ?? "Connecting to FactoryPulse…")
      : stream.statusDetail &&
          (stream.status === "reconnecting" || stream.status === "offline" || stream.status === "error")
        ? stream.statusDetail
        : null;

  return (
    <div className={styles.shell}>
      <Header
        companyName={companyName}
        userName={resolvedUser}
        role={role}
        status={stream.status}
        statusDetail={stream.statusDetail}
        demoMode={config.demoMode}
      />
      <main className={styles.dashboard}>
        {connectionNote ? <div className={styles.statusNote}>{connectionNote}</div> : null}
        <div className={styles.left}>
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
          <div className={styles.activityIndicator}>
            {stream.state ? (
              <ActivityIndicator sensor={stream.state.sensor} backendLive={backendLive} />
            ) : (
              <section className="panel">
                <div className="panel-title">Activity score</div>
                <p className="panel-subtitle">Waiting for sensor state.</p>
              </section>
            )}
          </div>
        </div>
        <div className={styles.center}>
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
                <p className="panel-subtitle">Waiting for machine workflow.</p>
              </section>
            )}
          </div>
          <div className={styles.activityChart}>
            <ActivityChart
              samples={stream.samples}
              method={method}
              connected={connected}
              backendLive={backendLive}
            />
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.alertPanel}>
            <AlertPanel
              alerts={stream.state?.alerts ?? []}
              voiceEnabled={!config.demoMode && Boolean(stream.state?.server.voice_enabled)}
              fetchVoice={
                !config.demoMode && source instanceof LiveSource
                  ? (alertId) => source.fetchVoice(alertId)
                  : null
              }
              explainEnabled={!config.demoMode && Boolean(stream.state?.server.explain_enabled)}
              fetchExplain={
                !config.demoMode && source instanceof LiveSource
                  ? (alertId) => source.explain(alertId)
                  : null
              }
              machineId={stream.state?.machine.machine_id ?? null}
              currentStep={stream.state?.machine.current_step ?? null}
              events={stream.events}
              onAcknowledge={(id) => void onAcknowledge(id)}
              pendingId={pendingId}
            />
          </div>
          <div className={styles.eventTimeline}>
            <EventTimeline events={stream.events} />
            <StepDurationChart />
          </div>
        </div>
      </main>
      <p className="disclaimer">
        Prototype only. The assembly cell is a simulated machine. Wi-Fi CSI activity is an operational
        observation for review, not certified safety monitoring, localization, or identification.
      </p>
    </div>
  );
}
