import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigError, parseConfig } from "./config";
import "./styles/tokens.css";
import "./styles/global.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

try {
  parseConfig();
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof ConfigError ? error.message : "Invalid frontend configuration.";
  root.render(
    <div className="config-error">
      <h1>Configuration error</h1>
      <p>{message}</p>
    </div>,
  );
}
