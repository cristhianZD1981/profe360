import { useEffect, useRef, useState } from "react";
import api from "../lib/http";
import "./ComunicadosPanel.css";

type Grupo = { GrupoId: number; MateriaId: number; AnioLectivoId: number; PeriodoId: number; GrupoClaseId?: number | null; GrupoNombre?: string };
const fullName = (a: any) => [a.PrimerApellido, a.SegundoApellido, a.Nombre].filter(Boolean).join(" ");

export default function ComunicadosPanel({ grupo }: { grupo: Grupo }) {
  const formulario = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<any>(null);
  const [alumnoId, setAlumnoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [solicitudId, setSolicitudId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [incierto, setIncierto] = useState(false);
  useEffect(() => {
    if (solicitudId && alumnoId) formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [solicitudId, alumnoId]);
  const ruta = `/gestion-profe/mis-grupos/${grupo.GrupoId}/materias/${grupo.MateriaId}/comunicados`;
  const params = { anioLectivoId: grupo.AnioLectivoId, periodoId: grupo.PeriodoId, grupoClaseId: grupo.GrupoClaseId || undefined };
  async function cargar() {
    setLoading(true); setError("");
    try { const r = await api.get(ruta, { params }); setData(r.data.data); return r.data.data; }
    catch (e: any) { setError(e.response?.data?.message || "No se pudieron cargar los comunicados"); return null; }
    finally { setLoading(false); }
  }
  useEffect(() => { void cargar(); }, [grupo.GrupoId, grupo.MateriaId, grupo.AnioLectivoId, grupo.PeriodoId, grupo.GrupoClaseId]);
  async function abrir(id: number) {
    const actual = await cargar(); if (!actual) return;
    setAlumnoId(id); setMensaje("");
    setSolicitudId(crypto.randomUUID()); setInfo(""); setIncierto(false);
  }
  async function enviar() {
    if (sending || !alumnoId || !mensaje.trim()) return;
    setSending(true); setError(""); setInfo("");
    try {
      const r = await api.post(ruta, { ...params, estudianteId: alumnoId, mensaje: mensaje.trim(), solicitudId });
      setInfo(r.data.message); setAlumnoId(null); setMensaje(""); setIncierto(false);
      await cargar();
    } catch (e: any) {
      setError(e.response?.data?.message || "No se confirmó el resultado. Actualizá el historial antes de intentar un nuevo comunicado.");
      setIncierto(!e.response || e.response.status >= 500);
    } finally { setSending(false); }
  }
  const alumnos = (data?.alumnos || []).filter((a: any) => `${fullName(a)} ${a.Identificacion}`.toLowerCase().includes(busqueda.toLowerCase()));
  const alumno = data?.alumnos.find((a: any) => a.EstudianteId === alumnoId);
  return <section className="comunicados-panel" style={{ padding: 16, background: "#fff", color: "#0f172a", borderRadius: 12, display: "grid", gap: 12 }}>
    <h3>Comunicados{grupo.GrupoNombre ? ` — ${grupo.GrupoNombre}` : ""}</h3>
    {data ? <strong>Lista de la clase: {data.alumnos.length} alumnos</strong> : null}
    <p>WhatsApp al encargado si el alumno es menor de 18 años, o al alumno si es mayor de edad, con teléfono y autorización activos. Los correos se envían a los encargados con copia al profesor.</p>
    <div style={{ display: "flex", gap: 8 }}><input placeholder="Buscar alumno por nombre o identificación" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /><button type="button" onClick={() => void cargar()} disabled={loading || sending}>{loading ? "Cargando…" : "Actualizar historial"}</button></div>
    {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
    {info ? <p role="status">{info}</p> : null}
    {alumno ? <div ref={formulario} style={{ scrollMarginTop: 80, padding: 14, border: "1px solid #93c5fd", background: "#eff6ff", display: "grid", gap: 10 }}>
      <h4>Comunicado sobre {fullName(alumno)}</h4>
      <p>Fecha: {data.fecha} · Hora: {data.hora} · Materia: {data.materia}<br />Profesor: {data.profesor} · Institución: {data.institucion}<br />Copia a: {data.correoProfesor || "Sin correo registrado"}</p>
      <label>Mensaje<textarea rows={6} maxLength={800} disabled={sending || incierto} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escribí el comunicado…" /></label>
      <small>{mensaje.length}/800 caracteres</small>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="primary-btn" onClick={() => void enviar()} disabled={sending || !mensaje.trim() || !data.correoProfesor}>{sending ? "Procesando envíos…" : incierto ? "Verificar solicitud sin duplicar envío" : "Enviar por WhatsApp y correo"}</button>
        <button type="button" disabled={sending} onClick={() => setAlumnoId(null)}>Cerrar</button>
      </div>
    </div> : null}
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th>Alumno</th><th>Identificación</th><th>Comunicados registrados</th><th>Acción</th></tr></thead>
      <tbody>{alumnos.map((a: any) => {
        const historial = (data.historial || []).filter((h: any) => h.EstudianteId === a.EstudianteId);
        return <tr key={a.EstudianteId}>
          <td>{fullName(a)}</td><td>{a.Identificacion}</td>
          <td>{!historial.length ? "Sin comunicados" : <details><summary style={{ cursor: "pointer" }}>{historial.length} comunicado(s) · Ver mensajes y resultados</summary>
            {historial.map((h: any) => <article key={h.ComunicadoId} style={{ padding: 10, margin: "8px 0", border: "1px solid #cbd5e1" }}>
              <strong>{h.contexto.fecha} {h.contexto.hora} · {h.contexto.profesor}</strong>
              <div>{h.contexto.materia} · {h.contexto.leccion} · {h.Estado}</div>
              <p style={{ whiteSpace: "pre-wrap" }}>{h.Mensaje}</p>
              {h.destinos.map((d: any, i: number) => <div key={i}>{d.Canal} · {d.EncargadoNombre} · {d.Destino || "Sin contacto"}: <strong>{d.Estado}</strong>{d.Motivo ? ` — ${d.Motivo}` : ""}{d.CopiaProfesor ? ` · Copia: ${d.CopiaProfesor}` : ""}</div>)}
            </article>)}
          </details>}</td>
          <td><button type="button" onClick={() => void abrir(a.EstudianteId)} disabled={sending || loading}>Enviar comunicado</button></td>
        </tr>;
      })}{!loading && !error && !alumnos.length ? <tr><td colSpan={4}>{busqueda ? "No hay alumnos que coincidan con la búsqueda." : "No hay alumnos matriculados en esta clase."}</td></tr> : null}</tbody>
    </table></div>
    <small>Aceptado significa que el proveedor aceptó el envío; no confirma entrega ni lectura.</small>
  </section>;
}
