import { useAuth0 } from "@auth0/auth0-react";
import { Navigate } from "react-router-dom";
import { getConfig } from "../config";

export function LoginPage() {
  const config = getConfig();
  if (config.authDisabled) {
    return <Navigate to="/" replace />;
  }
  return <AuthLogin />;
}

function AuthLogin() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
  if (isLoading) {
    return <div className="boot">Loading…</div>;
  }
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="boot">
      <div>
        <h1>FactoryPulse</h1>
        <p>Sign in with your company account.</p>
        <button type="button" onClick={() => void loginWithRedirect()}>
          Log in
        </button>
      </div>
    </div>
  );
}
