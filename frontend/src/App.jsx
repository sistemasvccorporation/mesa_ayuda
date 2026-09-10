import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SolicitudesPage from "./pages/SolicitudesPage.jsx";
import NuevaSolicitudPage from "./pages/NuevaSolicitudPage.jsx";
import DetalleSolicitudPage from "./pages/DetalleSolicitudPage.jsx";
import RolesPage from "./pages/RolesPage.jsx";
import CatalogosPage from "./pages/CatalogosPage.jsx";
import ConfiguracionPage from "./pages/ConfiguracionPage.jsx";
import PerfilPage from "./pages/PerfilPage.jsx";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-brand-charcoal">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="solicitudes" element={<SolicitudesPage />} />
        <Route path="solicitudes/nueva" element={<NuevaSolicitudPage />} />
        <Route path="solicitudes/:id" element={<DetalleSolicitudPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route
          path="admin/roles"
          element={
            <AdminRoute>
              <RolesPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/catalogos"
          element={
            <AdminRoute>
              <CatalogosPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/configuracion"
          element={
            <AdminRoute>
              <ConfiguracionPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
