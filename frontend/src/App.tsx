import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import InstitucionesPage from "./pages/InstitucionesPage";
import UsuariosPage from "./pages/UsuariosPage";
import EstudiantesPage from "./pages/EstudiantesPage";
import CarnetEstudiantePage from "./pages/CarnetEstudiantePage";
import AcademicoPage from "./pages/AcademicoPage";
import AsistenciaPage from "./pages/AsistenciaPage";
import ReportesPage from "./pages/ReportesPage";
import HorariosPage from "./pages/HorariosPage";
import BoletaMatriculaPage from "./pages/BoletaMatriculaPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/restablecer-clave" element={<ResetPasswordPage />} />

        <Route
          path="/estudiantes/:id/carnet"
          element={
            <ProtectedRoute>
              <CarnetEstudiantePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/boletas/matricula/:matriculaId"
          element={
            <ProtectedRoute>
              <BoletaMatriculaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="instituciones" element={<InstitucionesPage />} />
          <Route
            path="usuarios"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "SUPER_ADMIN",
                  "ADMIN_INSTITUCIONAL",
                  "ADMINISTRATIVO"
                ]}
              >
                <UsuariosPage />
              </ProtectedRoute>
            }
          />
          <Route path="estudiantes" element={<EstudiantesPage />} />
          <Route path="academico" element={<AcademicoPage />} />
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="asistencia" element={<AsistenciaPage />} />
          <Route path="reportes" element={<ReportesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}