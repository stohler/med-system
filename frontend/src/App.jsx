import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./state";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleRoute } from "./components/RoleRoute";
import { LoginPage } from "./pages/LoginPage";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientDetailPage } from "./pages/PatientDetailPage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { EncountersPage } from "./pages/EncountersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AccessProfilesPage } from "./pages/AccessProfilesPage";
import { ToastProvider } from "./toast";

function HomeRoutes() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<AppointmentsPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/patients/:id" element={<PatientDetailPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route
                  path="/encounters"
                  element={
                    <RoleRoute roles={["admin", "doctor", "assistant"]}>
                      <EncountersPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <RoleRoute roles={["admin", "doctor", "assistant"]}>
                      <ReportsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RoleRoute roles={["admin", "doctor", "assistant"]}>
                      <SettingsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/integrations"
                  element={
                    <RoleRoute roles={["admin", "doctor", "assistant"]}>
                      <IntegrationsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/access-profiles"
                  element={
                    <RoleRoute roles={["admin"]}>
                      <AccessProfilesPage />
                    </RoleRoute>
                  }
                />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HomeRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
