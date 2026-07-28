import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";
import { getAdecuacionStyleKind } from "../utils/adecuacionStyles";

type AnioLectivo = {
  AnioLectivoId: number;
  Nombre: string;
  FechaInicio: string | null;
  FechaFin: string | null;
  Activo: boolean;
};

type Periodo = {
  PeriodoId: number;
  AnioLectivoId: number;
  Nombre: string;
  NumeroOrden: number;
  FechaInicio: string | null;
  FechaFin: string | null;
  Activo: boolean;
  AnioNombre?: string | null;
};

type Grupo = {
  GrupoId: number;
  AnioLectivoId: number;
  Nombre: string;
  Nivel: string | null;
  Jornada: string | null;
  Activo: boolean;
  AnioNombre?: string | null;
};

type DocenteCatalogo = {
  UsuarioId: number;
  Correo: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  Roles?: string | null;
};

type GridDay = {
  numero: number;
  nombre: string;
};

type HorarioFila = {
  bloqueHorarioId: number;
  leccion: string;
  horaInicio: string;
  horaFin: string;
  [key: string]: any;
};

type HorarioEncabezado = {
  grupoId?: number | null;
  grupo?: string;
  nivel?: string;
  usuarioId?: number | null;
  docente?: string;
  anioLectivoId?: number | null;
  anioLectivo?: string;
  periodoId?: number | null;
  periodo?: string;
};

type HorarioSeccionResponse = {
  vista: "seccion";
  encabezado: HorarioEncabezado;
  dias: GridDay[];
  filas: HorarioFila[];
  detalles: any[];
};

type HorarioDocenteResponse = {
  vista: "docente";
  encabezado: HorarioEncabezado;
  dias: GridDay[];
  filas: HorarioFila[];
  detalles: any[];
};

type HorarioEstudianteResponse = {
  vista: "estudiante";
  estudiante: {
    estudianteId: number;
    identificacion: string;
    nombre: string;
  };
  horario: HorarioSeccionResponse;
};

type BusquedaAlumnoResultado = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  GrupoId: number;
  GrupoNombre: string;
  GrupoNivel: string | null;
  MatriculaId: number;
  TipoAdecuacion?: string | null;
};

type BusquedaProfesorResultado = {
  UsuarioId: number;
  Correo: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
};

type BusquedaResponse =
  | { tipo: "seccion"; resultado: HorarioSeccionResponse }
  | { tipo: "docente"; resultado: HorarioDocenteResponse }
  | { tipo: "estudiante"; resultado: HorarioEstudianteResponse }
  | { tipo: "busqueda-alumno"; resultados: BusquedaAlumnoResultado[] }
  | { tipo: "busqueda-profesor"; resultados: BusquedaProfesorResultado[] };

type MisGruposGuiaResponse = {
  vista: "mis-grupos-guia";
  totalGrupos: number;
  grupos: HorarioSeccionResponse[];
};

type TabKey = "miHorario" | "misGruposGuia" | "consulta";

const initialConsultaForm = {
  anioLectivoId: "",
  periodoId: "",
  grupoId: "",
  usuarioId: "",
  estudianteId: "",
  alumno: "",
  profesor: ""
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function getFullName(item: { Nombre: string; PrimerApellido?: string | null; SegundoApellido?: string | null }) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTeacherName(item: { Nombre: string; PrimerApellido?: string | null; SegundoApellido?: string | null }) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderCellValue(value?: string) {
  if (!value) return "Libre";

  const lines = String(value).split("\n");
  return (
    <div style={{ whiteSpace: "pre-line", lineHeight: 1.25 }}>
      {lines.map((line, idx) => (
        <div key={idx}>{line}</div>
      ))}
    </div>
  );
}

function HorarioGrid({
  title,
  subtitle,
  data
}: {
  title: string;
  subtitle?: string;
  data: HorarioSeccionResponse | HorarioDocenteResponse;
}) {
  return (
    <section className="card" style={{ marginBottom: 0 }}>
      <div style={{ marginBottom: "14px" }}>
        <h3 style={{ marginBottom: "6px" }}>{title}</h3>
        {subtitle ? <div style={{ opacity: 0.85 }}>{subtitle}</div> : null}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lección</th>
              <th>Hora inicio</th>
              <th>Hora fin</th>
              {data.dias.map((d) => (
                <th key={d.numero}>{d.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.filas.map((row) => (
              <tr key={row.bloqueHorarioId}>
                <td>{row.leccion}</td>
                <td>{row.horaInicio}</td>
                <td>{row.horaFin}</td>
                {data.dias.map((d) => (
                  <td key={d.numero}>{renderCellValue(row[d.nombre])}</td>
                ))}
              </tr>
            ))}
            {!data.filas.length && (
              <tr>
                <td colSpan={3 + data.dias.length} style={{ textAlign: "center", padding: "16px" }}>
                  No hay horario registrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function HorariosPage() {
  const { user } = useAuth();

  const [tab, setTab] = useState<TabKey>("miHorario");

  const [anios, setAnios] = useState<AnioLectivo[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [docentes, setDocentes] = useState<DocenteCatalogo[]>([]);

  const [consultaForm, setConsultaForm] = useState(initialConsultaForm);

  const [miHorario, setMiHorario] = useState<HorarioDocenteResponse | null>(null);
  const [misGruposGuia, setMisGruposGuia] = useState<MisGruposGuiaResponse | null>(null);

  const [consultaHorarioSeccion, setConsultaHorarioSeccion] = useState<HorarioSeccionResponse | null>(null);
  const [consultaHorarioDocente, setConsultaHorarioDocente] = useState<HorarioDocenteResponse | null>(null);
  const [consultaHorarioEstudiante, setConsultaHorarioEstudiante] = useState<HorarioEstudianteResponse | null>(null);

  const [resultadosAlumnos, setResultadosAlumnos] = useState<BusquedaAlumnoResultado[]>([]);
  const [resultadosProfesores, setResultadosProfesores] = useState<BusquedaProfesorResultado[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const aniosActivos = useMemo(() => anios.filter((a) => a.Activo), [anios]);

  const periodosFiltrados = useMemo(() => {
    if (!consultaForm.anioLectivoId) return periodos.filter((p) => p.Activo);
    return periodos.filter(
      (p) => p.Activo && String(p.AnioLectivoId) === String(consultaForm.anioLectivoId)
    );
  }, [periodos, consultaForm.anioLectivoId]);

  const gruposFiltrados = useMemo(() => {
    if (!consultaForm.anioLectivoId) return grupos.filter((g) => g.Activo);
    return grupos.filter(
      (g) => g.Activo && String(g.AnioLectivoId) === String(consultaForm.anioLectivoId)
    );
  }, [grupos, consultaForm.anioLectivoId]);

  async function loadCatalogos() {
    const response = await api.get("/academico/catalogos");
    const data = response.data?.data || {};

    setAnios(data.aniosLectivos || []);
    setPeriodos(data.periodos || []);
    setGrupos(data.grupos || []);
    setDocentes(data.docentes || []);
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function resetConsultaResultados() {
    setConsultaHorarioSeccion(null);
    setConsultaHorarioDocente(null);
    setConsultaHorarioEstudiante(null);
    setResultadosAlumnos([]);
    setResultadosProfesores([]);
  }

  async function loadMiHorario() {
    setLoading(true);
    clearMessages();

    try {
      const params: any = {};
      if (consultaForm.anioLectivoId) params.anioLectivoId = Number(consultaForm.anioLectivoId);
      if (consultaForm.periodoId) params.periodoId = Number(consultaForm.periodoId);

      const response = await api.get("/horarios/mi-horario", { params });
      setMiHorario(response.data?.data || null);
    } catch (error: any) {
      console.error("Error cargando mi horario:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar mi horario");
    } finally {
      setLoading(false);
    }
  }

  async function loadMisGruposGuia() {
    setLoading(true);
    clearMessages();

    try {
      const params: any = {};
      if (consultaForm.anioLectivoId) params.anioLectivoId = Number(consultaForm.anioLectivoId);
      if (consultaForm.periodoId) params.periodoId = Number(consultaForm.periodoId);

      const response = await api.get("/horarios/mis-grupos-guia", { params });
      setMisGruposGuia(response.data?.data || null);
    } catch (error: any) {
      console.error("Error cargando mis grupos guía:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar mis grupos guía");
    } finally {
      setLoading(false);
    }
  }

  async function handleConsultaSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    resetConsultaResultados();

    try {
      const params: any = {};
      if (consultaForm.anioLectivoId) params.anioLectivoId = Number(consultaForm.anioLectivoId);
      if (consultaForm.periodoId) params.periodoId = Number(consultaForm.periodoId);

      if (consultaForm.usuarioId) {
        const response = await api.get(`/horarios/docente/${Number(consultaForm.usuarioId)}`, { params });
        setConsultaHorarioDocente(response.data?.data || null);
        setMessage("Horario de docente cargado correctamente");
        return;
      }

      if (consultaForm.grupoId) {
        const response = await api.get(`/horarios/seccion/${Number(consultaForm.grupoId)}`, { params });
        setConsultaHorarioSeccion(response.data?.data || null);
        setMessage("Horario de sección cargado correctamente");
        return;
      }

      if (consultaForm.estudianteId) {
        const response = await api.get(`/horarios/estudiante/${Number(consultaForm.estudianteId)}`, { params });
        setConsultaHorarioEstudiante(response.data?.data || null);
        setMessage("Horario de estudiante cargado correctamente");
        return;
      }

      if (consultaForm.alumno.trim()) {
        const response = await api.get("/horarios/busqueda", {
          params: {
            ...params,
            alumno: consultaForm.alumno.trim()
          }
        });
        const data: BusquedaResponse = response.data?.data;
        if (data?.tipo === "busqueda-alumno") {
          setResultadosAlumnos(data.resultados || []);
          setMessage("Resultados de alumnos cargados correctamente");
          return;
        }
      }

      if (consultaForm.profesor.trim()) {
        const response = await api.get("/horarios/busqueda", {
          params: {
            ...params,
            profesor: consultaForm.profesor.trim()
          }
        });
        const data: BusquedaResponse = response.data?.data;
        if (data?.tipo === "busqueda-profesor") {
          setResultadosProfesores(data.resultados || []);
          setMessage("Resultados de profesores cargados correctamente");
          return;
        }
      }

      setErrorMessage("Debés seleccionar una sección, un profesor, un estudiante o escribir un criterio de bésqueda");
    } catch (error: any) {
      console.error("Error consultando horarios:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo realizar la consulta");
    } finally {
      setLoading(false);
    }
  }

  function handleSeleccionarAlumno(item: BusquedaAlumnoResultado) {
    setConsultaForm((prev) => ({
      ...prev,
      estudianteId: String(item.EstudianteId),
      alumno: `${item.Identificacion} - ${getFullName(item)}`,
      grupoId: "",
      usuarioId: "",
      profesor: ""
    }));
    setResultadosAlumnos([]);
    setConsultaHorarioSeccion(null);
    setConsultaHorarioDocente(null);
  }

  function handleSeleccionarProfesor(item: BusquedaProfesorResultado) {
    setConsultaForm((prev) => ({
      ...prev,
      usuarioId: String(item.UsuarioId),
      profesor: getTeacherName(item),
      grupoId: "",
      estudianteId: "",
      alumno: ""
    }));
    setResultadosProfesores([]);
    setConsultaHorarioSeccion(null);
    setConsultaHorarioEstudiante(null);
  }

  function resetConsultaForm() {
    setConsultaForm(initialConsultaForm);
    resetConsultaResultados();
    clearMessages();
  }

  useEffect(() => {
    loadCatalogos();
  }, []);

  useEffect(() => {
    if (tab === "miHorario") {
      loadMiHorario();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "misGruposGuia") {
      loadMisGruposGuia();
    }
  }, [tab]);

  const puedeVerGruposGuia = user?.roles?.includes("PROFESOR_GUIA");

  return (
    <div className="stack">
      <section className="card">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setTab("miHorario")}
            style={{ opacity: tab === "miHorario" ? 1 : 0.75 }}
          >
            Mi horario
          </button>

          {puedeVerGruposGuia && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setTab("misGruposGuia")}
              style={{ opacity: tab === "misGruposGuia" ? 1 : 0.75 }}
            >
              Mis grupos guía
            </button>
          )}

          <button
            type="button"
            className="primary-btn"
            onClick={() => setTab("consulta")}
            style={{ opacity: tab === "consulta" ? 1 : 0.75 }}
          >
            Consulta administrativa
          </button>
        </div>

        {message && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
            {message}
          </div>
        )}

        {errorMessage && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {errorMessage}
          </div>
        )}

        <section className="card" style={{ marginBottom: "16px" }}>
          <h3>Filtros generales</h3>
          <div className="form">
            <label>
              Año lectivo
              <select
                value={consultaForm.anioLectivoId}
                onChange={(e) =>
                  setConsultaForm((prev) => ({
                    ...prev,
                    anioLectivoId: e.target.value,
                    periodoId: "",
                    grupoId: "",
                    usuarioId: "",
                    estudianteId: "",
                    alumno: "",
                    profesor: ""
                  }))
                }
              >
                <option value="">Todos</option>
                {aniosActivos.map((item) => (
                  <option key={item.AnioLectivoId} value={item.AnioLectivoId}>
                    {item.Nombre} {item.FechaInicio ? `(${formatDate(item.FechaInicio)} a ${formatDate(item.FechaFin)})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Período
              <select
                value={consultaForm.periodoId}
                onChange={(e) =>
                  setConsultaForm((prev) => ({
                    ...prev,
                    periodoId: e.target.value,
                    grupoId: "",
                    usuarioId: "",
                    estudianteId: "",
                    alumno: "",
                    profesor: ""
                  }))
                }
              >
                <option value="">Todos</option>
                {periodosFiltrados.map((item) => (
                  <option key={item.PeriodoId} value={item.PeriodoId}>
                    {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {tab === "miHorario" && (
          <div className="stack">
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
              <button className="primary-btn" type="button" disabled={loading} onClick={loadMiHorario}>
                {loading ? "Cargando..." : "Recargar mi horario"}
              </button>
            </div>

            {miHorario && (
              <HorarioGrid
                title="Mi horario semanal"
                subtitle={`${miHorario.encabezado.docente || user?.nombre || ""}${miHorario.encabezado.periodo ? ` - ${miHorario.encabezado.periodo}` : ""}${miHorario.encabezado.anioLectivo ? ` - ${miHorario.encabezado.anioLectivo}` : ""}`}
                data={miHorario}
              />
            )}
          </div>
        )}

        {tab === "misGruposGuia" && (
          <div className="stack">
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
              <button className="primary-btn" type="button" disabled={loading} onClick={loadMisGruposGuia}>
                {loading ? "Cargando..." : "Recargar grupos guía"}
              </button>
            </div>

            {!misGruposGuia?.grupos?.length && (
              <section className="card" style={{ marginBottom: 0 }}>
                No hay grupos guía registrados
              </section>
            )}

            {misGruposGuia?.grupos?.map((grupo) => (
              <HorarioGrid
                key={`${grupo.encabezado.grupoId}-${grupo.encabezado.periodoId ?? "sin-periodo"}`}
                title={`Horario del grupo ${grupo.encabezado.grupo || ""}${grupo.encabezado.nivel ? ` - ${grupo.encabezado.nivel}` : ""}`}
                subtitle={`${grupo.encabezado.periodo ? `${grupo.encabezado.periodo} - ` : ""}${grupo.encabezado.anioLectivo || ""}`}
                data={grupo}
              />
            ))}
          </div>
        )}

        {tab === "consulta" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Consulta administrativa</h3>

              <form className="form" onSubmit={handleConsultaSubmit}>
                <label>
                  Sección
                  <select
                    value={consultaForm.grupoId}
                    onChange={(e) =>
                      setConsultaForm((prev) => ({
                        ...prev,
                        grupoId: e.target.value,
                        usuarioId: "",
                        estudianteId: "",
                        alumno: "",
                        profesor: ""
                      }))
                    }
                  >
                    <option value="">Seleccione</option>
                    {gruposFiltrados.map((item) => (
                      <option key={item.GrupoId} value={item.GrupoId}>
                        {item.Nombre} {item.Nivel ? `- ${item.Nivel}` : ""} {item.AnioNombre ? `- ${item.AnioNombre}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Profesor
                  <select
                    value={consultaForm.usuarioId}
                    onChange={(e) =>
                      setConsultaForm((prev) => ({
                        ...prev,
                        usuarioId: e.target.value,
                        grupoId: "",
                        estudianteId: "",
                        alumno: "",
                        profesor: ""
                      }))
                    }
                  >
                    <option value="">Seleccione</option>
                    {docentes.map((item) => (
                      <option key={item.UsuarioId} value={item.UsuarioId}>
                        {getTeacherName(item)} {item.Correo ? `- ${item.Correo}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Buscar alumno por nombre o cédula
                  <input
                    value={consultaForm.alumno}
                    onChange={(e) =>
                      setConsultaForm((prev) => ({
                        ...prev,
                        alumno: e.target.value,
                        estudianteId: "",
                        grupoId: "",
                        usuarioId: "",
                        profesor: ""
                      }))
                    }
                    placeholder="Nombre o cédula"
                  />
                </label>

                <label>
                  Buscar profesor por nombre o correo
                  <input
                    value={consultaForm.profesor}
                    onChange={(e) =>
                      setConsultaForm((prev) => ({
                        ...prev,
                        profesor: e.target.value,
                        usuarioId: "",
                        grupoId: "",
                        estudianteId: "",
                        alumno: ""
                      }))
                    }
                    placeholder="Nombre o correo"
                  />
                </label>

                {consultaForm.estudianteId ? (
                  <label>
                    Estudiante seleccionado
                    <input value={consultaForm.alumno} readOnly />
                  </label>
                ) : null}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loading}>
                    {loading ? "Consultando..." : "Consultar"}
                  </button>

                  <button
                    type="button"
                    onClick={resetConsultaForm}
                    style={{
                      border: "1px solid #d1d5db",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      background: "#fff",
                      cursor: "pointer"
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Resultados</h3>

              {resultadosAlumnos.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: "16px" }}>
                  <table className="adecuacion-zebra-list">
                    <thead>
                      <tr>
                        <th>Cédula</th>
                        <th>Nombre</th>
                        <th>Sección</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadosAlumnos.map((item) => (
                        <tr
                          key={item.EstudianteId}
                          className="adecuacion-student-row"
                          data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                        >
                          <td>{item.Identificacion}</td>
                          <td>{getFullName(item)}</td>
                          <td>{item.GrupoNombre} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleSeleccionarAlumno(item)}
                              style={{
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Seleccionar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {resultadosProfesores.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: "16px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadosProfesores.map((item) => (
                        <tr key={item.UsuarioId}>
                          <td>{getTeacherName(item)}</td>
                          <td>{item.Correo}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleSeleccionarProfesor(item)}
                              style={{
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Seleccionar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {consultaHorarioSeccion && (
                <HorarioGrid
                  title={`Horario de la sección ${consultaHorarioSeccion.encabezado.grupo || ""}${consultaHorarioSeccion.encabezado.nivel ? ` - ${consultaHorarioSeccion.encabezado.nivel}` : ""}`}
                  subtitle={`${consultaHorarioSeccion.encabezado.periodo ? `${consultaHorarioSeccion.encabezado.periodo} - ` : ""}${consultaHorarioSeccion.encabezado.anioLectivo || ""}`}
                  data={consultaHorarioSeccion}
                />
              )}

              {consultaHorarioDocente && (
                <HorarioGrid
                  title={`Horario del profesor ${consultaHorarioDocente.encabezado.docente || ""}`}
                  subtitle={`${consultaHorarioDocente.encabezado.periodo ? `${consultaHorarioDocente.encabezado.periodo} - ` : ""}${consultaHorarioDocente.encabezado.anioLectivo || ""}`}
                  data={consultaHorarioDocente}
                />
              )}

              {consultaHorarioEstudiante && (
                <div className="stack">
                  <section className="card" style={{ marginBottom: 0 }}>
                    <strong>Estudiante:</strong> {consultaHorarioEstudiante.estudiante.nombre}<br />
                    <strong>Cédula:</strong> {consultaHorarioEstudiante.estudiante.identificacion}
                  </section>

                  <HorarioGrid
                    title={`Horario del estudiante - ${consultaHorarioEstudiante.horario.encabezado.grupo || ""}${consultaHorarioEstudiante.horario.encabezado.nivel ? ` - ${consultaHorarioEstudiante.horario.encabezado.nivel}` : ""}`}
                    subtitle={`${consultaHorarioEstudiante.horario.encabezado.periodo ? `${consultaHorarioEstudiante.horario.encabezado.periodo} - ` : ""}${consultaHorarioEstudiante.horario.encabezado.anioLectivo || ""}`}
                    data={consultaHorarioEstudiante.horario}
                  />
                </div>
              )}

              {!resultadosAlumnos.length &&
                !resultadosProfesores.length &&
                !consultaHorarioSeccion &&
                !consultaHorarioDocente &&
                !consultaHorarioEstudiante && (
                  <div style={{ opacity: 0.8 }}>
                    Usá los filtros de la izquierda para consultar un horario por sección, profesor o estudiante
                  </div>
                )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}




