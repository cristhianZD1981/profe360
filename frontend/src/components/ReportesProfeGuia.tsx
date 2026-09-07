import { Fragment, useEffect, useState } from "react";
import api from "../lib/http";
import ReportesPage, { type ContextoReporteGuia } from "../pages/ReportesPage";
import { calcularRegistroNotas, prepararContextoNotas } from "../utils/registroNotas";
import ReporteComunicadosGuia from "./ReporteComunicadosGuia";

type Materia = { MateriaId: number; MateriaNombre: string; ProfesorId: number; ProfesorNombre: string; GrupoClaseId?: number | null; GrupoConsultaId: number };
export type RegistroGuiaMateria = { materia: Materia; alumnos: ReturnType<typeof calcularRegistroNotas> };
const claveMateria = (m: Materia) => `${m.MateriaId}-${m.ProfesorId}-${m.GrupoClaseId || 0}-${m.GrupoConsultaId}`;
const porcentaje = (n: number) => `${Number(n || 0).toFixed(2)}%`;

export default function ReportesProfeGuia({ guia }: { guia: ContextoReporteGuia }) {
  const [tipo, setTipo] = useState<"ASISTENCIA" | "BOLETAS" | "NOTAS" | "COMUNICADOS">("ASISTENCIA");
  return <section style={{ display: "grid", gap: 16 }}>
    <h3>Reportes Profe Guía</h3>
    <p>Consulta y exportación del grupo asignado. Solo lectura.</p>
    <label>Tipo de reporte
      <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
        <option value="ASISTENCIA">Reporte de Asistencia</option>
        <option value="BOLETAS">Reporte de Boletas</option>
        <option value="NOTAS">Registro de Notas por materia y profesor</option>
        <option value="COMUNICADOS">Comunicados</option>
      </select>
    </label>
    {tipo === "COMUNICADOS" ? <ReporteComunicadosGuia key={`${guia.grupoId}-${guia.anioLectivoId}-${guia.periodoId}`} guia={guia} /> : tipo === "NOTAS" ? <RegistroNotasGuia guia={guia} /> : <ReportesPage key={tipo} guia={guia} tipoInicial={tipo} />}
  </section>;
}

function RegistroNotasGuia({ guia }: { guia: ContextoReporteGuia }) {
  const [filtros, setFiltros] = useState<{ materias: Materia[]; alumnos: any[]; secciones: any[] } | null>(null);
  const [materia, setMateria] = useState("");
  const [alumno, setAlumno] = useState("");
  const [resultados, setResultados] = useState<RegistroGuiaMateria[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const [progreso, setProgreso] = useState("");
  const paramsGuia = { guiaGrupoId: guia.grupoId, guiaAnioLectivoId: guia.anioLectivoId, guiaPeriodoId: guia.periodoId };
  useEffect(() => {
    let vigente = true;
    api.get("/reportes/gestion-filtros", { params: paramsGuia }).then((r) => {
      if (vigente) setFiltros(r.data.data);
    }).catch((e) => { if (vigente) setError(e.response?.data?.message || "No se pudieron cargar las materias del grupo"); });
    return () => { vigente = false; };
  }, [guia.grupoId, guia.anioLectivoId, guia.periodoId]);

  async function consultar() {
    if (!filtros || cargando) return;
    setError(""); setResultados([]); setCargando(true);
    try {
      const seleccion = filtros.materias.filter((m) => !materia || claveMateria(m) === materia);
      const datos: RegistroGuiaMateria[] = [];
      for (const [index, m] of seleccion.entries()) {
        setProgreso(`${index + 1} de ${seleccion.length}: ${m.MateriaNombre}`);
        const response = await api.get("/eval360/seguimiento/contexto", { params: {
          ...paramsGuia, grupoId: m.GrupoConsultaId, materiaId: m.MateriaId,
          anioLectivoId: guia.anioLectivoId, periodoId: guia.periodoId,
          grupoClaseId: m.GrupoClaseId || undefined, incluirAsistencia: 1, incluirEnvios: 1
        } });
        const contexto = prepararContextoNotas(response.data.data);
        datos.push({ materia: m, alumnos: calcularRegistroNotas(contexto).filter((a) => !alumno || a.key === alumno) });
      }
      setResultados(datos);
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo cargar el registro de notas. Intentá nuevamente.");
    } finally { setCargando(false); setProgreso(""); }
  }

  async function exportar() {
    setExportando(true); setError("");
    try {
      const { exportarRegistroGuia } = await import("../utils/registroGuiaExcel");
      await exportarRegistroGuia(resultados, filtros?.secciones[0]?.GrupoNombre || "");
    } catch { setError("No se pudo exportar el registro de notas."); }
    finally { setExportando(false); }
  }

  const celda = { padding: 8, border: "1px solid #cbd5e1", textAlign: "left" as const, verticalAlign: "top" as const };
  return <div style={{ display: "grid", gap: 14, background: "#fff", color: "#0f172a", padding: 14 }}>
    <h4>Registro de Notas — {filtros?.secciones[0]?.GrupoNombre || "Grupo guía"}</h4>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Materia y profesor<select disabled={cargando} value={materia} onChange={(e) => { setMateria(e.target.value); setResultados([]); }}>
        <option value="">Todas las materias y profesores</option>
        {filtros?.materias.map((m) => <option key={claveMateria(m)} value={claveMateria(m)}>{m.MateriaNombre} — {m.ProfesorNombre}</option>)}
      </select></label>
      <label>Alumno<select disabled={cargando} value={alumno} onChange={(e) => { setAlumno(e.target.value); setResultados([]); }}>
        <option value="">Todos los alumnos del grupo</option>
        {filtros?.alumnos.map((a) => <option key={a.EstudianteId} value={a.EstudianteId}>{[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")}</option>)}
      </select></label>
    </div>
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" className="primary-btn" disabled={!filtros || cargando} onClick={() => void consultar()}>{cargando ? "Consultando…" : "Consultar"}</button>
      <button type="button" disabled={!resultados.length || cargando || exportando} onClick={() => void exportar()}>{exportando ? "Exportando…" : "Exportar Excel"}</button>
    </div>
    {progreso ? <p role="status">{progreso}</p> : null}
    {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
    {!resultados.length && !cargando && !error ? <p>Seleccioná los filtros y presioná Consultar.</p> : null}
    {resultados.map((resultado) => <section key={claveMateria(resultado.materia)}>
      <h4>{resultado.materia.MateriaNombre} — {resultado.materia.ProfesorNombre}</h4>
      {!resultado.alumnos.length ? <p>No hay alumnos con registro en esta materia.</p> : resultado.alumnos.map((a) => <details key={a.key} style={{ marginBottom: 12, border: "1px solid #cbd5e1", padding: 10 }}>
        <summary style={{ cursor: "pointer" }}>{a.nombre} · {a.identificacion} · Evaluado: {porcentaje(a.totalEvaluado)} · Obtenido: {porcentaje(a.totalGanado)}</summary>
        {!a.componentes.length ? <p>Sin estructura de evaluación registrada para este período.</p> : <div style={{ overflowX: "auto", marginTop: 10 }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Componente", "% valor", "% evaluado", "% obtenido", "Detalle"].map((h) => <th key={h} style={celda}>{h}</th>)}</tr></thead>
          <tbody>{a.componentes.map((c) => <Fragment key={c.key}>
            <tr><td style={celda}>{c.nombre}</td><td style={celda}>{porcentaje(c.porcentajeComponente)}</td><td style={celda}>{porcentaje(c.porcentajeEvaluado)}</td><td style={celda}>{porcentaje(c.porcentajeGanado)}</td>
              <td style={celda}><details><summary style={{ cursor: "pointer" }}>Ver detalle ({c.evaluados} evaluados / {c.pendientes} pendientes)</summary>
                <p>{c.resumen}</p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Actividad / lección", "Detalle", "Estado", "Nota", "% obtenido"].map((h) => <th style={celda} key={h}>{h}</th>)}</tr></thead>
                  <tbody>{c.detalles.map((d) => <tr key={d.key}><td style={celda}>{d.titulo}</td><td style={celda}>{d.subtitulo}</td><td style={celda}>{d.estado}</td><td style={celda}>{Number(d.nota).toFixed(2)}</td><td style={celda}>{porcentaje(d.porcentaje)}</td></tr>)}</tbody>
                </table>
              </details></td>
            </tr>
          </Fragment>)}</tbody>
        </table></div>}
      </details>)}
    </section>)}
  </div>;
}
