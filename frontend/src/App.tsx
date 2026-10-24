import { Route, Routes } from "react-router-dom";
import { AuthGate, ProtectedRoute } from "./auth/AuthGate";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { OptimizerPage } from "./pages/OptimizerPage";
import { AccessDenied } from "./pages/AccessDenied";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/optimizer"
          element={
            <ProtectedRoute>
              <OptimizerPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthGate>
  );
}
