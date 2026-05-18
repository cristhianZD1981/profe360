import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type Grupo = {
  EstructuraGrupoId: number;
  GrupoNombre: string;
  MateriaNombre: string;
  PeriodoNombre: string;
  AnioNombre: string;
  Nombre: string;
};

type Componente = {
  EstructuraGrupoDetalleId: number;
  Nombre: string;
  Porcentaje: number;
  Orden: number;
};

type Estudiante = {
  EstudianteId: number;
  Identificacion: string;
  NombreCompleto: string;
};

type Planeamiento = {
  PlaneamientoId: number;
  Nombre: string;
};

type Indicador = {
  IndicadorGrupoId: number;
  TipoUso: string;
  IndicadorBase: string;
  IndicadorAvanzado: string;
  IndicadorIntermedio?: string;
  IndicadorInicial?: string;
};

type ValorIndicador = {
  IndicadorGrupoId: number;
  ValorSeleccionado: number;
  Observacion?: string;
};

type DetalleGrupo = {
  grupo: any;
  componentes: Componente[];
  estudiantes: Estudiante[];
  planeamientos: Planeamiento[];
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  padding: "11px 12px",
  background: "#fff",
  color: "#111827"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 700,
  color: "#374151",
  marginBottom: "6px"
};

function getData(response: any) {
  return response?.data?.data ?? response?.data ?? null;
}

function normalizeKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function getTipoComponente(nombre: string) {
  const key = normalizeKey(nombre);
  if (key.includes("COTIDIAN")) return "COTIDIANO";
  if (key.includes("TAREA")) return "TAREA";
  if (key.includes("ASIST")) return "ASISTENCIA";
  if (key.includes("EXAM") || key.includes("PRUEBA")) return "EXAMEN";
  return "OTRO";
}

function formatNumber(value: any) {
  const parsed = Number(value || 0);
  return parsed.toFixed(2);
}

export default function SeguimientoNotasPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoId, setGrupoId] = useState("");
  const [detalle, setDetalle] = useState<DetalleGrupo | null>(null);
  const [componenteId, setComponenteId] = useState("");
  const [estudianteId, setEstudianteId] = useState("");
  const [planeamientoId, setPlaneamientoId] = useState("");
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [valores, setValores] = useState<Record<number, ValorIndicador>>({});
  const [resumen, setResumen] = useState<any>(null);
  const [consolidado, setConsolidado] = useState<any>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [examenNombre, setExamenNombre] = useState("Examen");
  const [examenFecha, setExamenFecha] = useState("");
  const [puntosObtenidos, setPuntosObtenidos] = useState("");
  const [puntosMaximos, setPuntosMaximos] = useState("");
  const [observacionExamen, setObservacionExamen] = useState("");

  const componenteSeleccionado = useMemo(() => {
    return detalle?.componentes.find((item) => String(item.EstructuraGrupoDetalleId) === componenteId) || null;
  }, [detalle?.componentes, componenteId]);

  const tipoComponente = useMemo(() => getTipoComponente(componenteSeleccionado?.Nombre || ""), [componenteSeleccionado]);

  useEffect(() => {
    cargarGrupos();
  }, []);

  useEffect(() => {
    if (grupoId) cargarDetalleGrupo(grupoId);
    else {
      setDetalle(null);
      setComponenteId("");
      setEstudianteId("");
      setPlaneamientoId("");
      setIndicadores([]);
      setValores({});
    }
  }, [grupoId]);

  useEffect(() => {
    setIndicadores([]);
    setValores({});
    setResumen(null);
    if (grupoId && componenteId && estudianteId) {
      cargarConsolidado();
    }
    if (grupoId && componenteId && estudianteId && planeamientoId && ["COTIDIANO", "TAREA"].includes(tipoComponente)) {
      cargarIndicadores();
    }
    if (grupoId && componenteId && estudianteId && tipoComponente === "ASISTENCIA") {
      cargarResumenAsistencia();
    }
  }, [grupoId, componenteId, estudianteId, planeamientoId, tipoComponente]);

  async function cargarGrupos() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/seguimiento-evaluacion/grupos");
      setGrupos(getData(response) || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron cargar los grupos");
    } finally {
      setLoading(false);
    }
  }

  async function cargarDetalleGrupo(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/seguimiento-evaluacion/grupos/${id}/detalle`);
      const data = getData(response);
      setDetalle(data);
      setComponenteId("");
      setEstudianteId("");
      setPlaneamientoId("");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cargar el detalle del grupo");
    } finally {
      setLoading(false);
    }
  }

  async function cargarIndicadores() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(
        `/seguimiento-evaluacion/grupos/${grupoId}/planeamientos/${planeamientoId}/indicadores`,
        { params: { tipoUso: tipoComponente } }
      );
      const data: Indicador[] = getData(response) || [];
      setIndicadores(data);
      const inicial: Record<number, ValorIndicador> = {};
      data.forEach((indicador) => {
        inicial[indicador.IndicadorGrupoId] = {
          IndicadorGrupoId: indicador.IndicadorGrupoId,
          ValorSeleccionado: 3,
          Observacion: ""
        };
      });
      setValores(inicial);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron cargar los indicadores");
    } finally {
      setLoading(false);
    }
  }

  async function cargarResumenAsistencia() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/seguimiento-evaluacion/asistencia/resumen", {
        params: {
          estructuraGrupoId: grupoId,
          estructuraGrupoDetalleId: componenteId,
          estudianteId
        }
      });
      setResumen(getData(response));
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo calcular la asistencia");
    } finally {
      setLoading(false);
    }
  }

  async function cargarConsolidado() {
    try {
      const response = await api.get("/seguimiento-evaluacion/consolidado", {
        params: { estructuraGrupoId: grupoId, estudianteId }
      });
      setConsolidado(getData(response));
    } catch {
      setConsolidado(null);
    }
  }

  function actualizarValor(indicadorId: number, campo: keyof ValorIndicador, value: any) {
    setValores((prev) => ({
      ...prev,
      [indicadorId]: {
        ...(prev[indicadorId] || { IndicadorGrupoId: indicadorId, ValorSeleccionado: 3 }),
        [campo]: value
      }
    }));
  }

  async function guardarIndicadores(e: FormEvent) {
    e.preventDefault();
    setMensaje("");
    setError("");

    const registros = Object.values(valores).filter((item) => item.IndicadorGrupoId && item.ValorSeleccionado);
    if (!registros.length) {
      setError("No hay indicadores seleccionados para guardar");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/seguimiento-evaluacion/seguimiento-indicadores", {
        estructuraGrupoId: Number(grupoId),
        estructuraGrupoDetalleId: Number(componenteId),
        planeamientoId: Number(planeamientoId),
        estudianteId: Number(estudianteId),
        registros
      });
      setResumen(getData(response));
      setMensaje("Seguimiento guardado correctamente");
      cargarConsolidado();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo guardar el seguimiento");
    } finally {
      setLoading(false);
    }
  }

  async function guardarExamen(e: FormEvent) {
    e.preventDefault();
    setMensaje("");
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/seguimiento-evaluacion/examenes", {
        estructuraGrupoId: Number(grupoId),
        estructuraGrupoDetalleId: Number(componenteId),
        estudianteId: Number(estudianteId),
        nombre: examenNombre,
        fecha: examenFecha || null,
        puntosObtenidos: Number(puntosObtenidos),
        puntosMaximos: Number(puntosMaximos),
        observacion: observacionExamen
      });
      setResumen(getData(response));
      setMensaje("Examen guardado correctamente");
      cargarConsolidado();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo guardar el examen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, color: "#111827" }}>Seguimiento de notas</h2>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            Control por sección para cotidiano, tareas, exámenes y asistencia
          </p>
        </div>
        <button type="button" className="primary-btn" onClick={cargarGrupos} disabled={loading}>
          Actualizar
        </button>
      </div>

      {mensaje && <div style={{ ...cardStyle, borderColor: "#86efac", background: "#f0fdf4", color: "#166534" }}>{mensaje}</div>}
      {error && <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>{error}</div>}

      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <div>
            <label style={labelStyle}>Grupo / sección</label>
            <select style={inputStyle} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Seleccione</option>
              {grupos.map((grupo) => (
                <option key={grupo.EstructuraGrupoId} value={grupo.EstructuraGrupoId}>
                  {grupo.GrupoNombre} - {grupo.MateriaNombre} - {grupo.PeriodoNombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Componente</label>
            <select style={inputStyle} value={componenteId} onChange={(e) => setComponenteId(e.target.value)} disabled={!detalle}>
              <option value="">Seleccione</option>
              {detalle?.componentes.map((item) => (
                <option key={item.EstructuraGrupoDetalleId} value={item.EstructuraGrupoDetalleId}>
                  {item.Nombre} - {formatNumber(item.Porcentaje)}%
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Estudiante</label>
            <select style={inputStyle} value={estudianteId} onChange={(e) => setEstudianteId(e.target.value)} disabled={!detalle}>
              <option value="">Seleccione</option>
              {detalle?.estudiantes.map((item) => (
                <option key={item.EstudianteId} value={item.EstudianteId}>
                  {item.NombreCompleto} - {item.Identificacion}
                </option>
              ))}
            </select>
          </div>

          {["COTIDIANO", "TAREA"].includes(tipoComponente) && (
            <div>
              <label style={labelStyle}>Planeamiento</label>
              <select style={inputStyle} value={planeamientoId} onChange={(e) => setPlaneamientoId(e.target.value)} disabled={!detalle}>
                <option value="">Seleccione</option>
                {detalle?.planeamientos.map((item) => (
                  <option key={item.PlaneamientoId} value={item.PlaneamientoId}>{item.Nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {componenteSeleccionado && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>{componenteSeleccionado.Nombre}</h3>
          <p style={{ color: "#6b7280", marginTop: 0 }}>
            Valor del componente: <strong>{formatNumber(componenteSeleccionado.Porcentaje)}%</strong>
          </p>

          {["COTIDIANO", "TAREA"].includes(tipoComponente) && (
            <form onSubmit={guardarIndicadores} style={{ display: "grid", gap: "14px" }}>
              {!planeamientoId && <p style={{ color: "#6b7280" }}>Seleccione un planeamiento para cargar los indicadores habilitados.</p>}
              {planeamientoId && indicadores.length === 0 && <p style={{ color: "#b45309" }}>No hay indicadores habilitados para {tipoComponente.toLowerCase()} en este planeamiento.</p>}

              {indicadores.map((indicador, index) => (
                <div key={indicador.IndicadorGrupoId} style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "14px", background: "#f9fafb" }}>
                  <strong>Indicador {index + 1}</strong>
                  <p style={{ color: "#374151" }}>{indicador.IndicadorBase}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`indicador-${indicador.IndicadorGrupoId}`}
                        checked={valores[indicador.IndicadorGrupoId]?.ValorSeleccionado === 1}
                        onChange={() => actualizarValor(indicador.IndicadorGrupoId, "ValorSeleccionado", 1)}
                      />
                      Inicial - 1 punto
                    </label>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`indicador-${indicador.IndicadorGrupoId}`}
                        checked={valores[indicador.IndicadorGrupoId]?.ValorSeleccionado === 2}
                        onChange={() => actualizarValor(indicador.IndicadorGrupoId, "ValorSeleccionado", 2)}
                      />
                      Intermedio - 2 puntos
                    </label>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`indicador-${indicador.IndicadorGrupoId}`}
                        checked={valores[indicador.IndicadorGrupoId]?.ValorSeleccionado === 3}
                        onChange={() => actualizarValor(indicador.IndicadorGrupoId, "ValorSeleccionado", 3)}
                      />
                      Avanzado - 3 puntos
                    </label>
                  </div>

                  <textarea
                    style={{ ...inputStyle, marginTop: "10px", minHeight: "70px" }}
                    placeholder="Observación opcional"
                    value={valores[indicador.IndicadorGrupoId]?.Observacion || ""}
                    onChange={(e) => actualizarValor(indicador.IndicadorGrupoId, "Observacion", e.target.value)}
                  />
                </div>
              ))}

              {indicadores.length > 0 && (
                <button type="submit" className="primary-btn" disabled={loading || !estudianteId}>
                  Guardar seguimiento
                </button>
              )}
            </form>
          )}

          {tipoComponente === "EXAMEN" && (
            <form onSubmit={guardarExamen} style={{ display: "grid", gap: "12px", maxWidth: "720px" }}>
              <div>
                <label style={labelStyle}>Nombre del examen</label>
                <input style={inputStyle} value={examenNombre} onChange={(e) => setExamenNombre(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" style={inputStyle} value={examenFecha} onChange={(e) => setExamenFecha(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Puntos obtenidos</label>
                  <input type="number" step="0.01" style={inputStyle} value={puntosObtenidos} onChange={(e) => setPuntosObtenidos(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Puntos máximos</label>
                  <input type="number" step="0.01" style={inputStyle} value={puntosMaximos} onChange={(e) => setPuntosMaximos(e.target.value)} />
                </div>
              </div>
              <textarea style={{ ...inputStyle, minHeight: "80px" }} placeholder="Observación opcional" value={observacionExamen} onChange={(e) => setObservacionExamen(e.target.value)} />
              <button type="submit" className="primary-btn" disabled={loading || !estudianteId}>Guardar examen</button>
            </form>
          )}

          {tipoComponente === "ASISTENCIA" && (
            <div style={{ display: "grid", gap: "10px" }}>
              <p style={{ color: "#374151" }}>
                La asistencia se calcula desde la toma diaria registrada para este grupo, materia, año y periodo.
              </p>
              {resumen && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                  <div style={cardStyle}><strong>Lecciones</strong><br />{resumen.totalLecciones}</div>
                  <div style={cardStyle}><strong>Ausencias</strong><br />{resumen.ausencias}</div>
                  <div style={cardStyle}><strong>% ausencias</strong><br />{formatNumber(resumen.porcentajeAusencias)}%</div>
                  <div style={cardStyle}><strong>Obtiene</strong><br />{formatNumber(resumen.porcentajeObtenido)}%</div>
                </div>
              )}
              <button type="button" className="primary-btn" onClick={cargarResumenAsistencia} disabled={loading || !estudianteId}>
                Recalcular asistencia
              </button>
            </div>
          )}

          {tipoComponente === "OTRO" && (
            <p style={{ color: "#6b7280" }}>
              Este componente todavía no tiene una lógica automática. Se puede agregar después según el tipo de evaluación que necesités.
            </p>
          )}
        </div>
      )}

      {resumen && tipoComponente !== "ASISTENCIA" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Resultado del registro</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
            <div><strong>Nota sobre 100</strong><br />{formatNumber(resumen.NotaSobre100 ?? resumen.notaSobre100)}</div>
            <div><strong>% obtenido</strong><br />{formatNumber(resumen.PorcentajeObtenido ?? resumen.porcentajeObtenido)}%</div>
            <div><strong>Puntos</strong><br />{formatNumber(resumen.PuntosObtenidos ?? resumen.puntosObtenidos)} / {formatNumber(resumen.PuntosMaximos ?? resumen.puntosMaximos)}</div>
          </div>
        </div>
      )}

      {consolidado && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Consolidado del estudiante</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ textAlign: "left", padding: "10px" }}>Componente</th>
                  <th style={{ textAlign: "left", padding: "10px" }}>Tipo</th>
                  <th style={{ textAlign: "right", padding: "10px" }}>Valor</th>
                  <th style={{ textAlign: "right", padding: "10px" }}>Nota</th>
                  <th style={{ textAlign: "right", padding: "10px" }}>% obtenido</th>
                </tr>
              </thead>
              <tbody>
                {(consolidado.detalle || []).map((item: any) => (
                  <tr key={item.EstructuraGrupoDetalleId} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "10px" }}>{item.Nombre}</td>
                    <td style={{ padding: "10px" }}>{item.Tipo}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{formatNumber(item.Porcentaje)}%</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{formatNumber(item.NotaSobre100)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{formatNumber(item.PorcentajeObtenido)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #111827" }}>
                  <td colSpan={4} style={{ padding: "10px", fontWeight: 800 }}>Nota final</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 800 }}>{formatNumber(consolidado.notaFinal)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}



