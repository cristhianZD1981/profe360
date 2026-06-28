import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../lib/http";
import { getCostaRicaIsoDate } from "../utils/date";

type TipoReporte =
  | "ASISTENCIA"
  | "BOLETAS";

type VistaAsistencia = "ALUMNO" | "SECCION" | "PROFESOR";

type AsistenciaDetalle = {
  materiaId: number;
  materia: string;
  profesorId?: number | null;
  profesor: string;
  alertaTemprana: string;
  totalLecciones: number;
  tardias: number;
  ausenciasJustificadas: number;
  ausenciasInjustificadas: number;
  presentes: number;
  cantidadCorreosEnviados: number;
  cantidadWhatsAppEnviados: number;
};

type AsistenciaResumen = {
  estudianteId: number;
  alumno: string;
  identificacion: string;
  seccion: string;
  alertaTemprana: string;
  totalLecciones: number;
  tardias: number;
  ausenciasJustificadas: number;
  ausenciasInjustificadas: number;
  presentes: number;
  cantidadCorreosEnviados: number;
  cantidadWhatsAppEnviados: number;
  detalle: AsistenciaDetalle[];
};

type BoletaReporteRow = {
  boletaConductaId: number;
  numeroBoleta: string;
  Consecutivo?: number;
  nombre: string;
  cedula: string;
  seccion: string;
  fecha: string;
  envioCorreo: string;
  envioWhatsApp: string;
};

type CertificacionRow = {
  CertificacionEstudioId: number;
  CodigoConstancia: string;
  Consecutivo: number;
  EstudianteId: number;
  GrupoId?: number | null;
  EstudianteNombre: string;
  Identificacion: string;
  GrupoNombre: string;
  TipoEducacion: string;
  MotivoTramite: string;
  CursoLectivo: string;
  OtroColegioDestino?: string | null;
  FechaEmisionTexto: string;
};

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

function getVistaActual(pathname: string): "menu" | "consultas" | "certificaciones" {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/consultas")) return "consultas";
  if (normalized.endsWith("/certificaciones")) return "certificaciones";
  return "menu";
}

const chooserButtonBase: React.CSSProperties = {
  textAlign: "left",
  borderRadius: 20,
  padding: 22,
  cursor: "pointer",
  color: "#0f172a"
};

const backButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer"
};

function getAlertStyle(alertaTemprana: string): React.CSSProperties {
  const value = String(alertaTemprana || "").trim().toUpperCase();
  if (value === "ALERTA") {
    return { background: "#fee2e2", color: "#991b1b", fontWeight: 800, borderRadius: 10, padding: "4px 8px", display: "inline-block" };
  }
  if (value === "POSIBLE ALERTA") {
    return { background: "#fef9c3", color: "#854d0e", fontWeight: 800, borderRadius: 10, padding: "4px 8px", display: "inline-block" };
  }
  return { background: "#dcfce7", color: "#166534", fontWeight: 800, borderRadius: 10, padding: "4px 8px", display: "inline-block" };
}

export default function ReportesPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [tipo, setTipo] = useState<TipoReporte>("ASISTENCIA");
  const [secciones, setSecciones] = useState<any[]>([]);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);

  const [vistaAsistencia, setVistaAsistencia] = useState<VistaAsistencia>("SECCION");
  const [grupoId, setGrupoId] = useState<string>("");
  const [estudianteId, setEstudianteId] = useState<string>("");
  const [profesorIdReporte, setProfesorIdReporte] = useState<string>("");
  const [busquedaAlumno, setBusquedaAlumno] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [filas, setFilas] = useState<any[]>([]);
  const [asistenciaRows, setAsistenciaRows] = useState<AsistenciaResumen[]>([]);
  const [boletasRows, setBoletasRows] = useState<BoletaReporteRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const [grupoIdConstancia, setGrupoIdConstancia] = useState<string>("");
  const [estudianteIdConstancia, setEstudianteIdConstancia] = useState<string>("");
  const [busquedaConstancia, setBusquedaConstancia] = useState<string>("");
  const [tipoEducacion, setTipoEducacion] = useState("GENERAL BASICA");
  const [motivoTramite, setMotivoTramite] = useState("IMAS");
  const [otroColegioDestino, setOtroColegioDestino] = useState("");
  const [fechaEmision, setFechaEmision] = useState(() => getCostaRicaIsoDate());
  const [motivoBusquedaCert, setMotivoBusquedaCert] = useState("");
  const [grupoIdBusquedaCert, setGrupoIdBusquedaCert] = useState<string>("");
  const [estudianteIdBusquedaCert, setEstudianteIdBusquedaCert] = useState<string>("");
  const [busquedaCertAlumno, setBusquedaCertAlumno] = useState("");
  const [certificacionesRows, setCertificacionesRows] = useState<CertificacionRow[]>([]);
  const [busquedaCertMinimizada, setBusquedaCertMinimizada] = useState(false);

  const [loading, setLoading] = useState(false);
  const [generandoConstancia, setGenerandoConstancia] = useState(false);

  const vistaActual = useMemo(() => getVistaActual(location.pathname), [location.pathname]);

  useEffect(() => {
    api.get("/reportes/gestion-filtros").then((r) => {
      const data = r.data?.data || {};
      setSecciones(Array.isArray(data.secciones) ? data.secciones : []);
      setAlumnos(Array.isArray(data.alumnos) ? data.alumnos : []);
      setProfesores(Array.isArray(data.profesores) ? data.profesores : []);
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

  const alumnosBusquedaCertFiltrados = useMemo(() => {
    let base = alumnos;
    if (grupoIdBusquedaCert) base = base.filter((a) => String(a.GrupoId) === String(grupoIdBusquedaCert));
    const q = busquedaCertAlumno.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const nombre = [a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ").toLowerCase();
      const cedula = String(a.Identificacion || "").toLowerCase();
      return nombre.includes(q) || cedula.includes(q);
    });
  }, [alumnos, grupoIdBusquedaCert, busquedaCertAlumno]);

  const profesoresFiltrados = useMemo(() => {
    return profesores.map((item) => ({
      ...item,
      nombreCompleto: [item.PrimerApellido, item.SegundoApellido, item.Nombre].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    }));
  }, [profesores]);

  async function consultar() {
    if (tipo === "ASISTENCIA" && vistaAsistencia === "ALUMNO") {
      const textoBusqueda = busquedaAlumno.trim();
      if (textoBusqueda && !alumnosFiltrados.length) {
        window.alert("El alumno indicado no existe.");
        return;
      }
      if (!estudianteId) {
        window.alert(textoBusqueda ? "Selecciona el alumno a buscar." : "Selecciona el alumno a buscar.");
        return;
      }
    }
    if (tipo === "ASISTENCIA" && vistaAsistencia === "SECCION" && !grupoId) {
      window.alert("Selecciona una sección para consultar el reporte.");
      return;
    }
    if (tipo === "ASISTENCIA" && vistaAsistencia === "PROFESOR" && !profesorIdReporte) {
      window.alert("Selecciona el profesor a consultar.");
      return;
    }
    if (tipo === "BOLETAS" && vistaAsistencia === "ALUMNO") {
      const textoBusqueda = busquedaAlumno.trim();
      if (textoBusqueda && !alumnosFiltrados.length) {
        window.alert("El alumno indicado no existe.");
        return;
      }
      if (!estudianteId) {
        window.alert("Selecciona el alumno a buscar.");
        return;
      }
    }
    if (tipo === "BOLETAS" && vistaAsistencia === "SECCION" && !grupoId) {
      window.alert("Selecciona una seccion para consultar el reporte.");
      return;
    }
    if (tipo === "BOLETAS" && vistaAsistencia === "PROFESOR" && !profesorIdReporte) {
      window.alert("Selecciona el profesor a consultar.");
      return;
    }

    setLoading(true);
    try {
      if (tipo === "ASISTENCIA") {
        const response = await api.get("/reportes/gestion-profe", {
          params: {
            tipo,
            vistaPor: vistaAsistencia,
            grupoId: grupoId || undefined,
            estudianteId: estudianteId || undefined,
            profesorId: profesorIdReporte || undefined,
            desde: desde || undefined,
            hasta: hasta || undefined
          }
        });
        const rows = Array.isArray(response.data?.data?.rows) ? response.data.data.rows : [];
        setAsistenciaRows(rows);
        setExpandedRows({});
        setFilas([]);
        setBoletasRows([]);
        return;
      }

      if (tipo === "BOLETAS") {
        const response = await api.get("/reportes/gestion-profe", {
          params: {
            tipo,
            vistaPor: vistaAsistencia,
            grupoId: grupoId || undefined,
            estudianteId: estudianteId || undefined,
            profesorId: profesorIdReporte || undefined,
            desde: desde || undefined,
            hasta: hasta || undefined
          }
        });
        const rows = Array.isArray(response.data?.data?.rows) ? response.data.data.rows : [];
        setBoletasRows(rows);
        setAsistenciaRows([]);
        setExpandedRows({});
        setFilas([]);
        return;
      }

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
      setAsistenciaRows([]);
      setBoletasRows([]);
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "No se pudo consultar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  function toggleAsistenciaDetalle(estudianteIdValue: number) {
    setExpandedRows((prev) => ({ ...prev, [estudianteIdValue]: !prev[estudianteIdValue] }));
  }

  async function generarConstancia() {
    if (!estudianteIdConstancia) {
      window.alert("Selecciona un alumno para generar la constancia.");
      return;
    }
    if (motivoTramite === "TRASLADO" && !otroColegioDestino.trim()) {
      window.alert("Indica el nombre del otro colegio para el trámite de traslado.");
      return;
    }

    const win = window.open("", "_blank");
    if (!win) {
      window.alert("No se pudo abrir la vista de impresión. Revisa el bloqueador de ventanas.");
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
        tipoEducacion,
        motivoTramite,
        otroColegioDestino: motivoTramite === "TRASLADO" ? otroColegioDestino.trim() : "",
        fechaEmision
      });
      const html = String(response.data?.data?.html || "");
      const codigo = String(response.data?.data?.codigoConstancia || "");
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        try {
          win.focus();
        } catch {}
      }, 250);
      await buscarCertificaciones();
      window.alert(`Constancia generada: ${codigo}`);
    } catch (error: any) {
      try { win.close(); } catch {}
      window.alert(error?.response?.data?.message || "No se pudo generar la constancia");
    } finally {
      setLoading(false);
      setGenerandoConstancia(false);
    }
  }

  async function buscarCertificaciones() {
    setLoading(true);
    try {
      const response = await api.get("/reportes/certificaciones/constancia-estudio/registros", {
        params: {
          motivoTramite: motivoBusquedaCert || undefined,
          grupoId: grupoIdBusquedaCert || undefined,
          estudianteId: estudianteIdBusquedaCert || undefined,
          q: busquedaCertAlumno.trim() || undefined
        }
      });
      setCertificacionesRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "No se pudieron buscar las certificaciones.");
    } finally {
      setLoading(false);
    }
  }

  async function abrirCertificacionWord(certificacionId: number, codigoConstancia?: string) {
    try {
      const response = await api.get(`/reportes/certificaciones/constancia-estudio/${certificacionId}/word`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/msword" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(codigoConstancia || `constancia-${certificacionId}`).trim() || `constancia-${certificacionId}`}.doc`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "No se pudo abrir la certificación en Word.");
    }
  }

  function exportarExcel() {
    if (tipo === "ASISTENCIA") {
      const headers = ["Alumno", "Identificación", "Sección", "Alerta Temprana", "Tardías", "Ausencias Justificadas", "Ausencias Injustificadas", "Presentes", "Cantidad de correos enviados", "Cantidad de WhatsApp enviados"];
      const rows = asistenciaRows.map((item) => [
        item.alumno,
        item.identificacion,
        item.seccion,
        item.alertaTemprana,
        item.tardias,
        item.ausenciasJustificadas,
        item.ausenciasInjustificadas,
        item.presentes,
        item.cantidadCorreosEnviados,
        item.cantidadWhatsAppEnviados
      ]);
      const thead = `<tr>${headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9">${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows.map((row) => `<tr>${row.map((c) => `<td style="border:1px solid #cbd5e1;padding:8px">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h3>Reporte general de asistencia</h3><table style="border-collapse:collapse">${thead}${tbody}</table></body></html>`;
      const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
      descargarBlob(blob, `reporte-general-asistencia-${vistaAsistencia}.xls`);
      return;
    }

    if (tipo === "BOLETAS") {
      const headers = ["N° de boleta", "Nombre", "Cédula", "Sección", "Fecha", "Envío correo", "Envío WhatsApp"];
      const rows = boletasRows.map((item) => [
        String(item.numeroBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(3, "0"),
        item.nombre,
        item.cedula,
        item.seccion,
        item.fecha,
        item.envioCorreo,
        item.envioWhatsApp
      ]);
      const thead = `<tr>${headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9">${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows.map((row) => `<tr>${row.map((c) => `<td style="border:1px solid #cbd5e1;padding:8px">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h3>Reporte de boletas</h3><table style="border-collapse:collapse">${thead}${tbody}</table></body></html>`;
      const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
      descargarBlob(blob, `reporte-boletas-${vistaAsistencia}.xls`);
      return;
    }

    const headers = Object.keys(filas[0] || {});
    const rows = filas.map((f) => headers.map((h) => f[h]));
    const thead = `<tr>${headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9">${escapeHtml(h)}</th>`).join("")}</tr>`;
    const tbody = rows.map((row) => `<tr>${row.map((c) => `<td style="border:1px solid #cbd5e1;padding:8px">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h3>Reporte ${escapeHtml(tipo)}</h3><table style="border-collapse:collapse">${thead}${tbody}</table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    descargarBlob(blob, `reporte-${tipo}.xls`);
  }

  function exportarPdf() {
    if (tipo === "ASISTENCIA") {
      const headers = ["Alumno", "Identificación", "Sección", "Alerta Temprana", "Tardías", "Ausencias Justificadas", "Ausencias Injustificadas", "Presentes", "Cantidad de correos enviados", "Cantidad de WhatsApp enviados"];
      const rows = asistenciaRows.map((item) => [
        item.alumno,
        item.identificacion,
        item.seccion,
        item.alertaTemprana,
        item.tardias,
        item.ausenciasJustificadas,
        item.ausenciasInjustificadas,
        item.presentes,
        item.cantidadCorreosEnviados,
        item.cantidadWhatsAppEnviados
      ]);
      const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Reporte general de asistencia</title><style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px}th{background:#f1f5f9}</style></head><body><h2>Reporte general de asistencia</h2><table>${thead}${tbody}</table><script>window.onload=function(){window.print();}</script></body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    if (tipo === "BOLETAS") {
      const headers = ["N° de boleta", "Nombre", "Cédula", "Sección", "Fecha", "Envío correo", "Envío WhatsApp"];
      const rows = boletasRows.map((item) => [
        String(item.numeroBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(3, "0"),
        item.nombre,
        item.cedula,
        item.seccion,
        item.fecha,
        item.envioCorreo,
        item.envioWhatsApp
      ]);
      const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const tbody = rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Reporte de boletas</title><style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px}th{background:#f1f5f9}</style></head><body><h2>Reporte de boletas</h2><table>${thead}${tbody}</table><script>window.onload=function(){window.print();}</script></body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

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
      {vistaActual === "menu" ? (
        <section className="card" style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            <h2 style={{ margin: 0 }}>Reportes y Certificaciones</h2>
            <p style={{ margin: 0, color: "#475569", maxWidth: 720 }}>
              Escogé qué querés hacer para trabajar cada área por separado, sin mezclar consultas con certificaciones en la misma pantalla.
            </p>
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <button
              type="button"
              onClick={() => navigate("/reportes/consultas")}
              style={{
                ...chooserButtonBase,
                border: "1px solid #93c5fd",
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)"
              }}
            >
              <strong style={{ display: "block", fontSize: 20, marginBottom: 8 }}>Consultas y Reportes</strong>
              <span style={{ display: "block", color: "#1e3a8a", lineHeight: 1.5 }}>
                Consultá información, filtrá resultados y exportá reportes en Excel o PDF.
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/reportes/certificaciones")}
              style={{
                ...chooserButtonBase,
                border: "1px solid #86efac",
                background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)"
              }}
            >
              <strong style={{ display: "block", fontSize: 20, marginBottom: 8 }}>Certificaciones</strong>
              <span style={{ display: "block", color: "#166534", lineHeight: 1.5 }}>
                Generá constancias y certificados desde una pantalla exclusiva para ese proceso.
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {vistaActual === "consultas" ? (
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ marginBottom: 6 }}>Consultas y Reportes</h3>
              <p style={{ margin: 0, color: "#475569" }}>Esta pantalla queda dedicada únicamente a consultas y exportación de reportes.</p>
            </div>
            <button type="button" onClick={() => navigate("/reportes")} style={backButtonStyle}>
               Cambiar opción
            </button>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
            <label>Tipo de reporte
              <select
                value={tipo}
                onChange={(e) => {
                  const nextTipo = e.target.value as TipoReporte;
                  setTipo(nextTipo);
                  setFilas([]);
                  setAsistenciaRows([]);
                  setBoletasRows([]);
                  setExpandedRows({});
                }}
              >
                <option value="ASISTENCIA">Reporte de Asistencia</option>
                <option value="BOLETAS">Reporte de Boletas</option>
              </select>
            </label>
            {tipo === "ASISTENCIA" || tipo === "BOLETAS" ? (
              <>
                <label>Ver reporte por
                  <select
                    value={vistaAsistencia}
                    onChange={(e) => {
                      const nextVista = e.target.value as VistaAsistencia;
                      setVistaAsistencia(nextVista);
                      setAsistenciaRows([]);
                      setExpandedRows({});
                      setGrupoId("");
                      setEstudianteId("");
                      setProfesorIdReporte("");
                    }}
                  >
                    <option value="ALUMNO">Alumno</option>
                    <option value="SECCION">Sección</option>
                    <option value="PROFESOR">Profesor</option>
                  </select>
                </label>
                {vistaAsistencia !== "PROFESOR" ? (
                  <label>Sección
                    <select value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setEstudianteId(""); }}>
                      <option value="">{vistaAsistencia === "ALUMNO" ? "Todas" : "Seleccione"}</option>
                      {secciones.map((s) => <option key={s.GrupoId} value={s.GrupoId}>{s.GrupoNombre}</option>)}
                    </select>
                  </label>
                ) : null}
                {vistaAsistencia === "ALUMNO" ? (
                  <label>Alumno
                    <input
                      type="text"
                      value={busquedaAlumno}
                      onChange={(e) => setBusquedaAlumno(e.target.value)}
                      placeholder="Buscar por nombre o cédula"
                      style={{ marginBottom: 6 }}
                    />
                    <select value={estudianteId} onChange={(e) => setEstudianteId(e.target.value)}>
                      <option value="">Seleccionar alumno</option>
                      {alumnosFiltrados.map((a) => (
                        <option key={a.EstudianteId} value={a.EstudianteId}>
                          {[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")}{a.Identificacion ? ` - ${a.Identificacion}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {vistaAsistencia === "PROFESOR" ? (
                  <label>Profesor
                    <select value={profesorIdReporte} onChange={(e) => setProfesorIdReporte(e.target.value)}>
                      <option value="">Seleccionar profesor</option>
                      {profesoresFiltrados.map((prof) => (
                        <option key={prof.ProfesorId} value={prof.ProfesorId}>
                          {prof.nombreCompleto || prof.Correo || `Profesor ${prof.ProfesorId}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : (
              <>
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
              </>
            )}
            <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
            <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button type="button" className="primary-btn" onClick={consultar} disabled={loading}>{loading ? "Consultando..." : "Consultar"}</button>
            <button type="button" className="primary-btn" onClick={exportarExcel} disabled={tipo === "ASISTENCIA" ? !asistenciaRows.length : (tipo === "BOLETAS" ? !boletasRows.length : !filas.length)}>Exportar Excel</button>
            <button type="button" className="primary-btn" onClick={exportarPdf} disabled={tipo === "ASISTENCIA" ? !asistenciaRows.length : (tipo === "BOLETAS" ? !boletasRows.length : !filas.length)}>Exportar PDF</button>
          </div>
          {tipo === "ASISTENCIA" ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                  {(vistaAsistencia === "ALUMNO" || vistaAsistencia === "SECCION") ? <th>Detalle</th> : null}
                    <th>Alumno</th>
                    <th>Identificación</th>
                    <th>Sección</th>
                    <th>Alerta Temprana</th>
                    <th>Tardías</th>
                    <th>Ausencias Justificadas</th>
                    <th>Ausencias Injustificadas</th>
                    <th>Presentes</th>
                    <th>Cantidad de correos enviados</th>
                    <th>Cantidad de WhatsApp enviados</th>
                  </tr>
                </thead>
                <tbody>
                  {!asistenciaRows.length ? (
                    <tr><td colSpan={(vistaAsistencia === "ALUMNO" || vistaAsistencia === "SECCION") ? 11 : 10} style={{ textAlign: "center", padding: "12px" }}>No hay datos. Elegi filtros y presiona Consultar.</td></tr>
                  ) : asistenciaRows.map((fila) => (
                    <Fragment key={`asis-wrap-${fila.estudianteId}`}>
                      <tr key={`asis-${fila.estudianteId}`}>
                        {(vistaAsistencia === "ALUMNO" || vistaAsistencia === "SECCION") ? (
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => toggleAsistenciaDetalle(fila.estudianteId)}
                              style={{ borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", padding: "6px 10px", cursor: "pointer" }}
                            >
                              {expandedRows[fila.estudianteId] ? "Ocultar" : "Ver detalle"}
                            </button>
                          </td>
                        ) : null}
                        <td>{fila.alumno}</td>
                        <td>{fila.identificacion}</td>
                        <td>{fila.seccion}</td>
                        <td><span style={getAlertStyle(fila.alertaTemprana)}>{fila.alertaTemprana}</span></td>
                        <td style={{ textAlign: "center" }}>{fila.tardias}</td>
                        <td style={{ textAlign: "center" }}>{fila.ausenciasJustificadas}</td>
                        <td style={{ textAlign: "center" }}>{fila.ausenciasInjustificadas}</td>
                        <td style={{ textAlign: "center" }}>{fila.presentes}</td>
                        <td style={{ textAlign: "center" }}>{fila.cantidadCorreosEnviados}</td>
                        <td style={{ textAlign: "center" }}>{fila.cantidadWhatsAppEnviados}</td>
                      </tr>
                      {(vistaAsistencia === "ALUMNO" || vistaAsistencia === "SECCION") && expandedRows[fila.estudianteId] ? (
                        <tr key={`asis-det-${fila.estudianteId}`}>
                          <td colSpan={(vistaAsistencia === "ALUMNO" || vistaAsistencia === "SECCION") ? 11 : 10} style={{ background: "#0f172a", padding: "14px", borderTop: "1px solid #334155" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", background: "#111827", color: "#e5eefb", border: "1px solid #334155", borderRadius: 14, overflow: "hidden" }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Materia</th>
                                  <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Profesor</th>
                                  <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Alerta Temprana</th>
                                   <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Tardías</th>
                                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Ausencias Justificadas</th>
                                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Ausencias Injustificadas</th>
                                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Presentes</th>
                                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Cantidad de correos enviados</th>
                                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #334155", background: "#132236", color: "#e2e8f0" }}>Cantidad de WhatsApp enviados</th>
                                </tr>
                              </thead>
                              <tbody>
                                {!fila.detalle.length ? (
                                  <tr>
                                    <td colSpan={9} style={{ textAlign: "center", padding: "12px", color: "#cbd5e1", background: "#111827" }}>No hay materias para mostrar.</td>
                                  </tr>
                                ) : fila.detalle.map((detalle) => (
                                  <tr key={`${fila.estudianteId}-${detalle.materiaId}`}>
                                    <td style={{ padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.materia}</td>
                                    <td style={{ padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.profesor}</td>
                                    <td style={{ padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}><span style={getAlertStyle(detalle.alertaTemprana)}>{detalle.alertaTemprana}</span></td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.tardias}</td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.ausenciasJustificadas}</td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.ausenciasInjustificadas}</td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.presentes}</td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.cantidadCorreosEnviados}</td>
                                    <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #1f2937", color: "#e5eefb", background: "#111827" }}>{detalle.cantidadWhatsAppEnviados}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tipo === "BOLETAS" ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>N° de boleta</th>
                    <th>Nombre</th>
                    <th>Cédula</th>
                    <th>Sección</th>
                    <th>Fecha</th>
                    <th>Envío correo</th>
                    <th>Envío de WhatsApp</th>
                    <th>Reimprimir</th>
                  </tr>
                </thead>
                <tbody>
                  {!boletasRows.length ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>No hay boletas para mostrar con esos filtros.</td></tr>
                  ) : boletasRows.map((fila) => (
                    <tr key={fila.boletaConductaId}>
                      <td>{fila.numeroBoleta}</td>
                      <td>{fila.nombre}</td>
                      <td>{fila.cedula}</td>
                      <td>{fila.seccion}</td>
                      <td>{fila.fecha}</td>
                      <td style={{ textAlign: "center" }}>{fila.envioCorreo}</td>
                      <td style={{ textAlign: "center" }}>{fila.envioWhatsApp}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="primary-btn"
                          style={{ padding: "6px 10px" }}
                          onClick={() => window.open(`/boletas/conducta/${fila.boletaConductaId}?modo=reimprimir`, "_blank", "noopener,noreferrer")}
                        >
                          Reimprimir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
          )}
        </section>
      ) : null}

      {vistaActual === "certificaciones" ? (
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ marginBottom: 6 }}>Certificaciones</h3>
              <p style={{ margin: 0, color: "#475569" }}>Esta pantalla queda dedicada únicamente a la generación de certificaciones.</p>
            </div>
            <button type="button" onClick={() => navigate("/reportes")} style={backButtonStyle}>
               Cambiar opción
            </button>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
            <label>{"Sección"}
              <select value={grupoIdConstancia} onChange={(e) => { setGrupoIdConstancia(e.target.value); setEstudianteIdConstancia(""); }}>
                <option value="">Todas</option>
                {secciones.map((s) => <option key={s.GrupoId} value={s.GrupoId}>{s.GrupoNombre}</option>)}
              </select>
            </label>
            <label>{"Alumno (nombre o cédula)"}
              <input
                type="text"
                value={busquedaConstancia}
                onChange={(e) => setBusquedaConstancia(e.target.value)}
                placeholder={"Buscar por nombre o cédula"}
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
            <label>{"Tipo de educación"}
              <select value={tipoEducacion} onChange={(e) => setTipoEducacion(e.target.value)}>
                <option value="GENERAL BASICA">{"General Básica"}</option>
                <option value="DIVERSIFICADA">Diversificada</option>
                <option value="ESPECIAL">Especial</option>
              </select>
            </label>
            <label>{"Trámite"}
              <select
                value={motivoTramite}
                onChange={(e) => {
                  const value = e.target.value;
                  setMotivoTramite(value);
                  if (value !== "TRASLADO") setOtroColegioDestino("");
                }}
              >
                <option value="IMAS">{"Trámite ante el IMAS"}</option>
                <option value="CCSS">{"Trámite ante la CCSS"}</option>
                <option value="PODER_JUDICIAL">{"Trámite ante el Poder Judicial"}</option>
                <option value="PERSONAL">Personal</option>
                <option value="TRASLADO">Traslado a otro colegio</option>
              </select>
            </label>
            {motivoTramite === "TRASLADO" ? (
              <label>Nombre del otro colegio
                <input
                  value={otroColegioDestino}
                  onChange={(e) => setOtroColegioDestino(e.target.value)}
                  placeholder="Colegio destino"
                />
              </label>
            ) : null}
            <label>{"Fecha de emisión"}
              <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary-btn" onClick={generarConstancia} disabled={loading || !estudianteIdConstancia}>
              {loading ? "Generando..." : "Generar Constancia"}
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
          <div style={{ marginTop: 22, borderTop: "1px solid #cbd5e1", paddingTop: 16 }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <h4 style={{ margin: "0 0 6px" }}>{"Búsqueda de certificaciones"}</h4>
                <p style={{ margin: 0, color: "#475569" }}>Filtra constancias generadas y reimprimilas cuando haga falta.</p>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setBusquedaCertMinimizada((prev) => !prev)}
              >
                {busquedaCertMinimizada ? "Mostrar" : "Minimizar"}
              </button>
            </div>
            {!busquedaCertMinimizada ? (
              <>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
               <label>{"Tipo de certificación"}
                <select value={motivoBusquedaCert} onChange={(e) => setMotivoBusquedaCert(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="IMAS">{"Trámite ante el IMAS"}</option>
                  <option value="CCSS">{"Trámite ante la CCSS"}</option>
                  <option value="PODER_JUDICIAL">{"Trámite ante el Poder Judicial"}</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="TRASLADO">Traslado</option>
                </select>
              </label>
               <label>{"Sección"}
                <select value={grupoIdBusquedaCert} onChange={(e) => { setGrupoIdBusquedaCert(e.target.value); setEstudianteIdBusquedaCert(""); }}>
                  <option value="">Todas</option>
                  {secciones.map((s) => <option key={s.GrupoId} value={s.GrupoId}>{s.GrupoNombre}</option>)}
                </select>
              </label>
              <label>Buscar alumno
                <input
                  type="text"
                  value={busquedaCertAlumno}
                  onChange={(e) => setBusquedaCertAlumno(e.target.value)}
                  placeholder={"Nombre o cédula"}
                />
              </label>
              <label>Alumno
                <select value={estudianteIdBusquedaCert} onChange={(e) => setEstudianteIdBusquedaCert(e.target.value)}>
                  <option value="">Todos</option>
                  {alumnosBusquedaCertFiltrados.map((a) => (
                    <option key={a.EstudianteId} value={a.EstudianteId}>
                      {[a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ")}{a.Identificacion ? ` - ${a.Identificacion}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button type="button" className="primary-btn" onClick={buscarCertificaciones} disabled={loading}>
                {loading ? "Buscando..." : "Buscar certificaciones"}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setMotivoBusquedaCert("");
                  setGrupoIdBusquedaCert("");
                  setEstudianteIdBusquedaCert("");
                  setBusquedaCertAlumno("");
                  setCertificacionesRows([]);
                }}
              >
                Limpiar
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{"Código"}</th>
                    <th>Fecha</th>
                    <th>Alumno</th>
                    <th>{"Cédula"}</th>
                    <th>{"Sección"}</th>
                    <th>Tipo</th>
                    <th>Curso lectivo</th>
                    <th>Destino</th>
                    <th>{"Acción"}</th>
                  </tr>
                </thead>
                <tbody>
                  {!certificacionesRows.length ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: "12px" }}>
                        No hay certificaciones cargadas con esos filtros.
                      </td>
                    </tr>
                  ) : certificacionesRows.map((row) => (
                    <tr key={row.CertificacionEstudioId}>
                      <td>{row.CodigoConstancia || `CONST-${String(row.Consecutivo || "").padStart(4, "0")}`}</td>
                      <td>{row.FechaEmisionTexto || "-"}</td>
                      <td>{row.EstudianteNombre || "-"}</td>
                      <td>{row.Identificacion || "-"}</td>
                      <td>{row.GrupoNombre || "-"}</td>
                      <td>{row.MotivoTramite || "-"}</td>
                      <td>{row.CursoLectivo || "-"}</td>
                      <td>{row.OtroColegioDestino || "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => abrirCertificacionWord(row.CertificacionEstudioId, row.CodigoConstancia)}
                          >
                            Abrir Word
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
