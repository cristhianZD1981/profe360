import { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/http";

type Institution = {
  InstitucionId: number;
  Nombre: string;
  NombreComercial?: string | null;
  Activo?: boolean;
  WhatsAppModo?: Mode;
  WhatsAppEstado?: string | null;
  WhatsAppNumero?: string | null;
  WhatsAppTipoCanal?: string | null;
};
type Mode = "NO_CONFIGURADO" | "GENERICA" | "PROPIO_API" | "PROPIO_QR";
type Template = { tipoMensaje: string; nombre: string; templateUuid: string; cantidadParametrosBody: number; estado: string };
type AvailableTemplate = { uuid: string; name: string; status: string; category: string; language: string; templateContent: string };
type WabaChannel = {
  uuid: string;
  phoneNumber: string;
  friendlyName?: string | null;
  verifiedName?: string | null;
  connectionStatus?: string;
  connected: boolean;
  enabled: boolean;
  messagingProvider?: string | null;
  assignedInstitutionId?: number | null;
  assignedInstitutionName?: string | null;
};

const templateTypes = ["ASISTENCIA", "TAREA", "PROYECTO", "COTIDIANO", "EXAMENES", "BOLETA", "GENERAL"];
const emptyTemplates = (): Template[] => templateTypes.map((tipoMensaje) => ({ tipoMensaje, nombre: "", templateUuid: "", cantidadParametrosBody: 0, estado: "PENDIENTE" }));

function dataOf(response: any) { return response?.data?.data ?? response?.data ?? {}; }
function normalizePhone(value: string) { return value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""); }
function channelTypeLabel(item: Institution) {
  const type = String(item.WhatsAppTipoCanal || "").toUpperCase();
  const typeLabel = type === "WHATSAPP_WEB" ? "QR" : type === "WABA" ? "API" : type || "-";
  return item.WhatsAppModo === "GENERICA" ? `Genérico${typeLabel !== "-" ? ` · ${typeLabel}` : ""}` : typeLabel;
}
function isConnected(item: Institution) { return String(item.WhatsAppEstado || "").toUpperCase() === "CONECTADO"; }

export default function WhatsAppInstitutionManager() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("NO_CONFIGURADO");
  const [configuredMode, setConfiguredMode] = useState<Mode>("NO_CONFIGURADO");
  const [isProfe360, setIsProfe360] = useState(false);
  const [channelConfigured, setChannelConfigured] = useState(false);
  const [channelType, setChannelType] = useState("");
  const [connected, setConnected] = useState(false);
  const [effectiveStatus, setEffectiveStatus] = useState("SIN CONFIGURAR");
  const [effectiveNumber, setEffectiveNumber] = useState("");
  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [active, setActive] = useState(true);
  const [templates, setTemplates] = useState<Template[]>(emptyTemplates);
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplate[]>([]);
  const [qrUrl, setQrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [wabaChannels, setWabaChannels] = useState<WabaChannel[]>([]);
  const [selectedWabaUuid, setSelectedWabaUuid] = useState("");
  const [wabaOnboardingUrl, setWabaOnboardingUrl] = useState("https://app.2chat.io/");
  const progressTimer = useRef<number | null>(null);

  const selected = institutions.find((item) => item.InstitucionId === selectedId) || null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? institutions.filter((item) => (item.Nombre + " " + (item.NombreComercial || "")).toLowerCase().includes(term)) : institutions;
  }, [institutions, search]);

  const progressText = mode === "PROPIO_API"
    ? progress >= 100 ? "Canal WABA verificado correctamente"
      : progress >= 75 ? "Validando el número con 2Chat"
      : progress >= 40 ? "Consultando canales WABA"
      : progress > 0 ? "Validando configuración WABA" : ""
    : progress >= 100 ? "Conexión verificada correctamente"
      : progress >= 90 ? "Esperando lectura y verificando el código QR"
      : progress >= 70 ? "Generando código QR"
      : progress >= 45 ? "Iniciando conexión en 2Chat"
      : progress >= 20 ? "Consultando el canal"
      : progress > 0 ? "Validando configuración"
      : "";

  function updateInstitutionSummary(id: number, values: Partial<Institution>) {
    setInstitutions((items) => items.map((item) => item.InstitucionId === id ? { ...item, ...values } : item));
  }

  function stopProgress() {
    if (progressTimer.current !== null) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
  }

  function startProgress() {
    stopProgress();
    setProgress(8);
    progressTimer.current = window.setInterval(() => {
      setProgress((current) => Math.min(86, current + 4));
    }, 350);
  }

  async function loadInstitutions() {
    const response = await api.get("/reportes/admin/whatsapp/filtros");
    const values = dataOf(response);
    const list = Array.isArray(values.instituciones) ? values.instituciones : [];
    setInstitutions(list);
  }

  async function loadChannel(id: number) {
    setLoading(true); setError(""); setMessage(""); setQrUrl(""); setProgress(0);
    try {
      const response = await api.get("/instituciones/" + id + "/whatsapp");
      const data = dataOf(response);
      const channel = data.canal;
      const effectiveChannel = data.canalEfectivo || channel;
      const effectiveMode: Mode = data.modo || "NO_CONFIGURADO";
      setChannelConfigured(Boolean(channel?.Activo && channel?.CanalExternoId));
      setChannelType(channel?.TipoCanal || "");
      setConnected(effectiveChannel?.Estado === "CONECTADO");
      setEffectiveStatus(effectiveChannel?.Estado || "SIN CONFIGURAR");
      setEffectiveNumber(effectiveChannel?.NumeroOrigen || "");
      setMode(effectiveMode);
      setConfiguredMode(effectiveMode);
      setIsProfe360(Boolean(data.esProfe360));
      setNumber(channel?.NumeroOrigen || "");
      setDisplayName(channel?.NombreVisible || "");
      setSelectedWabaUuid(channel?.TipoCanal === "WABA" ? channel?.CanalExternoId || "" : "");
      setActive(channel?.Activo !== false);
      updateInstitutionSummary(id, {
        WhatsAppModo: effectiveMode,
        WhatsAppEstado: effectiveChannel?.Estado || "DESCONECTADO",
        WhatsAppNumero: effectiveChannel?.NumeroOrigen || null,
        WhatsAppTipoCanal: effectiveChannel?.TipoCanal || null
      });
      if (effectiveChannel?.TipoCanal === "WHATSAPP_WEB" && effectiveChannel?.CanalExternoId) {
        const statusResponse = await api.get("/instituciones/" + effectiveChannel.InstitucionId + "/whatsapp/qr/estado");
        const isConnected = Boolean(dataOf(statusResponse).connected);
        setConnected(isConnected);
        setEffectiveStatus(isConnected ? "CONECTADO" : "DESCONECTADO");
        updateInstitutionSummary(id, { WhatsAppEstado: isConnected ? "CONECTADO" : "DESCONECTADO" });
      }
      if (effectiveMode === "PROPIO_API" && channel?.TipoCanal === "WABA" && channel?.CanalExternoId) {
        try {
          const statusResponse = await api.get("/instituciones/" + id + "/whatsapp/waba/estado");
          const statusData = dataOf(statusResponse);
          setConnected(Boolean(statusData.connected && statusData.enabled));
          setEffectiveStatus(statusData.estado || (statusData.connected ? "CONECTADO" : "PENDIENTE"));
          setEffectiveNumber(statusData.phoneNumber || channel.NumeroOrigen || "");
          updateInstitutionSummary(id, {
            WhatsAppEstado: statusData.connected && statusData.enabled ? "CONECTADO" : "DESCONECTADO",
            WhatsAppNumero: statusData.phoneNumber || channel.NumeroOrigen || null
          });
        } catch (statusError) {
          console.error("No se pudo actualizar el estado WABA:", statusError);
        }
      }
      const saved = Array.isArray(data.plantillas) ? data.plantillas : [];
      setTemplates(emptyTemplates().map((item) => {
        const match = saved.find((value: any) => value.TipoMensaje === item.tipoMensaje || (item.tipoMensaje === "COTIDIANO" && value.TipoMensaje === "EVALUACION"));
        return match ? { ...item, nombre: match.Nombre || "", templateUuid: match.TemplateUuid || "", cantidadParametrosBody: Number(match.CantidadParametrosBody || 0), estado: match.Estado || "PENDIENTE" } : item;
      }));
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cargar el canal de la institución.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadInstitutions(); return stopProgress; }, []);
  useEffect(() => { if (selectedId) void loadChannel(selectedId); }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !qrUrl || connected) return;
    let cancelled = false;
    const verify = async () => {
      try {
        const response = await api.get("/instituciones/" + selectedId + "/whatsapp/qr/estado");
        if (!cancelled && dataOf(response).connected) {
          stopProgress();
          setProgress(100);
          setConnected(true);
          setEffectiveStatus("CONECTADO");
          setQrUrl("");
          updateInstitutionSummary(selectedId, { WhatsAppEstado: "CONECTADO" });
          setMessage("WhatsApp conectado y verificado correctamente.");
        }
      } catch (err) {
        console.error("Verificación QR pendiente:", err);
      }
    };
    const timer = window.setInterval(() => void verify(), 3000);
    void verify();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedId, qrUrl, connected]);

  async function saveMode() {
    if (!selectedId) return;
    setLoading(true); setError(""); setMessage("");
    try {
      if (mode === "GENERICA" || mode === "NO_CONFIGURADO") {
        await api.put("/instituciones/" + selectedId + "/whatsapp/mode", { modo: mode });
        setChannelConfigured(false); setQrUrl("");
        await loadChannel(selectedId);
        setMessage(mode === "GENERICA" ? "La institución utilizará el número genérico de Profe360." : "La institución quedó sin conexión de WhatsApp seleccionada.");
      } else if (mode === "PROPIO_API") {
        if (!/^\+\d{8,15}$/.test(number)) throw new Error("Ingresá el número en formato internacional, por ejemplo +50686103791.");
        await api.put("/instituciones/" + selectedId + "/whatsapp", { numeroOrigen: number, nombreVisible: displayName || null, activo: active });
        setMessage("Canal API guardado correctamente.");
        await loadChannel(selectedId);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "No se pudo guardar la configuración.");
    } finally { setLoading(false); }
  }

  async function detachFromGeneric() {
    if (!selectedId) return;
    setLoading(true); setError(""); setMessage("");
    try {
      await api.put("/instituciones/" + selectedId + "/whatsapp/mode", { modo: "NO_CONFIGURADO" });
      await loadChannel(selectedId);
      setMessage("La institución dejó de utilizar el canal genérico. La sesión de Profe360 permanece conectada.");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo desvincular la institución del canal genérico.");
    } finally { setLoading(false); }
  }

  async function connectQr() {
    if (!selectedId) return;
    setLoading(true); setError(""); setMessage(""); startProgress();
    try {
      let response;
      const hasQrChannel = channelConfigured && channelType === "WHATSAPP_WEB";
      if (!hasQrChannel) {
        if (!/^\+\d{8,15}$/.test(number)) throw new Error("Ingresá el número en formato internacional, por ejemplo +50686103791.");
        response = await api.post("/instituciones/" + selectedId + "/whatsapp/qr/crear", { numeroOrigen: number, nombreVisible: displayName || ("WhatsApp " + selected?.Nombre) });
        setChannelConfigured(true);
        setChannelType("WHATSAPP_WEB");
        setConfiguredMode("PROPIO_QR");
      } else {
        response = await api.post("/instituciones/" + selectedId + "/whatsapp/qr/conectar");
      }
      const data = dataOf(response);
      if (data.connected) {
        stopProgress(); setProgress(100); setConnected(true); setQrUrl("");
        setMessage("WhatsApp conectado y verificado correctamente.");
        setEffectiveStatus("CONECTADO");
        updateInstitutionSummary(selectedId, { WhatsAppModo: "PROPIO_QR", WhatsAppEstado: "CONECTADO", WhatsAppNumero: number || null, WhatsAppTipoCanal: "WHATSAPP_WEB" });
      } else if (data.sourceNumberNotFound) {
        stopProgress(); setProgress(0); setConnected(false); setQrUrl("");
        setEffectiveStatus("DESCONECTADO");
        setMessage(data.warning || "El número ya no existe en 2Chat. Usá Agregar/cambiar número para registrar otro.");
        updateInstitutionSummary(selectedId, { WhatsAppEstado: "DESCONECTADO" });
      } else if (data.qrCodeImageUrl) {
        stopProgress(); setProgress(90); setQrUrl(data.qrCodeImageUrl);
        setEffectiveStatus("ESPERANDO ESCANEO");
        setMessage("Escaneá el QR. Profe360 verificará automáticamente la conexión.");
      } else {
        stopProgress(); setProgress(80);
        setEffectiveStatus("CONECTANDO");
        setMessage(data.warning || response.data?.message || "2Chat está preparando el QR. Volvé a presionar Conectar WA.");
      }
    } catch (err: any) {
      stopProgress(); setProgress(0);
      setError(err?.response?.data?.message || err?.message || "No se pudo conectar WhatsApp.");
    } finally { setLoading(false); }
  }

  function openWabaOnboarding() {
    window.open(wabaOnboardingUrl || "https://app.2chat.io/", "_blank", "noopener,noreferrer");
    setMessage("Completá la conexión con Meta dentro de 2Chat. Luego regresá y presioná Buscar canales WABA.");
  }

  async function discoverWabaChannels() {
    setLoading(true); setError(""); setMessage(""); startProgress();
    try {
      const response = await api.get("/instituciones/whatsapp/waba/canales");
      const data = dataOf(response);
      const channels = Array.isArray(data.channels) ? data.channels : [];
      stopProgress(); setProgress(channels.length ? 70 : 0);
      setWabaChannels(channels);
      setWabaOnboardingUrl(data.onboardingUrl || "https://app.2chat.io/");
      if (channels.length === 1 && (!channels[0].assignedInstitutionId || channels[0].assignedInstitutionId === selectedId)) {
        setSelectedWabaUuid(channels[0].uuid);
      }
      setMessage(channels.length ? `Se encontraron ${channels.length} canal(es) WABA en 2Chat.` : "No se encontraron canales WABA. Completá primero la conexión con Meta en 2Chat.");
    } catch (err: any) {
      stopProgress(); setProgress(0);
      setError(err?.response?.data?.message || "No se pudieron consultar los canales WABA de 2Chat.");
    } finally { setLoading(false); }
  }

  async function bindWabaChannel() {
    if (!selectedId || !selectedWabaUuid) { setError("Seleccioná un número WABA de la lista."); return; }
    const selectedWaba = wabaChannels.find((item) => item.uuid === selectedWabaUuid);
    if (!selectedWaba) { setError("El canal seleccionado ya no está disponible. Volvé a buscar los canales."); return; }
    if (selectedWaba.assignedInstitutionId && selectedWaba.assignedInstitutionId !== selectedId) {
      setError(`Este número ya está vinculado a ${selectedWaba.assignedInstitutionName || "otra institución"}.`); return;
    }
    const confirmed = window.confirm(`¿Vincular ${selectedWaba.phoneNumber} a ${selected?.Nombre}? La configuración actual solo cambiará después de verificar la conexión.`);
    if (!confirmed) return;
    setLoading(true); setError(""); setMessage(""); startProgress();
    try {
      await api.post("/instituciones/" + selectedId + "/whatsapp/waba/vincular", { wabaUuid: selectedWabaUuid });
      stopProgress();
      await loadChannel(selectedId);
      setProgress(100); setConnected(true); setEffectiveStatus("CONECTADO"); setConfiguredMode("PROPIO_API");
      setMessage("Canal WABA vinculado, conectado y verificado correctamente.");
    } catch (err: any) {
      stopProgress(); setProgress(0);
      setError(err?.response?.data?.message || "No se pudo vincular el canal WABA.");
    } finally { setLoading(false); }
  }

  async function disconnectQr() {
    if (!selectedId) return;
    setLoading(true); setError(""); setMessage(""); startProgress();
    try {
      const response = await api.post("/instituciones/" + selectedId + "/whatsapp/qr/desconectar");
      stopProgress(); setProgress(0); setConnected(false); setQrUrl("");
      setEffectiveStatus("DESCONECTADO");
      updateInstitutionSummary(selectedId, { WhatsAppEstado: "DESCONECTADO" });
      setMessage(response.data?.message || "WhatsApp desconectado correctamente.");
    } catch (err: any) {
      stopProgress(); setProgress(0);
      setError(err?.response?.data?.message || "No se pudo desconectar WhatsApp.");
    } finally { setLoading(false); }
  }

  async function saveTemplates() {
    if (!selectedId) return;
    const configured = templates.filter((item) => item.nombre.trim() && item.templateUuid.trim());
    if (!configured.length) { setError("Ingresá al menos una plantilla con nombre y UUID."); return; }
    setLoading(true); setError("");
    try {
      const endpoint = isProfe360
        ? "/instituciones/whatsapp/fallback/plantillas"
        : "/instituciones/" + selectedId + "/whatsapp/plantillas";
      await api.put(endpoint, { plantillas: configured });
      setMessage("Plantillas guardadas correctamente.");
    } catch (err: any) { setError(err?.response?.data?.message || "No se pudieron guardar las plantillas."); }
    finally { setLoading(false); }
  }

  async function loadAvailableTemplates() {
    if (!selectedId) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const endpoint = isProfe360
        ? "/instituciones/whatsapp/fallback/plantillas-disponibles"
        : `/instituciones/${selectedId}/whatsapp/plantillas-disponibles`;
      const response = await api.get(endpoint);
      setAvailableTemplates(response.data?.data?.plantillas || []);
      setMessage("Plantillas cargadas desde 2Chat.");
    } catch (err: any) { setError(err?.response?.data?.message || "No se pudieron consultar las plantillas en 2Chat."); }
    finally { setLoading(false); }
  }

  function assignAvailableTemplate(tipoMensaje: string, uuid: string) {
    const selectedTemplate = availableTemplates.find((item) => item.uuid === uuid);
    if (!selectedTemplate) return;
    const indexes = [...selectedTemplate.templateContent.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    const cantidad = indexes.length ? new Set(indexes).size : 0;
    setTemplates((values) => values.map((item) => item.tipoMensaje === tipoMensaje
      ? { ...item, nombre: selectedTemplate.name, templateUuid: selectedTemplate.uuid, cantidadParametrosBody: cantidad, estado: selectedTemplate.status }
      : item));
  }

  return <section style={{ display: "grid", gap: 16 }}>
    <div>
      <h2 style={{ marginBottom: 4 }}>Instituciones y canales</h2>
      <p style={{ marginTop: 0, color: "#64748b" }}>Seleccioná una institución para administrar su conexión de WhatsApp.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 34%) 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar institución" style={{ padding: 10, borderRadius: 8, border: "1px solid #94a3b8" }} />
        <div style={{ maxHeight: 430, overflowY: "auto", display: "grid", gap: 7 }}>
          {filtered.map((item) => <button key={item.InstitucionId} type="button" onClick={() => setSelectedId(item.InstitucionId)} style={{
            textAlign: "left", padding: 11, borderRadius: 9, cursor: "pointer",
            border: selectedId === item.InstitucionId ? "2px solid #14b8a6" : isConnected(item) ? "1px solid #22c55e" : "1px solid #cbd5e1",
            background: selectedId === item.InstitucionId ? (isConnected(item) ? "#bbf7d0" : "#ccfbf1") : isConnected(item) ? "#f0fdf4" : "#fff",
            color: "#0f172a"
          }}>
            <strong>{item.Nombre}</strong>{item.NombreComercial && <small style={{ display: "block", color: "#64748b" }}>{item.NombreComercial}</small>}
            <small style={{ display: "block", marginTop: 6, color: isConnected(item) ? "#047857" : "#b45309", fontWeight: 800 }}>
              {isConnected(item) ? `CONECTADO · ${item.WhatsAppNumero || "Sin número"} · ${channelTypeLabel(item)}` : "DESCONECTADO"}
            </small>
          </button>)}
        </div>
      </div>

      <div style={{ background: "#0f1f31", color: "#f8fafc", border: "1px solid #334155", borderRadius: 14, padding: 18, display: "grid", gap: 14 }}>
        {!selected && <p style={{ margin: 0 }}>Seleccioná una institución de la lista.</p>}
        {selected && <>
          <h3 style={{ margin: 0 }}>{selected.Nombre}</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: 12, borderRadius: 10, background: "#172b40", border: "1px solid #475569" }}>
            <strong>Uso actual:</strong>
            <span>{configuredMode === "NO_CONFIGURADO" ? "Sin conexión seleccionada" : configuredMode === "GENERICA" ? "Número genérico de Profe360" : configuredMode === "PROPIO_QR" ? "Número propio - QR" : "Número propio - API"}</span>
            {effectiveNumber && <span style={{ color: "#bfdbfe" }}>{effectiveNumber}</span>}
            <span style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 999, fontWeight: 800, color: effectiveStatus === "CONECTADO" ? "#065f46" : "#92400e", background: effectiveStatus === "CONECTADO" ? "#a7f3d0" : "#fef3c7" }}>{effectiveStatus}</span>
          </div>
          {error && <div style={{ padding: 10, borderRadius: 8, background: "#7f1d1d", color: "#fee2e2" }}>{error}</div>}
          {message && <div style={{ padding: 10, borderRadius: 8, background: "#064e3b", color: "#d1fae5" }}>{message}</div>}
          {progress > 0 && <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>{progressText}</span><span>{progress}%</span></div>
            <div style={{ height: 16, borderRadius: 999, background: "#334155", overflow: "hidden" }}><div style={{ height: "100%", width: progress + "%", background: progress === 100 ? "#22c55e" : "linear-gradient(90deg,#14b8a6,#fbbf24)", transition: "width .3s ease" }} /></div>
          </div>}
          <label>Tipo de canal<select value={mode} onChange={(e) => { setMode(e.target.value as Mode); setError(""); }} style={{ display: "block", width: "100%", marginTop: 5 }}>
            <option value="NO_CONFIGURADO">Sin conexión de WhatsApp</option>
            {!isProfe360 && <option value="GENERICA">Número genérico de Profe360</option>}
            <option value="PROPIO_API">Número propio del colegio - API</option>
            <option value="PROPIO_QR">Número propio del colegio - QR</option>
          </select></label>
          {mode === "NO_CONFIGURADO" && <><p>No se enviarán mensajes de WhatsApp para esta institución hasta seleccionar una conexión.</p><button type="button" onClick={saveMode} disabled={loading}>Guardar sin conexión</button></>}
          {mode === "GENERICA" && <><p>Utilizará el canal configurado para Profe360 sin poder cerrar su sesión.</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button type="button" onClick={saveMode} disabled={loading}>Guardar opción genérica</button>{configuredMode === "GENERICA" && <button type="button" onClick={detachFromGeneric} disabled={loading}>Dejar de usar el canal genérico</button>}</div></>}
          {mode === "PROPIO_QR" && <>
            <label>Número de origen<input value={number} onChange={(e) => setNumber(normalizePhone(e.target.value))} placeholder="+50686103791" style={{ display: "block", width: "100%", marginTop: 5 }} /></label>
            <label>Nombre visible<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="WhatsApp Colegio" style={{ display: "block", width: "100%", marginTop: 5 }} /></label>
            <small style={{ color: "#cbd5e1" }}>La API Key se toma de la configuración global del servidor y no se solicita por institución.</small>
          </>}
          {mode === "PROPIO_API" && <div style={{ display: "grid", gap: 12, padding: 14, borderRadius: 12, background: "#172b40", border: "1px solid #475569" }}>
            <strong>Conectar API oficial de WhatsApp Business (WABA)</strong>
            <p style={{ margin: 0, color: "#cbd5e1" }}>La conexión se autoriza con Meta dentro de 2Chat. Profe360 no solicitará ni almacenará la contraseña de Meta.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={openWabaOnboarding} disabled={loading}>1. Abrir conexión WABA en 2Chat</button>
              <button type="button" onClick={discoverWabaChannels} disabled={loading}>{loading ? "Consultando..." : "2. Buscar canales WABA"}</button>
            </div>
            {wabaChannels.length > 0 && <div style={{ display: "grid", gap: 8 }}>
              <strong>Seleccioná el número que utilizará {selected.Nombre}</strong>
              {wabaChannels.map((item) => {
                const assignedElsewhere = Boolean(item.assignedInstitutionId && item.assignedInstitutionId !== selectedId);
                return <label key={item.uuid} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: 11, borderRadius: 9, background: selectedWabaUuid === item.uuid ? "#164e63" : "#0f1f31", border: "1px solid " + (selectedWabaUuid === item.uuid ? "#22d3ee" : "#475569"), opacity: assignedElsewhere ? .65 : 1 }}>
                  <input type="radio" name="wabaChannel" value={item.uuid} checked={selectedWabaUuid === item.uuid} disabled={assignedElsewhere} onChange={() => setSelectedWabaUuid(item.uuid)} />
                  <span><strong>{item.phoneNumber}</strong><small style={{ display: "block", color: "#cbd5e1" }}>{item.verifiedName || item.friendlyName || "Sin nombre visible"}{item.messagingProvider ? ` · ${item.messagingProvider}` : ""}</small>{assignedElsewhere && <small style={{ display: "block", color: "#fecaca" }}>Asignado a {item.assignedInstitutionName || "otra institución"}</small>}</span>
                  <span style={{ padding: "5px 9px", borderRadius: 999, fontWeight: 800, color: item.connected && item.enabled ? "#065f46" : "#92400e", background: item.connected && item.enabled ? "#a7f3d0" : "#fef3c7" }}>{item.connected && item.enabled ? "CONECTADO" : "PENDIENTE"}</span>
                </label>;
              })}
              <button type="button" onClick={bindWabaChannel} disabled={loading || !selectedWabaUuid}>3. Vincular a esta institución</button>
            </div>}
            <details style={{ borderTop: "1px solid #475569", paddingTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "#cbd5e1" }}>Configuración manual avanzada</summary>
              <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                <label>Número de origen<input value={number} onChange={(e) => setNumber(normalizePhone(e.target.value))} placeholder="+50686103791" style={{ display: "block", width: "100%", marginTop: 5 }} /></label>
                <label>Nombre visible<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="WhatsApp Colegio" style={{ display: "block", width: "100%", marginTop: 5 }} /></label>
                <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Canal activo</label>
                <small style={{ color: "#cbd5e1" }}>Usá esta opción solamente si 2Chat no permite descubrir el canal automáticamente.</small>
                <button type="button" onClick={saveMode} disabled={loading}>Guardar canal API manualmente</button>
              </div>
            </details>
          </div>}
          {mode === "PROPIO_QR" && <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!(connected && channelType === "WHATSAPP_WEB") && <button type="button" onClick={connectQr} disabled={loading}>{loading ? "Procesando..." : channelConfigured && channelType === "WHATSAPP_WEB" ? "Conectar WA" : "Agregar o vincular número"}</button>}
              {connected && channelType === "WHATSAPP_WEB" && <button type="button" onClick={disconnectQr} disabled={loading}>Desconectar WA</button>}
              {channelConfigured && channelType === "WHATSAPP_WEB" && !connected && <button type="button" onClick={() => { setChannelConfigured(false); setChannelType(""); setNumber(""); setDisplayName(""); setQrUrl(""); setProgress(0); }}>Agregar/cambiar número</button>}
              <span style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800, color: connected && channelType === "WHATSAPP_WEB" ? "#065f46" : "#92400e", background: connected && channelType === "WHATSAPP_WEB" ? "#a7f3d0" : "#fef3c7", border: "2px solid " + (connected && channelType === "WHATSAPP_WEB" ? "#10b981" : "#f59e0b") }}>{connected && channelType === "WHATSAPP_WEB" ? "CONECTADO" : channelConfigured && channelType === "WHATSAPP_WEB" ? "DESCONECTADO" : "NO CONFIGURADO"}</span>
            </div>
            {qrUrl && <div><strong>Escaneá desde WhatsApp - Dispositivos vinculados</strong><br /><img src={qrUrl} alt="Código QR WhatsApp" style={{ width: 280, height: 280, marginTop: 8, background: "#fff", padding: 10, borderRadius: 12 }} /></div>}
          </div>}
          {mode === "PROPIO_API" && <div style={{ display: "grid", gap: 8, borderTop: "1px solid #334155", paddingTop: 12 }}>
            <strong>Plantillas WABA</strong>
            <button type="button" onClick={loadAvailableTemplates} disabled={loading} style={{ width: "fit-content" }}>Buscar plantillas en 2Chat</button>
            {templates.map((item) => <div key={item.tipoMensaje} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr 75px", gap: 7, alignItems: "center" }}>
              <span>{item.tipoMensaje}</span>
              <select value={item.templateUuid} onChange={(e) => assignAvailableTemplate(item.tipoMensaje, e.target.value)}><option value="">Seleccionar plantilla</option>{availableTemplates.map((available) => <option key={available.uuid} value={available.uuid}>{available.name} · {available.status}</option>)}</select>
              <input value={item.nombre} onChange={(e) => setTemplates((values) => values.map((value) => value.tipoMensaje === item.tipoMensaje ? { ...value, nombre: e.target.value } : value))} placeholder="Nombre" />
              <input value={item.templateUuid} onChange={(e) => setTemplates((values) => values.map((value) => value.tipoMensaje === item.tipoMensaje ? { ...value, templateUuid: e.target.value } : value))} placeholder="UUID" />
              <input type="number" min={0} value={item.cantidadParametrosBody} onChange={(e) => setTemplates((values) => values.map((value) => value.tipoMensaje === item.tipoMensaje ? { ...value, cantidadParametrosBody: Number(e.target.value || 0) } : value))} />
            </div>)}
            <button type="button" onClick={saveTemplates} disabled={loading}>Guardar plantillas</button>
          </div>}
        </>}
      </div>
    </div>
  </section>;
}
