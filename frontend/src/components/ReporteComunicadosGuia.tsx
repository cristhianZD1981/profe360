import { useEffect, useState } from "react";
import api from "../lib/http";
import type { ContextoReporteGuia } from "../pages/ReportesPage";
import { getCostaRicaIsoDate } from "../utils/date";
import "./ComunicadosPanel.css";

export const columnasComunicados = ["Fecha y hora", "Alumno", "Identificación", "Sección", "Materia", "Profesor", "Mensaje", "WhatsApp", "Correo"];
export function filaComunicado(r: any) {
  const canal = (nombre: string) => r.destinos.filter((d: any) => d.Canal === nombre).map((d: any) =>
    `${d.EncargadoNombre || "Encargado"} · ${d.Destino || "Sin contacto"}: ${d.Estado}${d.Motivo ? ` — ${d.Motivo}` : ""}${d.CopiaProfesor ? ` · Copia: ${d.CopiaProfesor}` : ""}`).join("\n") || "Sin registro";
  return [`${r.Fecha} ${r.Hora}`, r.contexto.alumno, r.Identificacion, r.contexto.seccion,
    r.contexto.materia, r.contexto.profesor, r.Mensaje, canal("WHATSAPP"), canal("CORREO")].map(v => String(v || ""));
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function ReporteComunicadosGuia({ guia }: { guia: ContextoReporteGuia }) {
  const [filtros, setFiltros] = useState<any>(null);
  const [vista, setVista] = useState("SECCION");
  const [alumno, setAlumno] = useState("");
  const [profesor, setProfesor] = useState("");
  const [materia, setMateria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(getCostaRicaIsoDate());
  const [reporte, setReporte] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const params = { guiaGrupoId: guia.grupoId, guiaAnioLectivoId: guia.anioLectivoId, guiaPeriodoId: guia.periodoId };
  useEffect(() => {
    let vigente = true;
    api.get("/reportes/gestion-filtros", { params }).then(r => {
      if (!vigente) return;
      setFiltros(r.data.data); setDesde(r.data.data.desde);
      setHasta(r.data.data.hasta < getCostaRicaIsoDate() ? r.data.data.hasta : getCostaRicaIsoDate());
    }).catch(() => { if (vigente) setError("No se pudieron cargar los filtros del grupo"); });
    return () => { vigente = false; };
  }, [guia.grupoId, guia.anioLectivoId, guia.periodoId]);
  async function consultar() {
    if ((vista === "ALUMNO" && !alumno) || (vista === "PROFESOR" && !profesor)) { setError("Seleccioná el alumno o profesor que querés consultar"); return; }
    setLoading(true); setError(""); setReporte(null);
    try {
      const r = await api.get("/reportes/guia/comunicados", { params: { ...params, desde, hasta,
        estudianteId: vista === "ALUMNO" ? alumno : undefined, profesorId: vista === "PROFESOR" ? profesor : undefined, materiaId: materia || undefined } });
      setReporte(r.data.data);
    } catch (e: any) { setError(e.response?.data?.message || "No se pudo consultar el reporte"); }
    finally { setLoading(false); }
  }
  const rows = (reporte?.rows || []).map(filaComunicado);
  const titulo = `Comunicados — ${reporte?.grupo || filtros?.secciones[0]?.GrupoNombre || "Grupo guía"}`;
  const periodo = reporte ? `${reporte.desde} al ${reporte.hasta} · Hora de Costa Rica` : "";
  async function exportar() {
    setExportando(true); setError("");
    try { const { exportarComunicadosGuia } = await import("../utils/comunicadosGuiaExcel"); await exportarComunicadosGuia(titulo, periodo, columnasComunicados, rows); }
    catch { setError("No se pudo exportar a Excel"); } finally { setExportando(false); }
  }
  function imprimir() {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Permití ventanas emergentes para imprimir el reporte"); return; }
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>@page{size:landscape;margin:10mm}body{font:11px Arial;color:#0f172a}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:6px;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#e2e8f0}tbody tr:nth-child(even){background:#f1f5f9}thead{display:table-header-group}</style></head><body><h2>${escapeHtml(titulo)}</h2><p>${escapeHtml(periodo)}</p><table><thead><tr>${columnasComunicados.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r: string[]) => `<tr>${r.map(v => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }
  const cambiar = (setter: (v: string) => void, value: string) => { setter(value); setReporte(null); };
  const alumnos = (filtros?.alumnos || []).filter((a: any) => `${a.Nombre} ${a.PrimerApellido} ${a.SegundoApellido} ${a.Identificacion}`.toLowerCase().includes(busqueda.toLowerCase()));
  const materias = [...new Map<number, any>((filtros?.materias || []).map((m: any) => [m.MateriaId, m])).values()];
  return <section className="comunicados-panel" style={{ background: "#fff", color: "#0f172a", padding: 16, borderRadius: 12, display: "grid", gap: 14 }}>
    <h4>{titulo}</h4>
    <fieldset disabled={loading || !filtros} style={{ border: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
      <label>Desde<input type="date" value={desde} onChange={e => cambiar(setDesde, e.target.value)} /></label>
      <label>Hasta<input type="date" max={getCostaRicaIsoDate()} value={hasta} onChange={e => cambiar(setHasta, e.target.value)} /></label>
      <label>Ver reporte por<select value={vista} onChange={e => cambiar(setVista, e.target.value)}><option value="ALUMNO">Alumno</option><option value="SECCION">Sección</option><option value="PROFESOR">Profesor</option></select></label>
      <label>Sección<select disabled value={guia.grupoId}><option value={guia.grupoId}>{filtros?.secciones[0]?.GrupoNombre || "Grupo guía"}</option></select></label>
      {vista === "ALUMNO" ? <label>Alumno<input placeholder="Buscar por nombre o identificación" value={busqueda} onChange={e => setBusqueda(e.target.value)} /><select value={alumno} onChange={e => cambiar(setAlumno, e.target.value)}><option value="">Seleccionar alumno</option>{alumnos.map((a: any) => <option key={a.EstudianteId} value={a.EstudianteId}>{[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")} — {a.Identificacion}</option>)}</select></label> : null}
      {vista === "PROFESOR" ? <label>Profesor<select value={profesor} onChange={e => cambiar(setProfesor, e.target.value)}><option value="">Seleccionar profesor</option>{filtros?.profesores.map((p: any) => <option key={p.ProfesorId} value={p.ProfesorId}>{p.Nombre}</option>)}</select></label> : null}
      <label>Materia<select value={materia} onChange={e => cambiar(setMateria, e.target.value)}><option value="">Todas las materias</option>{materias.map(m => <option key={m.MateriaId} value={m.MateriaId}>{m.MateriaNombre}</option>)}</select></label>
    </fieldset>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="primary-btn" disabled={loading || !filtros} onClick={() => void consultar()}>{loading ? "Consultando…" : "Consultar"}</button>
      <button type="button" disabled={!rows.length || exportando} onClick={() => void exportar()}>{exportando ? "Exportando…" : "Exportar Excel"}</button>
      <button type="button" disabled={!rows.length} onClick={imprimir}>Imprimir / PDF</button>
    </div>
    {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
    {reporte ? <p>{reporte.rows.length} comunicado(s) · {periodo}</p> : null}
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}><thead><tr>{columnasComunicados.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r: string[], i: number) => <tr key={reporte.rows[i].ComunicadoId} style={{ background: i % 2 ? "#f1f5f9" : "#fff" }}>{r.map((v, j) => <td key={j} style={{ whiteSpace: "pre-wrap", verticalAlign: "top", overflowWrap: "anywhere", minWidth: j >= 6 ? 220 : undefined }}>{v}</td>)}</tr>)}</tbody></table></div>
    {!loading && !rows.length ? <p>{reporte ? "No hay comunicados para los filtros seleccionados." : "Seleccioná los filtros y presioná Consultar."}</p> : null}
  </section>;
}
