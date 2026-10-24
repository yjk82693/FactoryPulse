# FactoryPulse
Smart assembly cell monitoring for HackPSU Fall 2026: real Wi-Fi CSI activity sensing (2x ESP32) combined with a simulated assembly machine, context-aware alerts, and a live dashboard.
Prototype only. The machine is simulated, and this is not a certified safety system.

Run physical CSI sensing through the backend to the React dashboard: [Live CSI setup](docs/live-csi.md).

| Directory | Owner |
|---|---|
| firmware/, sensing/ | Developer A (ESP32, Wi-Fi CSI) |
| backend/ | Developer B (FastAPI, simulator, Tiger Data, Auth0, ElevenLabs) |
| frontend/ | Developer C (React dashboard, Auth0, voice UI) |
| docs/event-schema.md | Shared contract, changed only with all three agreeing |
