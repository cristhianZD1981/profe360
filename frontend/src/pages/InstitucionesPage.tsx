import { FormEvent, useEffect, useMemo, useState } from "react";
import * as React from "react";
import api from "../lib/http";

type Institution = {
  InstitucionId: number;
  TipoClienteId: number;
  Nombre: string;
  NombreComercial: string | null;
  CedulaJuridica: string | null;
  CorreoPrincipal: string | null;
  TelefonoPrincipal: string | null;
  Direccion: string | null;
  CodigoPresupuestario?: string | null;
  CodigoPresupuestarioPL?: string | null;
  DescripcionCodigoPresupuestarioPL?: string | null;
  DireccionExacta?: string | null;
  LogoUrl: string | null;
  MembreteUrl: string | null;
  NombreOficialBoleta: string | null;
  RegionalEducativa: string | null;
  CircuitoEducativo: string | null;
  Activo: boolean;
};

type WhatsAppConfig = {
  numeroOrigen: string;
  apiKey: string;
  nombreVisible: string;
  activo: boolean;
  estado: string;
  tieneApiKey: boolean;
};

type WhatsAppTemplate = {
  tipoMensaje: string;
  nombre: string;
  templateUuid: string;
  codigoIdioma: string;
  cantidadParametrosBody: number;
  estado: string;
  activo: boolean;
};

const initialForm = {
  tipoClienteId: 1,
  nombre: "",
  nombreComercial: "",
  cedulaJuridica: "",
  correoPrincipal: "",
  telefonoPrincipal: "",
  direccion: "",
  codigoPresupuestario: "",
  codigoPresupuestarioPL: "",
  descripcionCodigoPresupuestarioPL: "",
  direccionExacta: "",
  logoUrl: "",
  membreteUrl: "",
  nombreOficialBoleta: "",
  regionalEducativa: "",
  circuitoEducativo: ""
};

const initialWhatsAppConfig: WhatsAppConfig = {
  numeroOrigen: "",
  apiKey: "",
  nombreVisible: "",
  activo: true,
  estado: "PENDIENTE",
  tieneApiKey: false
};

const whatsappTemplateTypes = [
  { value: "ASISTENCIA", label: "Asistencia" },
  { value: "TAREA", label: "Tareas" },
  { value: "PROYECTO", label: "Proyectos" },
  { value: "COTIDIANO", label: "Cotidiano" },
  { value: "EXAMENES", label: "Exámenes" },
  { value: "BOLETA", label: "Boletas" },
  { value: "GENERAL", label: "General" }
];

function createEmptyTemplates(): WhatsAppTemplate[] {
  return whatsappTemplateTypes.map((item) => ({
    tipoMensaje: item.value,
    nombre: "",
    templateUuid: "",
    codigoIdioma: "es",
    cantidadParametrosBody: 0,
    estado: "PENDIENTE",
    activo: true
  }));
}

function normalizeWabaNumberInput(value: string, addDefaultCountryCode = false) {
  const cleaned = value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (addDefaultCountryCode && /^\d{8,12}$/.test(cleaned)) return `+506${cleaned}`;
  return cleaned;
}

function WhatsAppTemplateEditor(props: {
  templates: WhatsAppTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<WhatsAppTemplate[]>>;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: "10px", paddingTop: "8px" }}>
      <strong>Plantillas WABA</strong>
      <small style={{ color: "#c9d6e2" }}>
        Registrá el UUID exacto de la plantilla aprobada en Meta/2Chat y la cantidad de variables del cuerpo.
      </small>
      {props.templates.map((template) => {
        const label = whatsappTemplateTypes.find((item) => item.value === template.tipoMensaje)?.label || template.tipoMensaje;
        return (
          <div key={template.tipoMensaje} style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 90px 110px", gap: "8px", alignItems: "center" }}>
            <strong style={{ fontSize: "13px" }}>{label}</strong>
            <input placeholder="Nombre de plantilla" value={template.nombre} onChange={(e) => props.setTemplates((current) => current.map((item) => item.tipoMensaje === template.tipoMensaje ? { ...item, nombre: e.target.value } : item))} />
            <input placeholder="Template UUID" value={template.templateUuid} onChange={(e) => props.setTemplates((current) => current.map((item) => item.tipoMensaje === template.tipoMensaje ? { ...item, templateUuid: e.target.value } : item))} />
            <input type="number" min={0} placeholder="Variables" value={template.cantidadParametrosBody} onChange={(e) => props.setTemplates((current) => current.map((item) => item.tipoMensaje === template.tipoMensaje ? { ...item, cantidadParametrosBody: Number(e.target.value || 0) } : item))} />
            <span style={{ fontSize: "12px", color: template.estado === "APPROVED" ? "#166534" : "#92400e" }}>{template.estado}</span>
          </div>
        );
      })}
      <button type="button" className="primary-btn" onClick={props.onSave} disabled={props.saving} style={{ width: "fit-content" }}>
        {props.saving ? "Guardando plantillas..." : "Guardar plantillas"}
      </button>
    </div>
  );
}

function parseJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

export default function InstitucionesPage() {
  const [items, setItems] = useState<Institution[]>([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingMembrete, setUploadingMembrete] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState(initialWhatsAppConfig);
  const [fallbackConfig, setFallbackConfig] = useState(initialWhatsAppConfig);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>(createEmptyTemplates);
  const [fallbackTemplates, setFallbackTemplates] = useState<WhatsAppTemplate[]>(createEmptyTemplates);
  const [modoWhatsApp, setModoWhatsApp] = useState<"GENERICA" | "PROPIO_API" | "PROPIO_QR">("GENERICA");
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState("");
  const [qrChannelConfigured, setQrChannelConfigured] = useState(false);
  const [qrConnected, setQrConnected] = useState(false);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);

  const authInfo = useMemo(() => {
    const token =
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token") ||
      "";
    return token ? parseJwt(token) : null;
  }, []);

  const roles: string[] = authInfo?.roles || [];
  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const isAdminInstitucional = roles.includes("ADMIN_INSTITUCIONAL");

  async function load(query = "", verInactivas = incluirInactivas) {
    try {
      const response = await api.get("/instituciones", {
        params: {
          q: query,
          incluirInactivas: verInactivas
        }
      });

      const data = response.data.data ?? [];
      setItems(data);
    } catch (error) {
      console.error("Error cargando instituciones:", error);
      setErrorMessage("No se pudo cargar el listado de instituciones");
    }
  }

  useEffect(() => {
    load("", incluirInactivas);
  }, []);

  useEffect(() => {
    if (!editingId || modoWhatsApp !== "PROPIO_QR" || !qrCodeImageUrl || qrConnected) return;
    let cancelled = false;
    let checking = false;

    const verifyConnection = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const response = await api.get("/instituciones/" + editingId + "/whatsapp/qr/estado");
        if (!cancelled && response.data?.data?.connected) {
          setQrConnected(true);
          setQrCodeImageUrl("");
          setWhatsappConfig((prev) => ({ ...prev, estado: "CONECTADO" }));
          setMessage("WhatsApp conectado y verificado correctamente.");
        }
      } catch (error) {
        console.error("No se pudo verificar todavía la conexión QR:", error);
      } finally {
        checking = false;
      }
    };

    void verifyConnection();
    const timer = window.setInterval(() => void verifyConnection(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [editingId, modoWhatsApp, qrCodeImageUrl, qrConnected]);

  function openCreateForm() {
    setEditingId(null);
    setForm(initialForm);
    setMessage("");
    setErrorMessage("");
    setWhatsappConfig(initialWhatsAppConfig);
    setModoWhatsApp("GENERICA");
    setQrCodeImageUrl("");
    setQrChannelConfigured(false);
    setQrConnected(false);
    setWhatsappTemplates(createEmptyTemplates());
    setIsFormExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadWhatsAppConfig(institucionId: number) {
    setLoadingWhatsApp(true);
    try {
      const response = await api.get(`/instituciones/${institucionId}/whatsapp`);
      const canal = response.data?.data?.canal;
      const savedTemplates = Array.isArray(response.data?.data?.plantillas) ? response.data.data.plantillas : [];
      setWhatsappConfig({
        numeroOrigen: canal?.NumeroOrigen || "",
        apiKey: "",
        nombreVisible: canal?.NombreVisible || "",
        activo: canal?.Activo !== false,
        estado: canal?.Estado || "PENDIENTE",
        tieneApiKey: Boolean(canal?.TieneApiKey)
      });
      setModoWhatsApp(canal?.TipoCanal === "WHATSAPP_WEB" ? "PROPIO_QR" : canal ? "PROPIO_API" : "GENERICA");
      setQrCodeImageUrl("");
      setQrChannelConfigured(Boolean(canal?.TipoCanal === "WHATSAPP_WEB" && canal?.CanalExternoId));
      setQrConnected(canal?.TipoCanal === "WHATSAPP_WEB" && canal?.Estado === "CONECTADO");
      setWhatsappTemplates((current) => current.map((item) => {
        const saved = savedTemplates.find((template: any) => template.TipoMensaje === item.tipoMensaje || (item.tipoMensaje === "COTIDIANO" && template.TipoMensaje === "EVALUACION"));
        return saved ? {
          ...item,
          nombre: saved.Nombre || "",
          templateUuid: saved.TemplateUuid || "",
          codigoIdioma: saved.CodigoIdioma || "es",
          cantidadParametrosBody: Number(saved.CantidadParametrosBody || 0),
          estado: saved.Estado || "PENDIENTE",
          activo: saved.Activo !== false
        } : item;
      }));
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la configuración de WhatsApp");
    } finally {
      setLoadingWhatsApp(false);
    }
  }

  async function loadWhatsAppFallback() {
    if (!isSuperAdmin) return;
    try {
      const response = await api.get("/instituciones/whatsapp/fallback");
      const canal = response.data?.data?.canal;
      const savedTemplates = Array.isArray(response.data?.data?.plantillas) ? response.data.data.plantillas : [];
      setFallbackConfig({
        numeroOrigen: canal?.NumeroOrigen || "",
        apiKey: "",
        nombreVisible: canal?.NombreVisible || "",
        activo: canal?.Activo !== false,
        estado: canal?.Estado || "PENDIENTE",
        tieneApiKey: Boolean(canal?.TieneApiKey)
      });
      setFallbackTemplates((current) => current.map((item) => {
        const saved = savedTemplates.find((template: any) => template.TipoMensaje === item.tipoMensaje || (item.tipoMensaje === "COTIDIANO" && template.TipoMensaje === "EVALUACION"));
        return saved ? {
          ...item,
          nombre: saved.Nombre || "",
          templateUuid: saved.TemplateUuid || "",
          codigoIdioma: saved.CodigoIdioma || "es",
          cantidadParametrosBody: Number(saved.CantidadParametrosBody || 0),
          estado: saved.Estado || "PENDIENTE",
          activo: saved.Activo !== false
        } : item;
      }));
    } catch (error) {
      console.error("Error cargando fallback WhatsApp:", error);
    }
  }

  async function saveWhatsAppConfig() {
    if (!editingId) {
      setErrorMessage("Primero guardá la institución y luego configurá WhatsApp");
      return;
    }
    if (!whatsappConfig.numeroOrigen.trim()) {
      setErrorMessage("Ingresá el número WABA de origen");
      return;
    }
    if (!/^\+\d{8,15}$/.test(whatsappConfig.numeroOrigen.trim())) {
      setErrorMessage("El número WABA debe estar en formato internacional, por ejemplo +50686103791");
      return;
    }
    if (!whatsappConfig.tieneApiKey && !whatsappConfig.apiKey.trim()) {
      setErrorMessage("Ingresá la API Key de 2Chat");
      return;
    }

    setSavingWhatsApp(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.put(`/instituciones/${editingId}/whatsapp`, {
        numeroOrigen: whatsappConfig.numeroOrigen,
        apiKey: whatsappConfig.apiKey || undefined,
        nombreVisible: whatsappConfig.nombreVisible || null,
        activo: whatsappConfig.activo
      });
      const canal = response.data?.data;
      setWhatsappConfig((prev) => ({
        ...prev,
        apiKey: "",
        estado: canal?.Estado || "PENDIENTE",
        tieneApiKey: true
      }));
      setMessage("Configuración de WhatsApp guardada correctamente");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la configuración de WhatsApp");
    } finally {
      setSavingWhatsApp(false);
    }
  }

  async function saveWhatsAppMode(institucionId: number, modo: "GENERICA" | "PROPIO") {
    await api.put(`/instituciones/${institucionId}/whatsapp/mode`, { modo });
  }

  async function connectWhatsAppQr() {
    if (!editingId) {
      setErrorMessage("Primero guardá la institución y luego conectá WhatsApp por QR");
      return;
    }
    setSavingWhatsApp(true);
    setErrorMessage("");
    try {
      let response: any;
      if (!qrChannelConfigured) {
        if (!whatsappConfig.numeroOrigen.trim() || !/^\+\d{8,15}$/.test(whatsappConfig.numeroOrigen.trim())) {
          throw new Error("Ingresá el número QR en formato internacional, por ejemplo +50686103791");
        }
        if (!whatsappConfig.apiKey.trim() && !whatsappConfig.tieneApiKey) {
          throw new Error("Ingresá la API Key de 2Chat para crear el canal QR");
        }
        response = await api.post(`/instituciones/${editingId}/whatsapp/qr/crear`, {
          numeroOrigen: whatsappConfig.numeroOrigen,
          apiKey: whatsappConfig.apiKey || undefined,
          nombreVisible: whatsappConfig.nombreVisible || `WhatsApp ${editingId}`
        });
        setQrChannelConfigured(true);
        setWhatsappConfig((prev) => ({
          ...prev,
          apiKey: "",
          tieneApiKey: true,
          estado: response.data?.data?.connected ? "CONECTADO" : response.data?.data?.channel?.Estado || "PENDIENTE"
        }));
        setQrConnected(Boolean(response.data?.data?.connected));
      } else {
        response = await api.post(`/instituciones/${editingId}/whatsapp/qr/conectar`, {
          apiKey: whatsappConfig.apiKey || undefined
        });
      }
      setQrCodeImageUrl(response.data?.data?.qrCodeImageUrl || "");
      if (response.data?.data?.connected) {
        setQrConnected(true);
        setWhatsappConfig((prev) => ({ ...prev, estado: "CONECTADO" }));
        setMessage(response.data?.message || "WhatsApp ya está conectado; no es necesario escanear otro QR.");
      } else if (response.data?.data?.qrCodeImageUrl || response.data?.data?.qrCode) {
        setMessage("QR generado. Escanealo desde WhatsApp - Dispositivos vinculados.");
      } else {
        setMessage(response.data?.data?.warning || response.data?.message || "2Chat todavia esta preparando el codigo QR.");
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo generar el QR");
    } finally {
      setSavingWhatsApp(false);
    }
  }

  async function disconnectWhatsAppQr() {
    if (!editingId) return;
    setSavingWhatsApp(true);
    setErrorMessage("");
    try {
      const response = await api.post(`/instituciones/${editingId}/whatsapp/qr/desconectar`, {
        apiKey: whatsappConfig.apiKey || undefined
      });
      setQrConnected(false);
      setQrCodeImageUrl("");
      setWhatsappConfig((prev) => ({ ...prev, estado: "PENDIENTE", apiKey: "" }));
      setMessage(response.data?.message || "WhatsApp desconectado correctamente");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desconectar WhatsApp");
    } finally {
      setSavingWhatsApp(false);
    }
  }

  function beginNewWhatsAppQrChannel() {
    setQrChannelConfigured(false);
    setQrConnected(false);
    setQrCodeImageUrl("");
    setWhatsappConfig({
      ...initialWhatsAppConfig,
      activo: true,
      estado: "PENDIENTE"
    });
    setMessage("Ingresá el nuevo número y la API Key de 2Chat; luego presioná Agregar número a 2Chat.");
    setErrorMessage("");
  }

  async function saveWhatsAppFallback() {
    if (!fallbackConfig.numeroOrigen.trim()) {
      setErrorMessage("Ingresá el número fallback de PROFE360");
      return;
    }
    if (!fallbackConfig.tieneApiKey && !fallbackConfig.apiKey.trim()) {
      setErrorMessage("Ingresá la API Key de 2Chat del fallback");
      return;
    }

    setSavingWhatsApp(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.put("/instituciones/whatsapp/fallback", {
        numeroOrigen: fallbackConfig.numeroOrigen,
        apiKey: fallbackConfig.apiKey || undefined,
        nombreVisible: fallbackConfig.nombreVisible || null,
        activo: fallbackConfig.activo
      });
      const canal = response.data?.data;
      setFallbackConfig((prev) => ({
        ...prev,
        apiKey: "",
        estado: canal?.Estado || "PENDIENTE",
        tieneApiKey: true
      }));
      setMessage("Fallback WhatsApp guardado correctamente");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el fallback de WhatsApp");
    } finally {
      setSavingWhatsApp(false);
    }
  }

  function updateTemplate(setter: React.Dispatch<React.SetStateAction<WhatsAppTemplate[]>>, tipoMensaje: string, field: keyof WhatsAppTemplate, value: string | number | boolean) {
    setter((current) => current.map((item) => item.tipoMensaje === tipoMensaje ? { ...item, [field]: value } : item));
  }

  async function saveTemplates(target: "institution" | "fallback") {
    const templates = target === "institution" ? whatsappTemplates : fallbackTemplates;
    const configured = templates.filter((item) => item.templateUuid.trim() && item.nombre.trim());
    if (!configured.length) {
      setErrorMessage("Ingresá al menos una plantilla con nombre y UUID");
      return;
    }
    setSavingWhatsApp(true);
    setMessage("");
    setErrorMessage("");
    try {
      const url = target === "institution" ? `/instituciones/${editingId}/whatsapp/plantillas` : "/instituciones/whatsapp/fallback/plantillas";
      const response = await api.put(url, { plantillas: configured });
      const saved = response.data?.data?.plantillas || [];
      const setter = target === "institution" ? setWhatsappTemplates : setFallbackTemplates;
      setter((current) => current.map((item) => {
        const match = saved.find((template: any) => template.TipoMensaje === item.tipoMensaje);
        return match ? { ...item, estado: match.Estado || item.estado, activo: match.Activo !== false } : item;
      }));
      setMessage("Plantillas guardadas correctamente");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudieron guardar las plantillas");
    } finally {
      setSavingWhatsApp(false);
    }
  }

  async function subirArchivo(file: File, tipo: "logo" | "membrete") {
    if (tipo === "logo") setUploadingLogo(true);
    if (tipo === "membrete") setUploadingMembrete(true);

    setErrorMessage("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("archivo", file);

      const response = await api.post("/archivos/subir", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const secureUrl =
        response.data?.data?.secure_url ||
        response.data?.data?.url ||
        "";

      if (!secureUrl) {
        throw new Error("No se recibió la URL del archivo");
      }

      if (tipo === "logo") {
        setForm((prev) => ({ ...prev, logoUrl: secureUrl }));
        setMessage("Logo subido correctamente");
      } else {
        setForm((prev) => ({ ...prev, membreteUrl: secureUrl }));
        setMessage("Membrete subido correctamente");
      }
    } catch (error: any) {
      console.error(`Error subiendo ${tipo}:`, error);

      const backendMessage =
        error?.response?.data?.message ||
        `No se pudo subir el ${tipo}`;

      setErrorMessage(backendMessage);
    } finally {
      if (tipo === "logo") setUploadingLogo(false);
      if (tipo === "membrete") setUploadingMembrete(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const payload = {
        tipoClienteId: form.tipoClienteId,
        nombre: form.nombre,
        nombreComercial: form.nombreComercial || null,
        cedulaJuridica: form.cedulaJuridica || null,
        correoPrincipal: form.correoPrincipal || null,
        telefonoPrincipal: form.telefonoPrincipal || null,
        direccion: form.direccion || null,
        codigoPresupuestario: form.codigoPresupuestario || null,
        codigoPresupuestarioPL: form.codigoPresupuestarioPL || null,
        descripcionCodigoPresupuestarioPL: form.descripcionCodigoPresupuestarioPL || null,
        direccionExacta: form.direccionExacta || null,
        logoUrl: form.logoUrl || null,
        membreteUrl: form.membreteUrl || null,
        nombreOficialBoleta: form.nombreOficialBoleta || null,
        regionalEducativa: form.regionalEducativa || null,
        circuitoEducativo: form.circuitoEducativo || null
      };

      let savedInstitutionId = editingId;
      if (editingId) {
        await api.put(`/instituciones/${editingId}`, payload);
        setMessage("Institución actualizada correctamente");
      } else {
        const response = await api.post("/instituciones", payload);
        savedInstitutionId = Number(response.data?.data?.InstitucionId || response.data?.data?.institucionId || 0) || null;
        setMessage("Institución creada correctamente");
      }

      if (false && isSuperAdmin && savedInstitutionId && modoWhatsApp === "GENERICA") {
        await saveWhatsAppMode(savedInstitutionId!, "GENERICA");
      }
      if (false && isSuperAdmin && modoWhatsApp === "PROPIO_API") {
        if (!whatsappConfig.numeroOrigen.trim()) throw new Error("Ingresá el número WABA propio del colegio");
        if (!/^\+\d{8,15}$/.test(whatsappConfig.numeroOrigen.trim())) throw new Error("El número WABA debe estar en formato internacional, por ejemplo +50686103791");
        if (!whatsappConfig.tieneApiKey && !whatsappConfig.apiKey.trim()) throw new Error("Ingresá la API Key de 2Chat del colegio");
        if (savedInstitutionId) {
          const response = await api.put(`/instituciones/${savedInstitutionId}/whatsapp`, {
            numeroOrigen: whatsappConfig.numeroOrigen,
            apiKey: whatsappConfig.apiKey || undefined,
            nombreVisible: whatsappConfig.nombreVisible || null,
            activo: true
          });
          setWhatsappConfig((prev) => ({ ...prev, apiKey: "", estado: response.data?.data?.Estado || "PENDIENTE", tieneApiKey: true }));
        }
      }
      if (false && isSuperAdmin && modoWhatsApp === "PROPIO_QR" && savedInstitutionId && !qrChannelConfigured && whatsappConfig.numeroOrigen.trim() && whatsappConfig.apiKey.trim()) {
        await api.post(`/instituciones/${savedInstitutionId}/whatsapp/qr/crear`, {
          numeroOrigen: whatsappConfig.numeroOrigen,
          apiKey: whatsappConfig.apiKey,
          nombreVisible: whatsappConfig.nombreVisible || `WhatsApp ${form.nombre}`
        });
      }

      setForm(initialForm);
      setEditingId(null);
      setIsFormExpanded(false);

      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error guardando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo guardar la institución";

      setErrorMessage(backendMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(item: Institution) {
    setMessage("");
    setErrorMessage("");
    setWhatsappConfig(initialWhatsAppConfig);
    setModoWhatsApp("GENERICA");
    setQrCodeImageUrl("");
    setQrChannelConfigured(false);
    setQrConnected(false);
    setEditingId(item.InstitucionId);
    setForm({
      tipoClienteId: item.TipoClienteId,
      nombre: item.Nombre || "",
      nombreComercial: item.NombreComercial || "",
      cedulaJuridica: item.CedulaJuridica || "",
      correoPrincipal: item.CorreoPrincipal || "",
      telefonoPrincipal: item.TelefonoPrincipal || "",
      direccion: item.Direccion || "",
      codigoPresupuestario: item.CodigoPresupuestario || "",
      codigoPresupuestarioPL: item.CodigoPresupuestarioPL || "",
      descripcionCodigoPresupuestarioPL: item.DescripcionCodigoPresupuestarioPL || "",
      direccionExacta: item.DireccionExacta || "",
      logoUrl: item.LogoUrl || "",
      membreteUrl: item.MembreteUrl || "",
      nombreOficialBoleta: item.NombreOficialBoleta || "",
      regionalEducativa: item.RegionalEducativa || "",
      circuitoEducativo: item.CircuitoEducativo || ""
    });
    setIsFormExpanded(true);
    if (isSuperAdmin) void loadWhatsAppConfig(item.InstitucionId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setMessage("");
    setErrorMessage("");
    setWhatsappConfig(initialWhatsAppConfig);
    setModoWhatsApp("GENERICA");
    setQrCodeImageUrl("");
    setQrChannelConfigured(false);
    setQrConnected(false);
    setIsFormExpanded(false);
  }

  async function handleDelete(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta institución?");
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      await api.delete(`/instituciones/${id}`);
      setMessage("Institución desactivada correctamente");

      if (editingId === id) {
        setEditingId(null);
        setForm(initialForm);
        if (isSuperAdmin) {
          setIsFormExpanded(false);
        }
      }

      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error desactivando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo desactivar la institución";

      setErrorMessage(backendMessage);
    }
  }

  async function handleReactivate(id: number) {
    setMessage("");
    setErrorMessage("");

    try {
      await api.patch(`/instituciones/${id}/reactivar`);
      setMessage("Institución reactivada correctamente");
      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error reactivando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo reactivar la institución";

      setErrorMessage(backendMessage);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search, incluirInactivas);
  }

  return (
    <div
      className="two-col"
      style={isFormExpanded ? { display: "flex", flexDirection: "column", gap: "16px" } : undefined}
    >
      <section className="card" style={isFormExpanded ? { order: 2 } : undefined}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "12px"
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              {isFormExpanded
                ? editingId
                  ? "Editar institución"
                  : isSuperAdmin
                    ? "Crear institución"
                    : "Mi institución"
                : "Instituciones"}
            </h3>
          </div>

          {!isFormExpanded && (
            <>
              {isSuperAdmin && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={openCreateForm}
                >
                  Agregar institución
                </button>
              )}

              {!isSuperAdmin && items.length > 0 && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleEdit(items[0])}
                >
                  Editar institución
                </button>
              )}
            </>
          )}
        </div>

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

        {isFormExpanded ? (
          <form className="form" onSubmit={handleSubmit}>
          {isSuperAdmin && (
            <label>
              Tipo cliente
              <input
                type="number"
                value={form.tipoClienteId}
                onChange={(e) =>
                  setForm({ ...form, tipoClienteId: Number(e.target.value || 1) })
                }
              />
            </label>
          )}

          <label>
            Nombre
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </label>

          <label>
            Nombre comercial
            <input
              value={form.nombreComercial}
              onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })}
            />
          </label>

          <label>
            Nombre oficial para boleta
            <input
              value={form.nombreOficialBoleta}
              onChange={(e) => setForm({ ...form, nombreOficialBoleta: e.target.value })}
              placeholder="Nombre formal que saldrá en la boleta"
            />
          </label>

          <label>
            Regional educativa
            <input
              value={form.regionalEducativa}
              onChange={(e) => setForm({ ...form, regionalEducativa: e.target.value })}
            />
          </label>

          <label>
            Circuito educativo
            <input
              value={form.circuitoEducativo}
              onChange={(e) => setForm({ ...form, circuitoEducativo: e.target.value })}
            />
          </label>

          <label>
            Cédula jurídica
            <input
              value={form.cedulaJuridica}
              onChange={(e) => setForm({ ...form, cedulaJuridica: e.target.value })}
            />
          </label>

          <label>
            Correo principal
            <input
              type="email"
              value={form.correoPrincipal}
              onChange={(e) => setForm({ ...form, correoPrincipal: e.target.value })}
            />
          </label>

          <label>
            Teléfono principal
            <input
              value={form.telefonoPrincipal}
              onChange={(e) => setForm({ ...form, telefonoPrincipal: e.target.value })}
            />
          </label>

          <label>
            Dirección
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </label>

          <label>
            Código presupuestario
            <input
              value={form.codigoPresupuestario}
              onChange={(e) => setForm({ ...form, codigoPresupuestario: e.target.value })}
            />
          </label>

          <label>
            Código presupuestario PL
            <input
              value={form.codigoPresupuestarioPL}
              onChange={(e) => setForm({ ...form, codigoPresupuestarioPL: e.target.value })}
            />
          </label>

          <label>
            Descripción código presupuestario PL
            <input
              value={form.descripcionCodigoPresupuestarioPL}
              onChange={(e) =>
                setForm({ ...form, descripcionCodigoPresupuestarioPL: e.target.value })
              }
            />
          </label>

          <label>
            Dirección exacta
            <textarea
              rows={3}
              value={form.direccionExacta}
              onChange={(e) => setForm({ ...form, direccionExacta: e.target.value })}
            />
          </label>

          <div style={{ display: "grid", gap: "8px" }}>
            <label>Logo de la institución</label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirArchivo(file, "logo");
              }}
            />

            {uploadingLogo && (
              <div style={{ fontSize: "14px", color: "#475569" }}>
                Subiendo logo...
              </div>
            )}

            {form.logoUrl && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap"
                }}
              >
                <img
                  src={form.logoUrl}
                  alt="Logo institución"
                  style={{
                    width: "72px",
                    height: "72px",
                    objectFit: "contain",
                    borderRadius: "10px",
                    background: "#fff"
                  }}
                />

                <button
                  type="button"
                  onClick={() => setForm({ ...form, logoUrl: "" })}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Quitar logo
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label>Membrete institucional para boleta</label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirArchivo(file, "membrete");
              }}
            />

            {uploadingMembrete && (
              <div style={{ fontSize: "14px", color: "#475569" }}>
                Subiendo membrete...
              </div>
            )}

            {form.membreteUrl && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "grid",
                  gap: "12px"
                }}
              >
                <img
                  src={form.membreteUrl}
                  alt="Membrete institución"
                  style={{
                    width: "100%",
                    maxHeight: "160px",
                    objectFit: "contain",
                    borderRadius: "10px",
                    background: "#fff"
                  }}
                />

                <button
                  type="button"
                  onClick={() => setForm({ ...form, membreteUrl: "" })}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    background: "#fff",
                    cursor: "pointer",
                    width: "fit-content"
                  }}
                >
                  Quitar membrete
                </button>
              </div>
            )}
          </div>

          {false && isSuperAdmin && (
            <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "12px", border: "1px solid rgba(96,165,250,0.35)", background: "rgba(255,255,255,0.05)" }}>
              <div>
                <strong>Canal de WhatsApp para esta institución</strong>
                <div style={{ color: "#c9d6e2", fontSize: "13px", marginTop: "4px" }}>
                  Elegí si el colegio enviará desde el número genérico de Profe360 o desde un número WABA propio.
                </div>
              </div>
              {form.nombre.trim().toUpperCase() === "PROFE360" ? (
                <div style={{ color: "#93c5fd", fontSize: "13px" }}>
                  Esta institución es la fuente del número genérico de Profe360. Los datos WABA configurados abajo serán utilizados por los colegios que elijan la opción genérica.
                </div>
              ) : (
                <label>
                  Tipo de número
                  <select value={modoWhatsApp} onChange={(e) => setModoWhatsApp(e.target.value as "GENERICA" | "PROPIO_API" | "PROPIO_QR")}>
                    <option value="GENERICA">Número genérico de Profe360</option>
                    <option value="PROPIO_API">Número propio del colegio - API</option>
                    <option value="PROPIO_QR">Número propio del colegio - QR</option>
                  </select>
                </label>
              )}
              {modoWhatsApp === "GENERICA" && (
                <div style={{ color: "#93c5fd", fontSize: "13px" }}>
                  Se utilizará el número fallback configurado por SUPER_ADMIN. No se requiere API Key en esta institución.
                </div>
              )}
            </div>
          )}

          {false && isSuperAdmin && (modoWhatsApp === "PROPIO_API" || modoWhatsApp === "PROPIO_QR" || form.nombre.trim().toUpperCase() === "PROFE360") && (
            <div
              style={{
                display: "grid",
                gap: "12px",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(16,183,164,0.35)",
                background: "rgba(255,255,255,0.05)"
              }}
            >
              <div>
                <strong>WhatsApp WABA del colegio</strong>
                <div style={{ color: "#c9d6e2", fontSize: "13px", marginTop: "4px" }}>
                  La API Key se guarda cifrada y nunca se muestra nuevamente.
                </div>
              </div>

              {loadingWhatsApp ? (
                <div style={{ color: "#c9d6e2" }}>Cargando configuración de WhatsApp...</div>
              ) : (
                <>
                  <label>
                    Número de origen WABA
                    <input
                      type="tel"
                      inputMode="tel"
                      value={whatsappConfig.numeroOrigen}
                      onChange={(e) => setWhatsappConfig({ ...whatsappConfig, numeroOrigen: normalizeWabaNumberInput(e.target.value) })}
                      onBlur={(e) => setWhatsappConfig({ ...whatsappConfig, numeroOrigen: normalizeWabaNumberInput(e.target.value, true) })}
                      placeholder="+50686103791 (también puede ser +507...)"
                    />
                    <small style={{ color: "#c9d6e2" }}>Si escribís solo el número local, se antepone +506. También podés ingresar manualmente otro código, como +507.</small>
                    {whatsappConfig.numeroOrigen && !/^\+\d{8,15}$/.test(whatsappConfig.numeroOrigen.trim()) && (
                      <small style={{ color: "#fca5a5" }}>Debe ser un número telefónico internacional, no un correo.</small>
                    )}
                  </label>

                  <label>
                    API Key de 2Chat {whatsappConfig.tieneApiKey ? "(dejar vacío para conservarla)" : ""}
                    <input
                      type="password"
                      value={whatsappConfig.apiKey}
                      onChange={(e) => setWhatsappConfig({ ...whatsappConfig, apiKey: e.target.value })}
                      placeholder={whatsappConfig.tieneApiKey ? "API Key configurada" : "Ingresá la API Key"}
                    />
                  </label>

                  <label>
                    Nombre visible
                    <input
                      value={whatsappConfig.nombreVisible}
                      onChange={(e) => setWhatsappConfig({ ...whatsappConfig, nombreVisible: e.target.value })}
                      placeholder="WhatsApp Colegio"
                    />
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={whatsappConfig.activo}
                      onChange={(e) => setWhatsappConfig({ ...whatsappConfig, activo: e.target.checked })}
                    />
                    Canal activo
                  </label>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    {modoWhatsApp === "PROPIO_QR" && (
                      <>
                        <button type="button" className="primary-btn" onClick={connectWhatsAppQr} disabled={savingWhatsApp}>
                          {savingWhatsApp ? "Procesando..." : !qrChannelConfigured ? "Agregar número a 2Chat" : qrConnected ? "Conectado" : "Conectar WA"}
                        </button>
                        {qrChannelConfigured && qrConnected && (
                          <button type="button" className="secondary-btn" onClick={disconnectWhatsAppQr} disabled={savingWhatsApp}>
                            {savingWhatsApp ? "Procesando..." : "Desconectar WA"}
                          </button>
                        )}
                        {qrChannelConfigured && !qrConnected && (
                          <button type="button" className="secondary-btn" onClick={beginNewWhatsAppQrChannel} disabled={savingWhatsApp}>
                            Agregar/cambiar número
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={saveWhatsAppConfig}
                      disabled={savingWhatsApp || modoWhatsApp === "PROPIO_QR"}
                    >
                      {savingWhatsApp ? "Guardando WhatsApp..." : modoWhatsApp === "PROPIO_QR" ? "Guardar datos QR" : "Guardar WhatsApp"}
                    </button>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      fontSize: "14px",
                      fontWeight: 800,
                      color: qrConnected ? "#065f46" : "#92400e",
                      background: qrConnected ? "#a7f3d0" : "#fef3c7",
                      border: `2px solid ${qrConnected ? "#10b981" : "#f59e0b"}`
                    }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: qrConnected ? "#059669" : "#d97706" }} />
                      {qrConnected ? "CONECTADO" : qrChannelConfigured ? "DESCONECTADO" : "NO CONFIGURADO"}
                    </span>
                  </div>
                  {modoWhatsApp === "PROPIO_QR" && qrCodeImageUrl && (
                    <div style={{ display: "grid", gap: "8px", justifyItems: "start" }}>
                      <strong>Escaneá este código desde WhatsApp → Dispositivos vinculados</strong>
                      <img src={qrCodeImageUrl} alt="Código QR de conexión WhatsApp" style={{ width: "260px", height: "260px", background: "#fff", padding: "10px", borderRadius: "12px" }} />
                    </div>
                  )}
                  {editingId && modoWhatsApp === "PROPIO_API" && <WhatsAppTemplateEditor
                    templates={whatsappTemplates}
                    setTemplates={setWhatsappTemplates}
                    onSave={() => void saveTemplates("institution")}
                    saving={savingWhatsApp}
                  />}
                </>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" disabled={loading || uploadingLogo || uploadingMembrete}>
              {loading
                ? editingId
                  ? "Actualizando..."
                  : "Guardando..."
                : editingId
                  ? "Actualizar"
                  : "Guardar"}
            </button>

            <button
              type="button"
              onClick={handleCancelEdit}
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
        ) : null}
      </section>

      <section
        className="card"
        style={isFormExpanded ? { order: 1, padding: "14px", marginTop: "8px" } : undefined}
      >
        <h3 style={{ marginTop: 0, marginBottom: isFormExpanded ? "8px" : undefined }}>
          Instituciones {isFormExpanded ? `(${items.length})` : ""}
        </h3>

        {isSuperAdmin && (
          <>
            <form
              onSubmit={handleSearch}
              style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}
            >
              <input
                placeholder="Buscar por nombre, comercial, boleta o correo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "240px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db"
                }}
              />

              <button className="primary-btn" type="submit">
                Buscar
              </button>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  load("", incluirInactivas);
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
            </form>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <input
                type="checkbox"
                checked={incluirInactivas}
                onChange={(e) => setIncluirInactivas(e.target.checked)}
              />
              Incluir inactivas
            </label>
          </>
        )}

        <div
          className="table-wrap"
          style={isFormExpanded ? { maxHeight: "260px", overflow: "auto" } : undefined}
        >
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Logo</th>
                <th>Membrete</th>
                <th>Nombre</th>
                <th>Comercial</th>
                <th>Boleta</th>
                <th>Regional</th>
                <th>Circuito</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Código presupuestario</th>
                <th>Dirección exacta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.InstitucionId}>
                  <td>{item.InstitucionId}</td>
                  <td>
                    {item.LogoUrl ? (
                      <img
                        src={item.LogoUrl}
                        alt={item.Nombre}
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          background: "#fff"
                        }}
                      />
                    ) : (
                      ""
                    )}
                  </td>
                  <td>
                    {item.MembreteUrl ? (
                      <img
                        src={item.MembreteUrl}
                        alt={`Membrete ${item.Nombre}`}
                        style={{
                          width: "110px",
                          height: "48px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          background: "#fff"
                        }}
                      />
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{item.Nombre}</td>
                  <td>{item.NombreComercial ?? ""}</td>
                  <td>{item.NombreOficialBoleta ?? ""}</td>
                  <td>{item.RegionalEducativa ?? ""}</td>
                  <td>{item.CircuitoEducativo ?? ""}</td>
                  <td>{item.CorreoPrincipal ?? ""}</td>
                  <td>{item.TelefonoPrincipal ?? ""}</td>
                  <td>{item.CodigoPresupuestario ?? ""}</td>
                  <td>{item.DireccionExacta ?? ""}</td>
                  <td>{item.Activo ? "Activa" : "Inactiva"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        style={{
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          cursor: "pointer"
                        }}
                      >
                        Editar
                      </button>

                      {isSuperAdmin && item.Activo && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item.InstitucionId)}
                          style={{
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            color: "#b91c1c",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            cursor: "pointer"
                          }}
                        >
                          Desactivar
                        </button>
                      )}

                      {isSuperAdmin && !item.Activo && (
                        <button
                          type="button"
                          onClick={() => handleReactivate(item.InstitucionId)}
                          style={{
                            border: "1px solid #bbf7d0",
                            background: "#ecfdf3",
                            color: "#166534",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            cursor: "pointer"
                          }}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!items.length && (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center", padding: "16px" }}>
                    No hay instituciones registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


