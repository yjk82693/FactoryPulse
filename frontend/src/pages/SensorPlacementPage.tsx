import { ConsoleChrome, OptimizerSubnav } from "../components/console/ConsoleChrome";
import chrome from "../components/console/ConsoleChrome.module.css";
import { evaluatePlacement, recommendPlacement } from "../console/placement";
import { useConsoleCatalog } from "../console/ConsoleContext";

export function SensorPlacementPage() {
  const catalog = useConsoleCatalog();
  const strategies = evaluatePlacement(catalog);
  const recommended = recommendPlacement(strategies);

  return (
    <ConsoleChrome exampleLabel="Illustrative sensor-placement model">
      <OptimizerSubnav />
      <main className={chrome.main}>
        <section className="panel">
          <div className="panel-title">Sensor placement optimizer</div>
          <p className="panel-subtitle">
            Assumptions: unit hardware cost $1,200 per link; coverage and ambiguity are labeled scores, not
            measured RF propagation or sensing accuracy. This is separate from the factory layout travel-cost
            optimizer.
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">Strategies</div>
          <div className={chrome.list}>
            {strategies.map((item) => (
              <article
                key={item.id}
                className={`${chrome.row} ${item.id === recommended.id ? chrome.rowActive : ""}`}
              >
                <strong>
                  {item.label}
                  {item.id === recommended.id ? " · recommended" : ""}
                </strong>
                <span className={chrome.meta}>
                  sensors {item.sensorCount} · cost ${item.hardwareCost.toLocaleString()} · coverage{" "}
                  {(item.coverage * 100).toFixed(0)}% · ambiguity {(item.ambiguity * 100).toFixed(0)}%
                </span>
                <span>{item.notes}</span>
              </article>
            ))}
          </div>
        </section>
      </main>
    </ConsoleChrome>
  );
}
