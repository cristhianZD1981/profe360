import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ExternalChatWidget from "./components/ExternalChatWidget";
import SuperAdminInstitutionScope from "./components/SuperAdminInstitutionScope";

const Layout = lazy(() => import("./components/Layout"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InstitucionesPage = lazy(() => import("./pages/InstitucionesPage"));
const UsuariosPage = lazy(() => import("./pages/UsuariosPage"));
const EstudiantesPage = lazy(() => import("./pages/EstudiantesPage"));
const EstudiantesMatriculaPage = lazy(() => import("./pages/EstudiantesMatriculaPage"));
const CarnetEstudiantePage = lazy(() => import("./pages/CarnetEstudiantePage"));
const AcademicoPage = lazy(() => import("./pages/AcademicoPage"));
const AsistenciaPage = lazy(() => import("./pages/AsistenciaPage"));
const ReportesPage = lazy(() => import("./pages/ReportesPage"));
const HorariosPage = lazy(() => import("./pages/HorariosPage"));
const HorarioEstudiantePopupPage = lazy(() => import("./pages/HorarioEstudiantePopupPage"));
const BoletaMatriculaPage = lazy(() => import("./pages/BoletaMatriculaPage"));
const BoletaConductaPage = lazy(() => import("./pages/BoletaConductaPage"));
const GestionProfePage = lazy(() => import("./pages/GestionProfePage"));
const PlaneamientoIAPage = lazy(() => import("./pages/PlaneamientoIAPage"));
const ConfiguracionIAPage = lazy(() => import("./pages/ConfiguracionIAPage"));
const SeguimientoNotasPage = lazy(() => import("./pages/SeguimientoNotasPage"));
const ParametrizacionesPage = lazy(() => import("./pages/ParametrizacionesPage"));
const EvaluacionParametrizacionPage = lazy(() => import("./pages/EvaluacionParametrizacionPage"));
const AssistantAdminPage = lazy(() => import("./pages/AssistantAdminPage"));
const SuperAdminSeccionesPage = lazy(() => import("./pages/SuperAdminSeccionesPage"));
const SuperAdminConsecutivosPage = lazy(() => import("./pages/SuperAdminConsecutivosPage"));
const SuperAdminCatalogosMatriculaPage = lazy(() => import("./pages/SuperAdminCatalogosMatriculaPage"));
const SuperAdminWhatsAppPage = lazy(() => import("./pages/SuperAdminWhatsAppPage"));
const HabilidadesPlaneamientoAcademicoPage = lazy(() => import("./pages/HabilidadesPlaneamientoAcademicoPage"));
const GruposClasePage = lazy(() => import("./pages/GruposClasePage"));

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
      <Suspense fallback={<div role="status" style={{ padding: "2rem", textAlign: "center" }}>Cargando módulo…</div>}>
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
          path="/horario-estudiante/:id"
          element={
            <ProtectedRoute>
              <HorarioEstudiantePopupPage />
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
          <Route path="estudiantes" element={
            <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
              <SuperAdminInstitutionScope><EstudiantesPage /></SuperAdminInstitutionScope>
            </ProtectedRoute>
          } />
          <Route path="estudiantes-matricula" element={
            <ProtectedRoute allowedRoles={ADMINISTRATIVO_ROLES}>
              <SuperAdminInstitutionScope><EstudiantesMatriculaPage /></SuperAdminInstitutionScope>
            </ProtectedRoute>
          } />
          <Route path="estudiante" element={
            <ProtectedRoute allowedRoles={["PROFESOR", "PROFESOR_GUIA"]}>
              <EstudiantesMatriculaPage teacherView />
            </ProtectedRoute>
          } />
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
                    "asignaciones",
                    "cambioProfe",
                    "profesGuia12",
                    "bloques",
                    "gruposMateria",
                    "horarios",
                    "fechasClase",
                    "diasLectivos",
                    "faltasConducta",
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
                    "asignaciones",
                    "cambioProfe",
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
                allowedRoles={SUPER_ADMIN_ROLES}
              >
                <SuperAdminInstitutionScope>
                  <AcademicoPage initialTab="matriculas" visibleTabs={["matriculas"]} />
                </SuperAdminInstitutionScope>
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
          <Route path="super-admin/catalogos-matricula" element={<ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}><SuperAdminCatalogosMatriculaPage /></ProtectedRoute>} />
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
            path="super-admin/whatsapp"
            element={
              <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
                <SuperAdminWhatsAppPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="super-admin/habilidades-planeamiento"
            element={
              <ProtectedRoute
                allowedRoles={SUPER_ADMIN_ROLES}
              >
                <HabilidadesPlaneamientoAcademicoPage />
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
      </Suspense>
    </AuthProvider>
  );
}

