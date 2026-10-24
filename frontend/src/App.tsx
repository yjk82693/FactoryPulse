import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, ProtectedRoute } from "./auth/AuthGate";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { AccessDenied } from "./pages/AccessDenied";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthGate>
  );
}
