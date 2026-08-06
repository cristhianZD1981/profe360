import { Routes, Route, Navigate } from "react-router-dom";
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
import BoletaConductaPage from "./pages/BoletaConductaPage";
import GestionProfePage from "./pages/GestionProfePage";
import PlaneamientoIAPage from "./pages/PlaneamientoIAPage";
import ConfiguracionIAPage from "./pages/ConfiguracionIAPage";
import SeguimientoNotasPage from "./pages/SeguimientoNotasPage";
import ParametrizacionesPage from "./pages/ParametrizacionesPage";
import EvaluacionParametrizacionPage from "./pages/EvaluacionParametrizacionPage";
import AssistantAdminPage from "./pages/AssistantAdminPage";
import SuperAdminSeccionesPage from "./pages/SuperAdminSeccionesPage";
import SuperAdminConsecutivosPage from "./pages/SuperAdminConsecutivosPage";
import ExternalChatWidget from "./components/ExternalChatWidget";
import GruposClasePage from "./pages/GruposClasePage";

const ADMINISTRATIVO_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "ADMINISTRATIVO"
];

const PARAMETRIZACIONES_ROLES = ["SUPER_ADMIN"];

const GESTION_PROFE_ROLES = [
  "SUPER_ADMIN",
  "PROFESOR",
  "PROFESOR_GUIA"
];

const SUPER_ADMIN_ROLES = ["SUPER_ADMIN"];

const REPORTE_CERTIFICACIONES_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "ADMINISTRATIVO",
  "PROFESOR_GUIA"
];

export default function App() {
  return (
    <AuthProvider>
      <ExternalChatWidget />
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
          path="/boletas/conducta/:boletaConductaId"
          element={
            <ProtectedRoute>
              <BoletaConductaPage />
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
                allowedRoles={ADMINISTRATIVO_ROLES}
              >
                <UsuariosPage />
              </ProtectedRoute>
            }
          />
          <Route path="estudiantes" element={<EstudiantesPage />} />
          <Route
            path="administrativo"
            element={
              <ProtectedRoute
                allowedRoles={ADMINISTRATIVO_ROLES}
              >
                <AcademicoPage
                  visibleTabs={[
                    "anios",
                    "periodos",
                    "periodosProfesor",
                    "grupos",
                    "tiposEstudiante",
                    "tiposAdecuacion",
                    "adecuaciones",
                    "especialidades",
                    "rutasTransporte",
                    "materias",
                    "habilidadesPlaneamiento",
                    "asignaciones",
                    "profesGuia12",
                    "bloques",
                    "gruposMateria",
                    "horarios",
                    "fechasClase",
                    "diasLectivos",
                    "feriados",
                    "consecutivos",
                    "configuracionCorreo",
                    "mensajes"
                  ]}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="academico"
            element={
              <ProtectedRoute
                allowedRoles={ADMINISTRATIVO_ROLES}
              >
                <AcademicoPage
                  visibleTabs={[
                    "anios",
                    "periodos",
                    "periodosProfesor",
                    "grupos",
                    "tiposEstudiante",
                    "tiposAdecuacion",
                    "adecuaciones",
                    "especialidades",
                    "rutasTransporte",
                    "materias",
                    "habilidadesPlaneamiento",
                    "asignaciones",
                    "bloques",
                    "gruposMateria",
                    "horarios",
                    "fechasClase",
                    "diasLectivos",
                    "feriados",
                    "consecutivos",
                    "configuracionCorreo",
                    "mensajes"
                  ]}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="matricula"
            element={
              <ProtectedRoute
                allowedRoles={ADMINISTRATIVO_ROLES}
              >
                <AcademicoPage initialTab="matriculas" visibleTabs={["matriculas"]} />
              </ProtectedRoute>
            }
          />
          <Route
            path="parametrizaciones"
            element={
              <ProtectedRoute
                allowedRoles={PARAMETRIZACIONES_ROLES}
              >
                <ParametrizacionesPage />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="evaluaciones" replace />} />
            <Route path="habilidades-planeamiento" element={<Navigate to="/administrativo" replace />} />
            <Route path="evaluaciones" element={<EvaluacionParametrizacionPage />} />
            <Route path="promt-ia" element={<ConfiguracionIAPage />} />
            <Route path="configuracion-ia" element={<Navigate to="../promt-ia" replace />} />
          </Route>
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="asistencia" element={<AsistenciaPage />} />
          <Route
            path="seguimiento-notas"
            element={
              <ProtectedRoute
                allowedRoles={["SUPER_ADMIN"]}
              >
                <SeguimientoNotasPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="grupos-clase"
            element={
              <ProtectedRoute allowedRoles={ADMINISTRATIVO_ROLES}>
                <GruposClasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="gestion-profe"
            element={
              <ProtectedRoute
                allowedRoles={GESTION_PROFE_ROLES}
              >
                <GestionProfePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="planeamiento-ia"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "SUPER_ADMIN",
                  "ADMIN_INSTITUCIONAL",
                  "ADMINISTRATIVO",
                  "PROFESOR",
                  "PROFESOR_GUIA"
                ]}
              >
                <PlaneamientoIAPage />
              </ProtectedRoute>
            }
          />


          <Route
            path="assistant-admin"
            element={
              <ProtectedRoute
                allowedRoles={SUPER_ADMIN_ROLES}
              >
                <AssistantAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="super-admin/secciones"
            element={
              <ProtectedRoute
                allowedRoles={SUPER_ADMIN_ROLES}
              >
                <SuperAdminSeccionesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="super-admin/consecutivos"
            element={
              <ProtectedRoute
                allowedRoles={SUPER_ADMIN_ROLES}
              >
                <SuperAdminConsecutivosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="configuracion-ia"
            element={
              <ProtectedRoute
                allowedRoles={PARAMETRIZACIONES_ROLES}
              >
                <ConfiguracionIAPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="reportes/*"
            element={
              <ProtectedRoute
                allowedRoles={REPORTE_CERTIFICACIONES_ROLES}
              >
                <ReportesPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
