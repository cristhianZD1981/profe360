import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import {
  getAdecuacionAsistenciaRowStyle,
  getAdecuacionRowStyle,
  getAdecuacionStyleKind
} from "../utils/adecuacionStyles";

type AnioLectivo = {
  AnioLectivoId: number;
  Nombre: string;
};

type Periodo = {
  PeriodoId: number;
  AnioLectivoId: number;
  Nombre: string;
  AnioNombre?: string | null;
};

type Grupo = {
  GrupoId: number;
  Nombre: string;
  Nivel?: string | null;
  AnioNombre?: string | null;
};

type Materia = {
  MateriaId: number;
  Nombre: string;
  Codigo?: string | null;
};

type EstadoAsistencia = {
  EstadoAsistenciaId: number;
  Nombre?: string;
  Descripcion?: string;
  Codigo?: string;
};

type FechaClase = {
  FechaClaseId: number;
  Fecha: string;
  PeriodoId: number;
  EsExtraordinaria?: boolean;
  Observacion?: string | null;
  GrupoId: number;
  GrupoNombre?: string | null;
  GrupoNivel?: string | null;
  MateriaId: number;
  MateriaNombre?: string | null;
  PeriodoNombre?: string | null;
  AnioLectivoId: number;
  AnioNombre?: string | null;
  AsistenciaSesionId?: number | null;
  TieneAsistencia?: boolean;
  DocenteAsignadoId?: number | null;
  DocenteNombre?: string | null;
  DocenteCorreo?: string | null;
};

type EstudianteClase = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  Adecuacion?: string | null;
  DetalleAsistenciaId?: number | null;
  EstadoAsistenciaId?: number | null;
  Observacion?: string | null;
};

type SesionListado = {
  AsistenciaSesionId: number;
  FechaClaseId: number;
  Fecha: string;
  GrupoId: number;
  GrupoNombre?: string | null;
  GrupoNivel?: string | null;
  MateriaId: number;
  MateriaNombre?: string | null;
  PeriodoId: number;
  PeriodoNombre?: string | null;
  AnioLectivoId: number;
  AnioNombre?: string | null;
  DocenteNombre?: string | null;
  ObservacionGeneral?: string | null;
  TotalDetalles?: number;
};

type SesionDetalle = {
  sesion: {
    AsistenciaSesionId: number;
    FechaClaseId: number;
    Fecha: string;
    GrupoNombre?: string | null;
    GrupoNivel?: string | null;
    MateriaNombre?: string | null;
    PeriodoNombre?: string | null;
    AnioNombre?: string | null;
    DocenteNombre?: string | null;
    ObservacionGeneral?: string | null;
  };
  detalles: Array<{
    DetalleAsistenciaId: number;
    AsistenciaSesionId: number;
    EstudianteId: number;
    EstadoAsistenciaId: number;
    Observacion?: string | null;
    Identificacion: string;
    Nombre: string;
    PrimerApellido?: string | null;
    SegundoApellido?: string | null;
    Adecuacion?: string | null;
    NombreEstado?: string | null;
    Descripcion?: string | null;
    Codigo?: string | null;
  }>;
};

type DetalleForm = {
  estudianteId: number;
  identificacion: string;
  nombreCompleto: string;
  adecuacion: string;
  estadoAsistenciaId: string;
  observacion: string;
};

const initialFilters = {
  anioLectivoId: "",
  periodoId: "",
  grupoId: "",
  materiaId: "",
  fecha: "",
  q: ""
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function fullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function estadoLabel(item: EstadoAsistencia) {
  return item.Nombre || item.Descripcion || item.Codigo || `Estado ${item.EstadoAsistenciaId}`;
}

function isValidNonNegativeId(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

export default function AsistenciaPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [soloPendientes, setSoloPendientes] = useState(true);

  const [anios, setAnios] = useState<AnioLectivo[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [estados, setEstados] = useState<EstadoAsistencia[]>([]);

  const [clases, setClases] = useState<FechaClase[]>([]);
  const [sesiones, setSesiones] = useState<SesionListado[]>([]);

  const [selectedClase, setSelectedClase] = useState<FechaClase | null>(null);
  const [selectedSesionId, setSelectedSesionId] = useState<number | null>(null);

  const [detalles, setDetalles] = useState<DetalleForm[]>([]);
  const [observacionGeneral, setObservacionGeneral] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [loadingClases, setLoadingClases] = useState(false);
  const [loadingClaseDetalle, setLoadingClaseDetalle] = useState(false);
  const [loadingGuardar, setLoadingGuardar] = useState(false);
  const [loadingSesiones, setLoadingSesiones] = useState(false);

  const defaultEstadoId = useMemo(() => {
    if (!estados.length) return "";
    return String(estados[0].EstadoAsistenciaId);
  }, [estados]);

  async function loadCatalogos() {
    setLoadingCatalogos(true);
    try {
      const response = await api.get("/asistencia/catalogos");
      const data = response.data?.data || {};

      setAnios(data.aniosLectivos || []);
      setPeriodos(data.periodos || []);
      setGrupos(data.grupos || []);
      setMaterias(data.materias || []);
      setEstados(data.estadosAsistencia || []);
    } catch (error: any) {
      console.error("Error cargando catálogos de asistencia:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudieron cargar los catálogos de asistencia"
      );
    } finally {
      setLoadingCatalogos(false);
    }
  }

  async function loadClases() {
    setLoadingClases(true);
    setErrorMessage("");
    try {
      const response = await api.get("/asistencia/fechas-clase", {
        params: {
          ...filters,
          anioLectivoId: filters.anioLectivoId || undefined,
          periodoId: filters.periodoId || undefined,
          grupoId: filters.grupoId || undefined,
          materiaId: filters.materiaId || undefined,
          fecha: filters.fecha || undefined,
          q: filters.q || undefined,
          soloPendientes
        }
      });

      setClases(response.data?.data || []);
    } catch (error: any) {
      console.error("Error cargando fechas de clase:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudieron cargar las clases programadas"
      );
    } finally {
      setLoadingClases(false);
    }
  }

  async function loadSesiones() {
    setLoadingSesiones(true);
    try {
      const response = await api.get("/asistencia/sesiones", {
        params: {
          ...filters,
          anioLectivoId: filters.anioLectivoId || undefined,
          periodoId: filters.periodoId || undefined,
          grupoId: filters.grupoId || undefined,
          materiaId: filters.materiaId || undefined,
          fecha: filters.fecha || undefined,
          q: filters.q || undefined
        }
      });

      setSesiones(response.data?.data || []);
    } catch (error: any) {
      console.error("Error cargando sesiones de asistencia:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudieron cargar las sesiones de asistencia"
      );
    } finally {
      setLoadingSesiones(false);
    }
  }

  async function loadClaseEstudiantes(fechaClaseId: number, claseBase?: FechaClase) {
    setLoadingClaseDetalle(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await api.get(`/asistencia/fechas-clase/${fechaClaseId}/estudiantes`);
      const data = response.data?.data || {};

      const clase = claseBase || data.clase || null;
      const estudiantes: EstudianteClase[] = data.estudiantes || [];

      setSelectedClase(clase);
      setSelectedSesionId(
        data?.clase?.AsistenciaSesionId !== undefined && data?.clase?.AsistenciaSesionId !== null
          ? Number(data.clase.AsistenciaSesionId)
          : clase?.AsistenciaSesionId !== undefined && clase?.AsistenciaSesionId !== null
            ? Number(clase.AsistenciaSesionId)
            : null
      );

      setDetalles(
        estudiantes.map((item) => ({
          estudianteId: item.EstudianteId,
          identificacion: item.Identificacion,
          nombreCompleto: fullName(item),
          adecuacion: item.Adecuacion || "",
          estadoAsistenciaId: item.EstadoAsistenciaId !== undefined && item.EstadoAsistenciaId !== null
            ? String(item.EstadoAsistenciaId)
            : defaultEstadoId,
          observacion: item.Observacion || ""
        }))
      );

      setObservacionGeneral("");
    } catch (error: any) {
      console.error("Error cargando estudiantes de la clase:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudieron cargar los estudiantes de la clase"
      );
    } finally {
      setLoadingClaseDetalle(false);
    }
  }

  async function loadSesionDetalle(asistenciaSesionId: number) {
    setLoadingClaseDetalle(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await api.get(`/asistencia/sesiones/${asistenciaSesionId}`);
      const data: SesionDetalle = response.data?.data;

      if (!data?.sesion) {
        throw new Error("No se encontró la sesión");
      }

      setSelectedSesionId(data.sesion.AsistenciaSesionId);
      setSelectedClase({
        FechaClaseId: data.sesion.FechaClaseId,
        Fecha: data.sesion.Fecha,
        GrupoId: 0,
        MateriaId: 0,
        PeriodoId: 0,
        AnioLectivoId: 0,
        GrupoNombre: data.sesion.GrupoNombre,
        GrupoNivel: data.sesion.GrupoNivel,
        MateriaNombre: data.sesion.MateriaNombre,
        PeriodoNombre: data.sesion.PeriodoNombre,
        AnioNombre: data.sesion.AnioNombre,
        DocenteNombre: data.sesion.DocenteNombre,
        TieneAsistencia: true,
        AsistenciaSesionId: data.sesion.AsistenciaSesionId
      });

      setObservacionGeneral(data.sesion.ObservacionGeneral || "");
      setDetalles(
        data.detalles.map((item) => ({
          estudianteId: item.EstudianteId,
          identificacion: item.Identificacion,
          nombreCompleto: fullName(item),
          adecuacion: item.Adecuacion || "",
          estadoAsistenciaId: String(item.EstadoAsistenciaId),
          observacion: item.Observacion || ""
        }))
      );
    } catch (error: any) {
      console.error("Error cargando detalle de sesión:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar el detalle de la sesión"
      );
    } finally {
      setLoadingClaseDetalle(false);
    }
  }

  useEffect(() => {
    loadCatalogos();
  }, []);

  useEffect(() => {
    loadClases();
    loadSesiones();
  }, []);

  function updateDetalle(
    estudianteId: number,
    field: "estadoAsistenciaId" | "observacion",
    value: string
  ) {
    setDetalles((prev) =>
      prev.map((item) =>
        item.estudianteId === estudianteId ? { ...item, [field]: value } : item
      )
    );
  }

  async function handleBuscar(e: FormEvent) {
    e.preventDefault();
    await Promise.all([loadClases(), loadSesiones()]);
  }

  async function handleGuardar(e: FormEvent) {
    e.preventDefault();

    if (!selectedClase || !isValidNonNegativeId(selectedClase.FechaClaseId)) {
      setErrorMessage("Debés seleccionar una clase o una sesión");
      return;
    }

    if (!detalles.length) {
      setErrorMessage("No hay estudiantes cargados para guardar asistencia");
      return;
    }

    setLoadingGuardar(true);
    setErrorMessage("");
    setMessage("");

    try {
      const detallesPayload = detalles.map((item) => ({
        estudianteId: item.estudianteId,
        estadoAsistenciaId: Number(item.estadoAsistenciaId),
        observacion: item.observacion || null
      }));

      if (selectedSesionId !== null && selectedSesionId !== undefined && isValidNonNegativeId(selectedSesionId)) {
        await api.put(`/asistencia/sesiones/${selectedSesionId}`, {
          observacionGeneral: observacionGeneral || null,
          detalles: detallesPayload
        });
        setMessage("Asistencia actualizada correctamente");
        await loadSesionDetalle(selectedSesionId);
      } else {
        await api.post("/asistencia/sesiones", {
          fechaClaseId: selectedClase.FechaClaseId,
          observacionGeneral: observacionGeneral || null,
          detalles: detallesPayload
        });
        setMessage("Asistencia guardada correctamente");
        await loadClaseEstudiantes(selectedClase.FechaClaseId, {
          ...selectedClase,
          TieneAsistencia: true
        });
      }

      await Promise.all([loadClases(), loadSesiones()]);
    } catch (error: any) {
      console.error("Error guardando asistencia:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la asistencia"
      );
    } finally {
      setLoadingGuardar(false);
    }
  }

  function handleNuevaCaptura() {
    setSelectedClase(null);
    setSelectedSesionId(null);
    setDetalles([]);
    setObservacionGeneral("");
    setMessage("");
    setErrorMessage("");
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Asistencia</h3>

        {message && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#ecfdf3",
              color: "#166534",
              border: "1px solid #bbf7d0"
            }}
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca"
            }}
          >
            {errorMessage}
          </div>
        )}

        <form className="form" onSubmit={handleBuscar}>
          <div className="two-col">
            <label>
              Año lectivo
              <select
                value={filters.anioLectivoId}
                onChange={(e) =>
                  setFilters({ ...filters, anioLectivoId: e.target.value })
                }
              >
                <option value="">Todos</option>
                {anios.map((item) => (
                  <option key={item.AnioLectivoId} value={item.AnioLectivoId}>
                    {item.Nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Período
              <select
                value={filters.periodoId}
                onChange={(e) =>
                  setFilters({ ...filters, periodoId: e.target.value })
                }
              >
                <option value="">Todos</option>
                {periodos.map((item) => (
                  <option key={item.PeriodoId} value={item.PeriodoId}>
                    {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Grupo
              <select
                value={filters.grupoId}
                onChange={(e) =>
                  setFilters({ ...filters, grupoId: e.target.value })
                }
              >
                <option value="">Todos</option>
                {grupos.map((item) => (
                  <option key={item.GrupoId} value={item.GrupoId}>
                    {item.Nombre} {item.Nivel ? `- ${item.Nivel}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Materia
              <select
                value={filters.materiaId}
                onChange={(e) =>
                  setFilters({ ...filters, materiaId: e.target.value })
                }
              >
                <option value="">Todas</option>
                {materias.map((item) => (
                  <option key={item.MateriaId} value={item.MateriaId}>
                    {item.Nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fecha
              <input
                type="date"
                value={filters.fecha}
                onChange={(e) =>
                  setFilters({ ...filters, fecha: e.target.value })
                }
              />
            </label>

            <label>
              Bésqueda
              <input
                value={filters.q}
                onChange={(e) =>
                  setFilters({ ...filters, q: e.target.value })
                }
                placeholder="Grupo, materia, año..."
              />
            </label>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "10px"
            }}
          >
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
            />
            Mostrar solo clases pendientes de asistencia
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
            <button className="primary-btn" type="submit" disabled={loadingCatalogos || loadingClases || loadingSesiones}>
              Buscar
            </button>

            <button
              type="button"
              onClick={() => {
                setFilters(initialFilters);
                setSoloPendientes(true);
                handleNuevaCaptura();
                setTimeout(() => {
                  loadClases();
                  loadSesiones();
                }, 0);
              }}
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

            <button
              type="button"
              onClick={handleNuevaCaptura}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                padding: "10px 14px",
                background: "#fff",
                cursor: "pointer"
              }}
            >
              Nueva captura
            </button>
          </div>
        </form>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Clases programadas</h3>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Grupo</th>
                  <th>Materia</th>
                  <th>Período</th>
                  <th>Docente</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {clases.map((item) => (
                  <tr key={`clase-${item.FechaClaseId}-${item.Fecha}`}>
                    <td>{formatDate(item.Fecha)}</td>
                    <td>
                      {item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}
                    </td>
                    <td>{item.MateriaNombre || ""}</td>
                    <td>{item.PeriodoNombre || ""}</td>
                    <td>{item.DocenteNombre || item.DocenteCorreo || "Sin asignar"}</td>
                    <td>{item.TieneAsistencia ? "Registrada" : "Pendiente"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => loadClaseEstudiantes(item.FechaClaseId, item)}
                        style={{
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          cursor: "pointer"
                        }}
                      >
                        {item.TieneAsistencia ? "Ver / editar" : "Tomar lista"}
                      </button>
                    </td>
                  </tr>
                ))}

                {!clases.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>
                      {loadingClases ? "Cargando clases..." : "No hay clases programadas"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h3>Sesiones guardadas</h3>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Grupo</th>
                  <th>Materia</th>
                  <th>Docente</th>
                  <th>Total</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sesiones.map((item) => (
                  <tr key={`sesion-${item.AsistenciaSesionId}-${item.FechaClaseId}`}>
                    <td>{formatDate(item.Fecha)}</td>
                    <td>
                      {item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}
                    </td>
                    <td>{item.MateriaNombre || ""}</td>
                    <td>{item.DocenteNombre || ""}</td>
                    <td>{item.TotalDetalles || 0}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => loadSesionDetalle(item.AsistenciaSesionId)}
                        style={{
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          cursor: "pointer"
                        }}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}

                {!sesiones.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>
                      {loadingSesiones ? "Cargando sesiones..." : "No hay sesiones guardadas"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <h3>{selectedSesionId !== null && selectedSesionId !== undefined ? "Editar asistencia" : "Captura de asistencia"}</h3>

        {!selectedClase && (
          <div style={{ color: "#6b7280" }}>
            Seleccioná una clase programada o una sesión guardada para empezar
          </div>
        )}

        {selectedClase && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px",
                marginBottom: "14px"
              }}
            >
              <div><strong>Fecha:</strong> {formatDate(selectedClase.Fecha)}</div>
              <div><strong>Grupo:</strong> {selectedClase.GrupoNombre || ""} {selectedClase.GrupoNivel ? `- ${selectedClase.GrupoNivel}` : ""}</div>
              <div><strong>Materia:</strong> {selectedClase.MateriaNombre || ""}</div>
              <div><strong>Período:</strong> {selectedClase.PeriodoNombre || ""}</div>
              <div><strong>Año lectivo:</strong> {selectedClase.AnioNombre || ""}</div>
              <div><strong>Docente:</strong> {selectedClase.DocenteNombre || selectedClase.DocenteCorreo || "Sin asignar"}</div>
            </div>

            <form onSubmit={handleGuardar}>
              <label style={{ marginBottom: "14px", display: "block" }}>
                Observación general
                <input
                  value={observacionGeneral}
                  onChange={(e) => setObservacionGeneral(e.target.value)}
                  placeholder="Opcional"
                />
              </label>

              <div className="table-wrap">
                <table className="adecuacion-zebra-list adecuacion-attendance-list">
                  <thead>
                    <tr>
                      <th>Identificación</th>
                      <th>Nombre</th>
                      <th>Estado</th>
                      <th>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map((item) => (
                      <tr
                        key={`detalle-${item.estudianteId}`}
                        className="adecuacion-student-row"
                        data-adecuacion={getAdecuacionStyleKind(item.adecuacion) || undefined}
                        style={getAdecuacionAsistenciaRowStyle(item.adecuacion)}
                      >
                        <td>{item.identificacion}</td>
                        <td>{item.nombreCompleto}</td>
                        <td>
                          <select
                            value={item.estadoAsistenciaId}
                            style={getAdecuacionRowStyle(item.adecuacion)}
                            onChange={(e) =>
                              updateDetalle(item.estudianteId, "estadoAsistenciaId", e.target.value)
                            }
                          >
                            <option value="">Seleccione</option>
                            {estados.map((estado) => (
                              <option
                                key={estado.EstadoAsistenciaId}
                                value={estado.EstadoAsistenciaId}
                              >
                                {estadoLabel(estado)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={item.observacion}
                            style={getAdecuacionRowStyle(item.adecuacion)}
                            onChange={(e) =>
                              updateDetalle(item.estudianteId, "observacion", e.target.value)
                            }
                            placeholder="Opcional"
                          />
                        </td>
                      </tr>
                    ))}

                    {!detalles.length && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", padding: "16px" }}>
                          {loadingClaseDetalle
                            ? "Cargando estudiantes..."
                            : "No hay estudiantes para esta clase"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                <button className="primary-btn" disabled={loadingGuardar || loadingClaseDetalle || !detalles.length}>
                  {loadingGuardar
                    ? selectedSesionId !== null && selectedSesionId !== undefined
                      ? "Actualizando..."
                      : "Guardando..."
                    : selectedSesionId !== null && selectedSesionId !== undefined
                      ? "Actualizar asistencia"
                      : "Guardar asistencia"}
                </button>

                <button
                  type="button"
                  onClick={handleNuevaCaptura}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}



