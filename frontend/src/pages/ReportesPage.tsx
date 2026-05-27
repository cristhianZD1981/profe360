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
    .replace(/\"/g, "&quot;")
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

  const [grupoIdConstancia, setGrupoIdConstancia] = useState<string>("");
  const [estudianteIdConstancia, setEstudianteIdConstancia] = useState<string>("");
  const [busquedaConstancia, setBusquedaConstancia] = useState<string>("");
  const [codigoPresupuestario, setCodigoPresupuestario] = useState("");
  const [tipoEducacion, setTipoEducacion] = useState("GENERAL BASICA");
  const [motivoTramite, setMotivoTramite] = useState("IMAS");
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [generandoConstancia, setGenerandoConstancia] = useState(false);

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

  const alumnosConstanciaFiltrados = useMemo(() => {
    let base = alumnos;
    if (grupoIdConstancia) base = base.filter((a) => String(a.GrupoId) === String(grupoIdConstancia));
    const q = busquedaConstancia.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const nombre = [a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ").toLowerCase();
      const cedula = String(a.Identificacion || "").toLowerCase();
      return nombre.includes(q) || cedula.includes(q);
    });
  }, [alumnos, grupoIdConstancia, busquedaConstancia]);

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

  async function generarConstancia() {
    if (!estudianteIdConstancia) {
      window.alert("Selecciona un alumno para generar la constancia.");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      window.alert("No se pudo abrir la vista de impresion. Revisa el bloqueador de ventanas.");
      return;
    }
    win.document.open();
    win.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Generando constancia...</title></head><body style='font-family:Arial,sans-serif;padding:20px'>Generando constancia, por favor esperá...</body></html>");
    win.document.close();

    setLoading(true);
    setGenerandoConstancia(true);
    try {
      const response = await api.post("/reportes/certificaciones/constancia-estudio/generar", {
        estudianteId: Number(estudianteIdConstancia),
        grupoId: grupoIdConstancia ? Number(grupoIdConstancia) : null,
        codigoPresupuestario: codigoPresupuestario.trim(),
        tipoEducacion,
        motivoTramite,
        fechaEmision
      });
      const html = String(response.data?.data?.html || "");
      const codigo = String(response.data?.data?.codigoConstancia || "");
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        try { win.focus(); } catch {}
      }, 250);
      window.alert(`Constancia generada: ${codigo}`);
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "No se pudo generar la constancia");
    } finally {
      setLoading(false);
      setGenerandoConstancia(false);
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
        <h3>Reportes</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
          <label>Tipo de reporte
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoReporte)}>
              <option value="ASISTENCIA">Reporte de Asistencia</option>
              <option value="COTIDIANO">Reporte de Cotidiano</option>
              <option value="TAREAS">Reporte de Tareas</option>
              <option value="EXAMENES">Reporte de Examenes</option>
              <option value="MENSAJES">Reporte de mensajes enviados</option>
              <option value="BOLETAS">Reporte de Boletas</option>
              <option value="NOTAS">Reporte de Notas</option>
            </select>
          </label>
          <label>Seccion
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
              placeholder="Buscar por nombre o cedula"
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
                <tr><td colSpan={20} style={{ textAlign: "center", padding: "12px" }}>No hay datos. Elegi filtros y presiona Consultar.</td></tr>
              ) : filas.map((fila, idx) => (
                <tr key={idx}>
                  {Object.keys(filas[0] || {}).map((h) => <td key={h}>{String(fila[h] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Certificaciones</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
          <label>Seccion
            <select value={grupoIdConstancia} onChange={(e) => { setGrupoIdConstancia(e.target.value); setEstudianteIdConstancia(""); }}>
              <option value="">Todas</option>
              {secciones.map((s) => <option key={s.GrupoId} value={s.GrupoId}>{s.GrupoNombre}</option>)}
            </select>
          </label>
          <label>Alumno (nombre o cedula)
            <input
              type="text"
              value={busquedaConstancia}
              onChange={(e) => setBusquedaConstancia(e.target.value)}
              placeholder="Buscar por nombre o cedula"
              style={{ marginBottom: 6 }}
            />
            <select value={estudianteIdConstancia} onChange={(e) => setEstudianteIdConstancia(e.target.value)}>
              <option value="">Seleccionar alumno</option>
              {alumnosConstanciaFiltrados.map((a) => (
                <option key={a.EstudianteId} value={a.EstudianteId}>
                  {[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")}{a.Identificacion ? ` - ${a.Identificacion}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>Codigo presupuestario (opcional)
            <input value={codigoPresupuestario} onChange={(e) => setCodigoPresupuestario(e.target.value)} placeholder="Si va vacio se toma de la institucion" />
          </label>
          <label>Tipo de educacion
            <select value={tipoEducacion} onChange={(e) => setTipoEducacion(e.target.value)}>
              <option value="GENERAL BASICA">General Basica</option>
              <option value="DIVERSIFICADA">Diversificada</option>
              <option value="ESPECIAL">Especial</option>
            </select>
          </label>
          <label>Tramite
            <select value={motivoTramite} onChange={(e) => setMotivoTramite(e.target.value)}>
              <option value="IMAS">Tramite ante el IMAS</option>
              <option value="TRASLADO">Traslado a otro colegio</option>
            </select>
          </label>
          <label>Fecha de emision
            <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="primary-btn" onClick={generarConstancia} disabled={loading || !estudianteIdConstancia}>
            {loading ? "Generando..." : "Generar constancia de estudio"}
          </button>
        </div>
        {generandoConstancia ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 10, borderRadius: 999, background: "#dbeafe", overflow: "hidden", border: "1px solid #93c5fd" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "repeating-linear-gradient(135deg, #06b6d4, #06b6d4 12px, #22c55e 12px, #22c55e 24px)"
                }}
              />
            </div>
            <p style={{ margin: "6px 0 0", color: "#0f172a", fontWeight: 700 }}>Generando constancia, por favor esperá...</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
