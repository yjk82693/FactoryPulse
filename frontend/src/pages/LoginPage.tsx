import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { getConfig } from "../config";
import { BrandMark } from "../components/BrandMark";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const config = getConfig();
  if (config.authDisabled) {
    return <DisabledLogin />;
  }
  return <AuthLogin />;
}

function DisabledLogin() {
  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <BrandMark size="lg" />
        <h1 className={styles.title}>Sign in to FactoryPulse</h1>
        <p className={styles.copy}>
          Authentication is disabled for local development. Continue to the assembly cell dashboard
          without Auth0.
        </p>
        <Link className={styles.primary} to="/dashboard">
          Continue to dashboard
        </Link>
        <Link className={styles.back} to="/">
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

function AuthLogin() {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const location = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const returnTo = safeReturnTo((location.state as { from?: string } | null)?.from);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.panel}>
          <BrandMark size="lg" />
          <p className={styles.copy}>Checking session…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  async function startLogin(): Promise<void> {
    setActionError(null);
    try {
      await loginWithRedirect({
        appState: { returnTo },
        authorizationParams: {
          audience: getConfig().auth0Audience ?? undefined,
          redirect_uri: window.location.origin,
          scope: "openid profile email",
        },
      });
    } catch {
      setActionError("Unable to start Auth0 login. Check the Auth0 application settings and try again.");
    }
  }

  const message = actionError ?? error?.message ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <BrandMark size="lg" />
        <h1 className={styles.title}>Sign in to FactoryPulse</h1>
        <p className={styles.copy}>Use your company account through Auth0 Universal Login.</p>
        {message ? <p className={styles.error}>{message}</p> : null}
        <button className={styles.primary} type="button" onClick={() => void startLogin()}>
          Continue with Auth0
        </button>
        <Link className={styles.back} to="/">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
