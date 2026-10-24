import { Outlet, Route, Routes } from "react-router-dom";
import { AuthGate, ProtectedRoute } from "./auth/AuthGate";
import { ConfiguredConsoleProvider } from "./console/ConsoleContext";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MachinesPage } from "./pages/MachinesPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { SensorsPage } from "./pages/SensorsPage";
import { OptimizerPage } from "./pages/OptimizerPage";
import { SensorPlacementPage } from "./pages/SensorPlacementPage";
import { AccessDenied } from "./pages/AccessDenied";
import { NotFound } from "./pages/NotFound";

function ProtectedConsole() {
  return (
    <ProtectedRoute>
      <ConfiguredConsoleProvider>
        <Outlet />
      </ConfiguredConsoleProvider>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route element={<ProtectedConsole />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/optimizer" element={<OptimizerPage />} />
          <Route path="/optimizer/sensors" element={<SensorPlacementPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthGate>
  );
}
