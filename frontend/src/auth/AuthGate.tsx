import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useMemo, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getConfig } from "../config";
import { TokenContext } from "./tokenContext";

export function AuthGate({ children }: { children: ReactNode }) {
  const config = getConfig();
  if (config.authDisabled) {
    return <DisabledAuth>{children}</DisabledAuth>;
  }
  return <Auth0App>{children}</Auth0App>;
}

function DisabledAuth({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      getToken: async () => null,
      userName: null,
    }),
    [],
  );
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

function Auth0App({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const config = getConfig();
  return (
    <Auth0Provider
      domain={config.auth0Domain as string}
      clientId={config.auth0ClientId as string}
      cacheLocation="memory"
      onRedirectCallback={(appState) => {
        navigate((appState?.returnTo as string | undefined) ?? "/dashboard", { replace: true });
      }}
      authorizationParams={{
        audience: config.auth0Audience as string,
        redirect_uri: window.location.origin,
        scope: "openid profile email",
      }}
    >
      <Auth0TokenBridge>{children}</Auth0TokenBridge>
    </Auth0Provider>
  );
}

function Auth0TokenBridge({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, user } = useAuth0();
  const value = useMemo(
    () => ({
      getToken: async () =>
        (await getAccessTokenSilently({
          authorizationParams: {
            audience: getConfig().auth0Audience ?? undefined,
          },
        })) ?? null,
      userName: user?.name ?? user?.nickname ?? null,
    }),
    [getAccessTokenSilently, user],
  );
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const config = getConfig();
  if (config.authDisabled || config.demoMode) {
    return children;
  }
  return <AuthRequired>{children}</AuthRequired>;
}

function AuthRequired({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth0();
  const location = useLocation();
  if (isLoading) {
    return <div className="boot">Checking session…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
