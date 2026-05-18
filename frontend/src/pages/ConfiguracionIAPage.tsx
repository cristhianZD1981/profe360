import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type TipoGeneracionIA = {
  Id: number;
  Nombre: string;
  Descripcion?: string | null;
  Activo?: boolean;
  FechaCreacion?: string;
};

type PlantillaPromptIA = {
  Id: number;
  TipoGeneracionIAId: number;
  TipoGeneracionIANombre?: string;
  NombrePlantilla: string;
  IndicacionesSistema: string;
  ContextoBase?: string | null;
  ReglasConstruccion?: string | null;
  EstructuraSalida?: string | null;
  FormatoRespuesta?: string | null;
  UsuarioCreadorId?: number | null;
  EsPublica?: boolean;
  Activo: boolean;
  FechaCreacion?: string;
};

type FormState = {
  id: number | null;
  tipoGeneracionIAId: string;
  nombrePlantilla: string;
  indicacionesSistema: string;
  contextoBase: string;
  reglasConstruccion: string;
  estructuraSalida: string;
  formatoRespuesta: string;
  esPublica: boolean;
};

type TipoFormState = {
  nombre: string;
  descripcion: string;
};

type CopyFormState = {
  idOrigen: number | null;
  nombrePlantilla: string;
  esPublica: boolean;
};

const emptyForm: FormState = {
  id: null,
  tipoGeneracionIAId: "",
  nombrePlantilla: "",
  indicacionesSistema: "",
  contextoBase: "",
  reglasConstruccion: "",
  estructuraSalida: "",
  formatoRespuesta: "",
  esPublica: false
};

const emptyTipoForm: TipoFormState = {
  nombre: "",
  descripcion: ""
};

const emptyCopyForm: CopyFormState = {
  idOrigen: null,
  nombrePlantilla: "",
  esPublica: false
};

function unwrapData<T>(response: any): T {
  return response?.data?.data ?? response?.data;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

export default function ConfiguracionIAPage() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const currentUserId = Number(user?.userId || 0);
  const isAdminRole = roles.some((role) => ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"].includes(role));
  const isProfesorRole = roles.some((role) => ["PROFESOR", "PROFESOR_GUIA"].includes(role));
  const canCreatePlantillas = isAdminRole || isProfesorRole;
  const canCreateTipos = isAdminRole;

  const [tipos, setTipos] = useState<TipoGeneracionIA[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaPromptIA[]>([]);
  const [selectedTipoId, setSelectedTipoId] = useState<string>("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [tipoForm, setTipoForm] = useState<TipoFormState>(emptyTipoForm);
  const [copyForm, setCopyForm] = useState<CopyFormState>(emptyCopyForm);
  const [viewingPlantilla, setViewingPlantilla] = useState<PlantillaPromptIA | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTipoForm, setShowTipoForm] = useState(false);
  const [showCopyForm, setShowCopyForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTipo, setSavingTipo] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedTipo = useMemo(() => {
    return tipos.find((tipo) => String(tipo.Id) === selectedTipoId) || null;
  }, [tipos, selectedTipoId]);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function isOwner(plantilla: PlantillaPromptIA) {
    return currentUserId > 0 && Number(plantilla.UsuarioCreadorId || 0) === currentUserId;
  }

  function canEditPlantilla(plantilla: PlantillaPromptIA) {
    if (isAdminRole) return true;
    return isProfesorRole && isOwner(plantilla);
  }

  useEffect(() => {
    loadTipos();
  }, []);

  useEffect(() => {
    loadPlantillas();
  }, [selectedTipoId, incluirInactivas]);

  async function loadTipos() {
    try {
      const response = await api.get("/ia/tipos");
      const data = unwrapData<TipoGeneracionIA[]>(response) || [];
      setTipos(data);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los tipos de generacion IA"));
    }
  }

  async function loadPlantillas() {
    setLoading(true);
    setErrorMessage("");

    try {
      const params: any = {
        incluirInactivas
      };

      if (selectedTipoId) {
        params.tipoGeneracionIAId = selectedTipoId;
      }

      const response = await api.get("/ia/plantillas", { params });
      const data = unwrapData<PlantillaPromptIA[]>(response) || [];
      setPlantillas(data);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar las plantillas de Promt IA"));
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    if (!canCreatePlantillas) {
      setErrorMessage("No tenes permisos para crear plantillas");
      return;
    }

    setForm({
      ...emptyForm,
      tipoGeneracionIAId: selectedTipoId || "",
      esPublica: isAdminRole
    });
    clearMessages();
    setShowForm(true);
    setShowTipoForm(false);
    setShowCopyForm(false);
    setViewingPlantilla(null);
  }

  function startCreateTipo() {
    if (!canCreateTipos) {
      setErrorMessage("Solo el perfil administrativo puede crear tipos");
      return;
    }

    setTipoForm(emptyTipoForm);
    clearMessages();
    setShowTipoForm(true);
    setShowForm(false);
    setShowCopyForm(false);
    setViewingPlantilla(null);
  }

  function startEdit(plantilla: PlantillaPromptIA) {
    if (!canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes editar plantillas creadas por vos");
      return;
    }

    setForm({
      id: plantilla.Id,
      tipoGeneracionIAId: String(plantilla.TipoGeneracionIAId),
      nombrePlantilla: plantilla.NombrePlantilla || "",
      indicacionesSistema: plantilla.IndicacionesSistema || "",
      contextoBase: plantilla.ContextoBase || "",
      reglasConstruccion: plantilla.ReglasConstruccion || "",
      estructuraSalida: plantilla.EstructuraSalida || "",
      formatoRespuesta: plantilla.FormatoRespuesta || "",
      esPublica: !!plantilla.EsPublica
    });
    clearMessages();
    setShowForm(true);
    setShowTipoForm(false);
    setShowCopyForm(false);
    setViewingPlantilla(null);
  }

  function startView(plantilla: PlantillaPromptIA) {
    clearMessages();
    setViewingPlantilla(plantilla);
    setShowForm(false);
    setShowTipoForm(false);
    setShowCopyForm(false);
  }

  function startCopy(plantilla: PlantillaPromptIA) {
    setCopyForm({
      idOrigen: plantilla.Id,
      nombrePlantilla: `${plantilla.NombrePlantilla} - copia`,
      esPublica: isAdminRole ? !!plantilla.EsPublica : false
    });
    clearMessages();
    setShowCopyForm(true);
    setShowForm(false);
    setShowTipoForm(false);
    setViewingPlantilla(null);
  }

  function cancelForm() {
    setForm(emptyForm);
    setShowForm(false);
    clearMessages();
  }

  function cancelTipoForm() {
    setTipoForm(emptyTipoForm);
    setShowTipoForm(false);
    clearMessages();
  }

  function cancelCopyForm() {
    setCopyForm(emptyCopyForm);
    setShowCopyForm(false);
    clearMessages();
  }

  async function handleTipoSubmit(event: FormEvent) {
    event.preventDefault();
    clearMessages();

    if (!tipoForm.nombre.trim()) {
      setErrorMessage("Indica el nombre del tipo de plantilla");
      return;
    }

    setSavingTipo(true);

    try {
      const response = await api.post("/ia/tipos", {
        nombre: tipoForm.nombre.trim(),
        descripcion: tipoForm.descripcion.trim()
      });

      const data = unwrapData<{ id?: number }>(response);
      setMessage("Tipo de plantilla creado correctamente");
      setTipoForm(emptyTipoForm);
      setShowTipoForm(false);
      await loadTipos();

      if (data?.id) {
        setSelectedTipoId(String(data.id));
      }
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo crear el tipo de plantilla IA"));
    } finally {
      setSavingTipo(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearMessages();

    if (!form.tipoGeneracionIAId) {
      setErrorMessage("Selecciona el tipo de generacion IA");
      return;
    }

    if (!form.nombrePlantilla.trim()) {
      setErrorMessage("Indica el nombre de la plantilla");
      return;
    }

    if (!form.indicacionesSistema.trim()) {
      setErrorMessage("Indica las instrucciones principales del sistema");
      return;
    }

    const payload = {
      tipoGeneracionIAId: Number(form.tipoGeneracionIAId),
      nombrePlantilla: form.nombrePlantilla.trim(),
      indicacionesSistema: form.indicacionesSistema.trim(),
      contextoBase: form.contextoBase.trim(),
      reglasConstruccion: form.reglasConstruccion.trim(),
      estructuraSalida: form.estructuraSalida.trim(),
      formatoRespuesta: form.formatoRespuesta.trim(),
      esPublica: form.esPublica
    };

    setSaving(true);

    try {
      if (form.id) {
        await api.put(`/ia/plantillas/${form.id}`, payload);
        setMessage("Plantilla actualizada correctamente");
      } else {
        await api.post("/ia/plantillas", payload);
        setMessage("Plantilla creada correctamente");
      }

      setShowForm(false);
      setForm(emptyForm);
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar la plantilla IA"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopySubmit(event: FormEvent) {
    event.preventDefault();
    clearMessages();

    if (!copyForm.idOrigen) {
      setErrorMessage("Selecciona la plantilla que deseas copiar");
      return;
    }

    if (!copyForm.nombrePlantilla.trim()) {
      setErrorMessage("Indica el nombre de la nueva plantilla");
      return;
    }

    setCopying(true);

    try {
      const response = await api.post(`/ia/plantillas/${copyForm.idOrigen}/copiar`, {
        nombrePlantilla: copyForm.nombrePlantilla.trim(),
        esPublica: copyForm.esPublica
      });

      setMessage(response.data?.message || "Plantilla copiada correctamente");
      setCopyForm(emptyCopyForm);
      setShowCopyForm(false);
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo copiar la plantilla"));
    } finally {
      setCopying(false);
    }
  }

  async function toggleEstado(plantilla: PlantillaPromptIA) {
    if (!canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes cambiar el estado de plantillas creadas por vos");
      return;
    }

    clearMessages();

    try {
      await api.patch(`/ia/plantillas/${plantilla.Id}/estado`, {
        activo: !plantilla.Activo
      });
      setMessage(plantilla.Activo ? "Plantilla desactivada" : "Plantilla activada");
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo cambiar el estado de la plantilla"));
    }
  }

  async function eliminarPlantilla(plantilla: PlantillaPromptIA) {
    if (!canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes eliminar plantillas creadas por vos");
      return;
    }

    clearMessages();

    const confirmar = window.confirm(`Seguro que deseas eliminar la plantilla "${plantilla.NombrePlantilla}"?\n\nLa plantilla quedara inactiva.`);
    if (!confirmar) return;

    try {
      await api.delete(`/ia/plantillas/${plantilla.Id}`);
      setMessage("Plantilla eliminada correctamente");
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo eliminar la plantilla"));
    }
  }

  async function descargarPlantillaWord(plantilla: PlantillaPromptIA) {
    clearMessages();
    try {
      const response = await api.get(`/ia/plantillas/${plantilla.Id}/exportar-word`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = String(plantilla.NombrePlantilla || "plantilla_ia")
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "_");
      link.href = url;
      link.download = `${safeName || "plantilla_ia"}_${plantilla.Id}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Plantilla descargada en Word");
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo descargar la plantilla en Word"));
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)"
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: "6px",
    color: "#111827",
    fontWeight: 700,
    fontSize: "14px"
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "11px 12px",
    color: "#111827",
    background: "#ffffff",
    fontSize: "14px"
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: "100px",
    resize: "vertical" as const,
    fontFamily: "inherit",
    lineHeight: 1.4
  };

  const secondaryButtonStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    borderRadius: "10px",
    padding: "9px 12px",
    cursor: "pointer",
    color: "#0f172a",
    fontWeight: 600
  };

  const dangerButtonStyle: React.CSSProperties = {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    color: "#991b1b",
    fontWeight: 700
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...secondaryButtonStyle,
    opacity: 0.45,
    cursor: "not-allowed"
  };

  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, color: "#0f172a" }}>Promt IA</h2>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            Administra plantillas para planeamientos, evaluaciones e indicadores. Si una plantilla es privada, solo su creador puede usarla.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={startCreateTipo} style={!canCreateTipos ? disabledButtonStyle : secondaryButtonStyle} disabled={!canCreateTipos}>
            Nuevo tipo
          </button>
          <button className="primary-btn" type="button" onClick={startCreate} disabled={!canCreatePlantillas}>
            Nueva plantilla
          </button>
        </div>
      </div>

      {message ? (
        <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {errorMessage}
        </div>
      ) : null}

      <div style={{ ...cardStyle, display: "grid", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: "12px", alignItems: "end" }}>
          <label style={labelStyle}>
            Filtrar por tipo
            <select value={selectedTipoId} onChange={(e) => setSelectedTipoId(e.target.value)} style={inputStyle}>
              <option value="">Todos los tipos</option>
              {tipos.map((tipo) => (
                <option key={tipo.Id} value={tipo.Id}>
                  {tipo.Nombre}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#111827", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={incluirInactivas}
              onChange={(e) => setIncluirInactivas(e.target.checked)}
            />
            Ver inactivas
          </label>
        </div>

        {selectedTipo ? (
          <div style={{ color: "#334155", fontSize: "14px" }}>
            Tipo seleccionado: <strong>{selectedTipo.Nombre}</strong>
          </div>
        ) : null}
      </div>

      {showTipoForm ? (
        <form onSubmit={handleTipoSubmit} style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#0f172a" }}>Nuevo tipo de plantilla IA</h3>
            <button type="button" onClick={cancelTipoForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            <label style={labelStyle}>
              Nombre del tipo
              <input
                value={tipoForm.nombre}
                onChange={(e) => setTipoForm((prev) => ({ ...prev, nombre: e.target.value }))}
                style={inputStyle}
                placeholder="Ejemplo: Diagnostico, Proyecto"
              />
            </label>

            <label style={labelStyle}>
              Descripcion
              <input
                value={tipoForm.descripcion}
                onChange={(e) => setTipoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                style={inputStyle}
                placeholder="Uso general de este tipo"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" type="submit" disabled={savingTipo}>
              {savingTipo ? "Guardando..." : "Guardar tipo"}
            </button>
            <button type="button" onClick={cancelTipoForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {showForm ? (
        <form onSubmit={handleSubmit} style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#0f172a" }}>
              {form.id ? "Editar plantilla de Promt IA" : "Nueva plantilla de Promt IA"}
            </h3>
            <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            <label style={labelStyle}>
              Tipo de generacion
              <select value={form.tipoGeneracionIAId} onChange={(e) => setForm((prev) => ({ ...prev, tipoGeneracionIAId: e.target.value }))} style={inputStyle}>
                <option value="">Seleccione</option>
                {tipos.map((tipo) => (
                  <option key={tipo.Id} value={tipo.Id}>
                    {tipo.Nombre}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Nombre de la plantilla
              <input value={form.nombrePlantilla} onChange={(e) => setForm((prev) => ({ ...prev, nombrePlantilla: e.target.value }))} style={inputStyle} />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#111827", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={form.esPublica}
              onChange={(e) => setForm((prev) => ({ ...prev, esPublica: e.target.checked }))}
            />
            Plantilla publica (si no se marca, queda privada)
          </label>

          <label style={labelStyle}>
            Indicaciones del sistema
            <textarea value={form.indicacionesSistema} onChange={(e) => setForm((prev) => ({ ...prev, indicacionesSistema: e.target.value }))} style={textareaStyle} />
          </label>

          <label style={labelStyle}>
            Contexto base
            <textarea value={form.contextoBase} onChange={(e) => setForm((prev) => ({ ...prev, contextoBase: e.target.value }))} style={textareaStyle} />
          </label>

          <label style={labelStyle}>
            Reglas de construccion
            <textarea value={form.reglasConstruccion} onChange={(e) => setForm((prev) => ({ ...prev, reglasConstruccion: e.target.value }))} style={{ ...textareaStyle, minHeight: "130px" }} />
          </label>

          <label style={labelStyle}>
            Estructura de salida
            <textarea value={form.estructuraSalida} onChange={(e) => setForm((prev) => ({ ...prev, estructuraSalida: e.target.value }))} style={{ ...textareaStyle, minHeight: "130px" }} />
          </label>

          <label style={labelStyle}>
            Formato de respuesta
            <textarea value={form.formatoRespuesta} onChange={(e) => setForm((prev) => ({ ...prev, formatoRespuesta: e.target.value }))} style={textareaStyle} />
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar plantilla"}
            </button>
            <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {showCopyForm ? (
        <form onSubmit={handleCopySubmit} style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#0f172a" }}>Copiar plantilla de Promt IA</h3>
            <button type="button" onClick={cancelCopyForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>

          <label style={labelStyle}>
            Nombre de la nueva plantilla
            <input
              value={copyForm.nombrePlantilla}
              onChange={(e) => setCopyForm((prev) => ({ ...prev, nombrePlantilla: e.target.value }))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#111827", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={copyForm.esPublica}
              onChange={(e) => setCopyForm((prev) => ({ ...prev, esPublica: e.target.checked }))}
            />
            Hacer publica la copia
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" type="submit" disabled={copying}>
              {copying ? "Copiando..." : "Copiar plantilla"}
            </button>
            <button type="button" onClick={cancelCopyForm} style={secondaryButtonStyle}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {viewingPlantilla ? (
        <section style={{ ...cardStyle, display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, color: "#0f172a" }}>Detalle de plantilla</h3>
            <button type="button" onClick={() => setViewingPlantilla(null)} style={secondaryButtonStyle}>
              Cerrar
            </button>
          </div>

          <div style={{ color: "#334155", fontSize: "14px" }}>
            <strong>{viewingPlantilla.NombrePlantilla}</strong> | {viewingPlantilla.EsPublica ? "Publica" : "Privada"}
          </div>

          <label style={labelStyle}>
            Indicaciones del sistema
            <textarea value={viewingPlantilla.IndicacionesSistema || ""} readOnly style={textareaStyle} />
          </label>
          <label style={labelStyle}>
            Contexto base
            <textarea value={viewingPlantilla.ContextoBase || ""} readOnly style={textareaStyle} />
          </label>
          <label style={labelStyle}>
            Reglas de construccion
            <textarea value={viewingPlantilla.ReglasConstruccion || ""} readOnly style={textareaStyle} />
          </label>
          <label style={labelStyle}>
            Estructura de salida
            <textarea value={viewingPlantilla.EstructuraSalida || ""} readOnly style={textareaStyle} />
          </label>
          <label style={labelStyle}>
            Formato de respuesta
            <textarea value={viewingPlantilla.FormatoRespuesta || ""} readOnly style={textareaStyle} />
          </label>
        </section>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Plantillas registradas</h3>
          <span style={{ color: "#334155", fontSize: "14px", fontWeight: 600 }}>
            {loading ? "Cargando..." : `${plantillas.length} plantilla(s)`}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1080px" }}>
            <thead>
              <tr style={{ background: "#e2e8f0", color: "#0f172a", textAlign: "left" }}>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Tipo</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Plantilla</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Visibilidad</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Estado</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Creacion</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #cbd5e1", fontWeight: 800 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plantillas.map((plantilla) => {
                const canEdit = canEditPlantilla(plantilla);
                return (
                  <tr key={plantilla.Id}>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb", color: "#0f172a", fontWeight: 500 }}>
                      {plantilla.TipoGeneracionIANombre || plantilla.TipoGeneracionIAId}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb", color: "#0f172a" }}>
                      <strong style={{ color: "#1e293b" }}>{plantilla.NombrePlantilla}</strong>
                      <div style={{ color: "#475569", fontSize: "13px", marginTop: "4px", maxWidth: "440px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {plantilla.IndicacionesSistema}
                      </div>
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
                      <span style={{ padding: "5px 9px", borderRadius: "999px", background: plantilla.EsPublica ? "#dcfce7" : "#f1f5f9", color: plantilla.EsPublica ? "#166534" : "#334155", fontWeight: 800, fontSize: "13px" }}>
                        {plantilla.EsPublica ? "Publica" : "Privada"}
                      </span>
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
                      <span style={{ padding: "5px 9px", borderRadius: "999px", background: plantilla.Activo ? "#dcfce7" : "#f1f5f9", color: plantilla.Activo ? "#166534" : "#475569", fontWeight: 800, fontSize: "13px" }}>
                        {plantilla.Activo ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb", color: "#334155" }}>
                      {formatDate(plantilla.FechaCreacion)}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => startView(plantilla)} style={secondaryButtonStyle}>
                          Ver
                        </button>
                        <button type="button" onClick={() => startCopy(plantilla)} style={secondaryButtonStyle}>
                          Copiar
                        </button>
                        <button type="button" onClick={() => descargarPlantillaWord(plantilla)} style={secondaryButtonStyle}>
                          Descargar Word
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(plantilla)}
                          style={canEdit ? secondaryButtonStyle : disabledButtonStyle}
                          disabled={!canEdit}
                          title={!canEdit ? "Solo podes editar plantillas creadas por vos" : undefined}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleEstado(plantilla)}
                          style={canEdit ? secondaryButtonStyle : disabledButtonStyle}
                          disabled={!canEdit}
                          title={!canEdit ? "Solo podes activar o desactivar plantillas creadas por vos" : undefined}
                        >
                          {plantilla.Activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarPlantilla(plantilla)}
                          style={canEdit ? dangerButtonStyle : { ...dangerButtonStyle, opacity: 0.45, cursor: "not-allowed" }}
                          disabled={!canEdit}
                          title={!canEdit ? "Solo podes eliminar plantillas creadas por vos" : undefined}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && plantillas.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "18px", color: "#475569", textAlign: "center" }}>
                    No hay plantillas registradas con los filtros seleccionados
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}



