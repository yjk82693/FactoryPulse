import { useEffect, useMemo, useState } from "react";
import { getConfig } from "../config";
import { useAccessToken } from "../auth/useAccessToken";
import { Header } from "../components/Header";
import { CostSummary } from "../components/optimizer/CostSummary";
import { FloorGrid } from "../components/optimizer/FloorGrid";
import { totalCost } from "../optimizer/cost";
import { ExampleLayoutProvider } from "../optimizer/provider";
import { optimizeLayout } from "../optimizer/search";
import type { Assignment, LayoutScenario, OptimizeResult } from "../optimizer/types";
import { cloneAssignment, swapStations } from "../optimizer/validate";
import styles from "./OptimizerPage.module.css";

const provider = new ExampleLayoutProvider();

export function OptimizerPage() {
  const config = getConfig();
  const { userName } = useAccessToken();
  const [scenario, setScenario] = useState<LayoutScenario | null>(null);
  const [current, setCurrent] = useState<Assignment>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void provider.loadScenario().then((loaded) => {
      if (!cancelled) {
        setScenario(loaded);
        setCurrent(cloneAssignment(loaded.assignment));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentCost = useMemo(
    () => (scenario ? totalCost(scenario, current) : 0),
    [scenario, current],
  );

  function applyLayout(next: Assignment): void {
    setCurrent(next);
    setResult(null);
  }

  function onSelect(stationId: string): void {
    if (!selectedId || selectedId === stationId) {
      setSelectedId(selectedId === stationId ? null : stationId);
      return;
    }
    applyLayout(swapStations(current, selectedId, stationId));
    setSelectedId(null);
  }

  function onOptimize(): void {
    if (!scenario) {
      return;
    }
    setResult(optimizeLayout(scenario, current));
    setSelectedId(null);
  }

  function onReset(): void {
    if (!scenario) {
      return;
    }
    setCurrent(cloneAssignment(scenario.assignment));
    setResult(null);
    setSelectedId(null);
  }

  return (
    <div className={styles.shell}>
      <Header
        companyName="Demo Manufacturing"
        userName={userName ?? (config.authDisabled ? "Demo Operator" : "—")}
        status="demo"
        statusDetail={null}
        showStreamStatus={false}
        exampleLayout
      />
      <p className={styles.banner}>
        Simulated example floor and directed flow matrix. Workstation coordinates and travel distances are
        not measured from Wi-Fi CSI and are independent of the live assembly-cell stream.
      </p>
      <main className={styles.main}>
        {scenario ? (
          <>
            <div className={styles.floors}>
              <FloorGrid
                title="Current layout"
                scenario={scenario}
                assignment={current}
                selectedId={selectedId}
                interactive
                onSelect={onSelect}
              />
              {result ? (
                <FloorGrid
                  title="Suggested layout"
                  scenario={scenario}
                  assignment={result.assignment}
                  selectedId={selectedId}
                  interactive={false}
                />
              ) : (
                <section className={`panel ${styles.placeholder}`}>
                  <div className="panel-title">Suggested layout</div>
                  <p className="panel-subtitle">
                    Run Optimize Layout to compare a mathematically improved assignment. Changing the current
                    layout clears the previous suggestion.
                  </p>
                </section>
              )}
            </div>
            <CostSummary
              currentCost={currentCost}
              result={result}
              onOptimize={onOptimize}
              onReset={onReset}
            />
          </>
        ) : (
          <p className="panel-subtitle">Loading example layout…</p>
        )}
      </main>
      <p className="disclaimer">
        Prototype only. Optimizer stations are an example floor model, not the four-phase machine workflow.
        CSI activity remains an operational observation, not localization.
      </p>
    </div>
  );
}
