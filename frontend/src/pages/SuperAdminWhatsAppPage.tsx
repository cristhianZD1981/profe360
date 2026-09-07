import { getCostaRicaIsoDate, getCostaRicaIsoDateWithOffset } from "../utils/date";
import { useEffect, useState } from "react";
import api from "../lib/http";
import WhatsAppInstitutionManager from "../components/WhatsAppInstitutionManager";

type Row = {
  WhatsAppEnvioId: number;
  CreatedAt: string;
  InstitucionNombre?: string;
  TipoMensaje?: string;
  Estado?: string;
  TelefonoDestino?: string;
  NumeroOrigenSnapshot?: string;
  EsFallback?: boolean;
  MotivoError?: string;
  Seccion?: string;
  Profesor?: string;
  MensajeResumen?: string;
  ComunicadoMensaje?: string;
  ComunicadoContexto?: string;
};

const card: React.CSSProperties = { background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 14, padding: 18 };
const input: React.CSSProperties = { display: "block", color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: 8, padding: "9px 10px", minWidth: 150, marginTop: 5 };
const label: React.CSSProperties = { color: "#334155", fontWeight: 600, fontSize: 13 };

function dataOf(response: any) { return response?.data?.data ?? response?.data ?? {}; }

export default function SuperAdminWhatsAppPage() {
  const [instituciones, setInstituciones] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [fechaDesde, setFechaDesde] = useState(() => getCostaRicaIsoDateWithOffset(-29));
  const [fechaHasta, setFechaHasta] = useState(() => getCostaRicaIsoDate());
  const [institucionId, setInstitucionId] = useState("");
  const [tipo, setTipo] = useState("");
  const [tipos, setTipos] = useState<string[]>(["ASISTENCIA", "TAREA", "PROYECTO", "COTIDIANO", "EXAMENES", "BOLETA", "COMUNICADO", "GENERAL"]);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  async function exportar() {
    setExportando(true); setError("");
    try {
      const response = await api.get("/reportes/admin/whatsapp", { params: { fechaDesde, fechaHasta, institucionId: institucionId || undefined, tipo: tipo || undefined, formato: "excel" }, responseType: "blob" });
      if (!String(response.headers["content-type"]).includes("spreadsheetml")) throw new Error("La respuesta no es un archivo Excel válido");
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a"); a.href = url; a.download = `envios-whatsapp-${fechaDesde}-${fechaHasta}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      let message = "No se pudo descargar el Excel. Revisá el rango de fechas e intentá nuevamente.";
      if (e.response?.data instanceof Blob) { try { message = JSON.parse(await e.response.data.text()).message || message; } catch {} }
      setError(message);
    } finally { setExportando(false); }
  }

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await api.get("/reportes/admin/whatsapp", { params: { fechaDesde, fechaHasta, institucionId: institucionId || undefined, tipo: tipo || undefined } });
      const data = dataOf(response);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.resumen || {});
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cargar el reporte de WhatsApp.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    api.get("/reportes/admin/whatsapp/filtros").then((response) => {
      const data = dataOf(response);
      setInstituciones(Array.isArray(data.instituciones) ? data.instituciones : []);
      if (Array.isArray(data.tipos)) setTipos(data.tipos);
    }).catch(() => setError("No se pudieron cargar los colegios."));
    void load();
  }, []);

  return <div style={{ display: "grid", gap: 16 }}>
    <div>
      <h1 style={{ marginBottom: 4 }}>WhatsApp</h1>
      <p style={{ marginTop: 0, color: "#64748b" }}>Administración de canales por institución y control de mensajes enviados.</p>
    </div>
    <WhatsAppInstitutionManager />
    <div><h2 style={{ marginBottom: 4 }}>Reporte de envíos</h2><p style={{ marginTop: 0, color: "#64748b" }}>Estadísticas por colegio, sección, profesor y tipo de mensaje.</p></div>
    <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
      <label style={label}>Desde<input style={input} type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} /></label>
      <label style={label}>Hasta<input style={input} type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} /></label>
      <label style={label}>Colegio<select style={input} value={institucionId} onChange={(e) => setInstitucionId(e.target.value)}><option value="">Todos</option>{instituciones.map((item) => <option key={item.InstitucionId} value={item.InstitucionId}>{item.Nombre}</option>)}</select></label>
      <label style={label}>Tipo<select style={input} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>{tipos.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Cargando..." : "Consultar"}</button>
      <button type="button" onClick={() => void exportar()} disabled={loading || exportando}>{exportando ? "Descargando…" : "Descargar Excel"}</button>
      <small style={{ color: "#475569" }}>Excel incluye todos los registros de los filtros seleccionados.</small>
    </div>
    {error && <div style={{ ...card, color: "#b91c1c" }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
      {["Total", "Enviados", "Fallidos", "Pendientes", "Inciertos", "Omitidos", "Fallback"].map((key) => <div key={key} style={card}><div style={{ color: "#64748b", fontSize: 13 }}>{key}</div><strong style={{ fontSize: 25 }}>{Number(summary[key] || 0)}</strong></div>)}
    </div>
    <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", color: "#0f172a", borderCollapse: "collapse", minWidth: 1000 }}><thead><tr>{["Fecha", "Colegio", "Tipo", "Sección", "Profesor", "Destino", "Origen", "Estado"].map((head) => <th key={head} style={{ color: "#334155", textAlign: "left", padding: 10, borderBottom: "1px solid #cbd5e1" }}>{head}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={row.WhatsAppEnvioId} style={{ background: rowIndex % 2 === 0 ? "#ffffff" : "#e2e8f0" }}>{[new Date(row.CreatedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" }), row.InstitucionNombre || "-", row.TipoMensaje || "-", row.Seccion || "-", row.Profesor || "-", row.TelefonoDestino || "-", `${row.NumeroOrigenSnapshot || "-"}${row.EsFallback ? " (Profe360)" : ""}`, row.Estado || "-"].map((value, index) => <td key={index} style={{ color: "#0f172a", padding: 10, borderBottom: "1px solid #e2e8f0" }}>{value}</td>)}</tr>)}{!rows.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No hay registros para los filtros seleccionados.</td></tr>}</tbody></table>
    </div>
  </div>;
}
