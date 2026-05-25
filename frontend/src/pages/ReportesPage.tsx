import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type TipoReporte = "ASISTENCIA" | "COTIDIANO" | "TAREAS" | "EXAMENES" | "MENSAJES" | "BOLETAS" | "NOTAS";

function descargarBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.replace(/\s+/g, "-").toLowerCase();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function ReportesPage() {
  const [tipo, setTipo] = useState<TipoReporte>("ASISTENCIA");
  const [secciones, setSecciones] = useState<any[]>([]);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [grupoId, setGrupoId] = useState<string>("");
  const [estudianteId, setEstudianteId] = useState<string>("");
  const [busquedaAlumno, setBusquedaAlumno] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/reportes/gestion-filtros").then((r) => {
      const data = r.data?.data || {};
      setSecciones(Array.isArray(data.secciones) ? data.secciones : []);
      setAlumnos(Array.isArray(data.alumnos) ? data.alumnos : []);
    });
  }, []);

  const alumnosFiltrados = useMemo(() => {
    let base = alumnos;
    if (grupoId) base = base.filter((a) => String(a.GrupoId) === String(grupoId));
    const q = busquedaAlumno.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const nombre = [a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ").toLowerCase();
      const cedula = String(a.Identificacion || "").toLowerCase();
      return nombre.includes(q) || cedula.includes(q);
    });
  }, [alumnos, grupoId, busquedaAlumno]);

  async function consultar() {
    setLoading(true);
    try {
      const response = await api.get("/reportes/gestion-profe", {
        params: {
          tipo,
          grupoId: grupoId || undefined,
          estudianteId: estudianteId || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined
        }
      });
      setFilas(Array.isArray(response.data?.data) ? response.data.data : []);
    } finally {
      setLoading(false);
    }
  }

  function exportarExcel() {
    const headers = Object.keys(filas[0] || {});
    const rows = filas.map((f) => headers.map((h) => f[h]));
    const thead = `<tr>${headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9">${escapeHtml(h)}</th>`).join("")}</tr>`;
    const tbody = rows.map((row) => `<tr>${row.map((c) => `<td style="border:1px solid #cbd5e1;padding:8px">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h3>Reporte ${escapeHtml(tipo)}</h3><table style="border-collapse:collapse">${thead}${tbody}</table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    descargarBlob(blob, `reporte-${tipo}.xls`);
  }

  function exportarPdf() {
    const headers = Object.keys(filas[0] || {});
    const rows = filas.map((f) => headers.map((h) => f[h]));
    const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
    const tbody = rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Reporte ${escapeHtml(tipo)}</title><style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px}th{background:#f1f5f9}</style></head><body><h2>Reporte ${escapeHtml(tipo)}</h2><table>${thead}${tbody}</table><script>window.onload=function(){window.print();}</script></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Certificaciones y Reportes</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
          <label>Tipo de reporte
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoReporte)}>
              <option value="ASISTENCIA">Reporte de Asistencia</option>
              <option value="COTIDIANO">Reporte de Cotidiano</option>
              <option value="TAREAS">Reporte de Tareas</option>
              <option value="EXAMENES">Reporte de Exámenes</option>
              <option value="MENSAJES">Reporte de mensajes enviados</option>
              <option value="BOLETAS">Reporte de Boletas</option>
              <option value="NOTAS">Reporte de Notas</option>
            </select>
          </label>
          <label>Sección
            <select value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setEstudianteId(""); }}>
              <option value="">Todas</option>
              {secciones.map((s) => <option key={s.GrupoId} value={s.GrupoId}>{s.GrupoNombre}</option>)}
            </select>
          </label>
          <label>Alumno
            <input
              type="text"
              value={busquedaAlumno}
              onChange={(e) => setBusquedaAlumno(e.target.value)}
              placeholder="Buscar por nombre o cédula"
              style={{ marginBottom: 6 }}
            />
            <select value={estudianteId} onChange={(e) => setEstudianteId(e.target.value)}>
              <option value="">Todos</option>
              {alumnosFiltrados.map((a) => (
                <option key={a.EstudianteId} value={a.EstudianteId}>
                  {[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")}{a.Identificacion ? ` - ${a.Identificacion}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" className="primary-btn" onClick={consultar} disabled={loading}>{loading ? "Consultando..." : "Consultar"}</button>
          <button type="button" className="primary-btn" onClick={exportarExcel} disabled={!filas.length}>Exportar Excel</button>
          <button type="button" className="primary-btn" onClick={exportarPdf} disabled={!filas.length}>Exportar PDF</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {Object.keys(filas[0] || { Resultado: "" }).map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!filas.length ? (
                <tr><td colSpan={20} style={{ textAlign: "center", padding: "12px" }}>No hay datos. Elegí filtros y presioná Consultar.</td></tr>
              ) : filas.map((fila, idx) => (
                <tr key={idx}>
                  {Object.keys(filas[0] || {}).map((h) => <td key={h}>{String(fila[h] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
