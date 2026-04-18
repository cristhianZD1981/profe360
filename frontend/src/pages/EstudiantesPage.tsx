import { FormEvent, useMemo, useState, useEffect } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type Student = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string;
  SegundoApellido: string;
  FechaNacimiento: string | null;
  Sexo: string | null;
  Correo: string | null;
  Telefono: string | null;
  FotoUrl: string | null;
  CodigoCarnet: string | null;
  QrContenido: string | null;
  Nacionalidad: string | null;
  Adecuacion: string | null;
  Discapacidad: string | null;
  Enfermedad: string | null;
  RutaTransporteHabitual: string | null;
  ObservacionMedica: string | null;
  Activo?: boolean;
};

type EncargadoForm = {
  tipoEncargado: "MADRE" | "PADRE" | "ENCARGADO";
  identificacion: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string;
  correo: string;
  telefono: string;
  direccionExacta: string;
  parentesco: string;
  viveConEstudiante: boolean;
  esPrincipal: boolean;
  recibeNotificaciones: boolean;
};

type DetalleEncargado = {
  EstudianteEncargadoId?: number;
  Parentesco?: string | null;
  EsPrincipal?: boolean;
  RecibeNotificaciones?: boolean;
  ViveConEstudiante?: boolean;
  VigenciaDesde?: string | null;
  VigenciaHasta?: string | null;
  Activo?: boolean;
  EncargadoId?: number;
  TipoEncargado?: "MADRE" | "PADRE" | "ENCARGADO";
  Identificacion?: string | null;
  Nombre?: string | null;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  Correo?: string | null;
  Telefono?: string | null;
  DireccionExacta?: string | null;
};

type StudentDetalleResponse = {
  estudiante: Student;
  encargados: DetalleEncargado[];
};

type ImportResultRow = {
  fila: number;
  identificacion: string;
  estado: "OK" | "ERROR";
  motivo: string;
};

const emptyEncargado = (
  tipo: "MADRE" | "PADRE" | "ENCARGADO"
): EncargadoForm => ({
  tipoEncargado: tipo,
  identificacion: "",
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  correo: "",
  telefono: "",
  direccionExacta: "",
  parentesco:
    tipo === "MADRE" ? "Madre" : tipo === "PADRE" ? "Padre" : "Encargado",
  viveConEstudiante: false,
  esPrincipal: tipo === "MADRE",
  recibeNotificaciones: true
});

const initialForm = {
  identificacion: "",
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  fechaNacimiento: "",
  correo: "",
  telefono: "",
  sexo: "",
  fotoUrl: "",
  nacionalidad: "",
  adecuacion: "",
  discapacidad: "",
  enfermedad: "",
  rutaTransporteHabitual: "",
  observacionMedica: ""
};

function getStudentFullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.Nombre, item.PrimerApellido || "", item.SegundoApellido || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontWeight: 700
      }}
    >
      {children}
    </div>
  );
}


function EncargadoBlockStable({
  title,
  value,
  onChange
}: {
  title: string;
  value: EncargadoForm;
  onChange: (next: EncargadoForm) => void;
}) {
  return (
    <section
      style={{
        border: "1px solid #dbe4f0",
        borderRadius: "16px",
        padding: "14px",
        display: "grid",
        gap: "12px",
        background: "rgba(255,255,255,0.04)"
      }}
    >
      <h4 style={{ margin: 0 }}>{title}</h4>
      <label>Identificación<input value={value.identificacion} onChange={(e) => onChange({ ...value, identificacion: e.target.value })} /></label>
      <label>Nombre<input value={value.nombre} onChange={(e) => onChange({ ...value, nombre: e.target.value })} /></label>
      <label>Primer apellido<input value={value.primerApellido} onChange={(e) => onChange({ ...value, primerApellido: e.target.value })} /></label>
      <label>Segundo apellido<input value={value.segundoApellido} onChange={(e) => onChange({ ...value, segundoApellido: e.target.value })} /></label>
      <label>Correo<input type="email" value={value.correo} onChange={(e) => onChange({ ...value, correo: e.target.value })} /></label>
      <label>Teléfono<input value={value.telefono} onChange={(e) => onChange({ ...value, telefono: e.target.value })} /></label>
      <label>Dirección exacta<textarea rows={2} value={value.direccionExacta} onChange={(e) => onChange({ ...value, direccionExacta: e.target.value })} /></label>
      <label>Parentesco<input value={value.parentesco} onChange={(e) => onChange({ ...value, parentesco: e.target.value })} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.viveConEstudiante} onChange={(e) => onChange({ ...value, viveConEstudiante: e.target.checked })} />Vive con el estudiante</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.esPrincipal} onChange={(e) => onChange({ ...value, esPrincipal: e.target.checked })} />Encargado principal</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.recibeNotificaciones} onChange={(e) => onChange({ ...value, recibeNotificaciones: e.target.checked })} />Recibe notificaciones</label>
    </section>
  );
}

function DetailCardStable({ title, encargado }: { title: string; encargado: DetalleEncargado | null; }) {
  return (
    <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: "14px", padding: "12px", display: "grid", gap: "8px", background: "rgba(255,255,255,0.04)" }}>
      <strong>{title}</strong>
      {encargado ? (
        <>
          <div><strong>Nombre:</strong> {getStudentFullName({ Nombre: encargado.Nombre || "", PrimerApellido: encargado.PrimerApellido || "", SegundoApellido: encargado.SegundoApellido || "" })}</div>
          <div><strong>Identificación:</strong> {encargado.Identificacion || ""}</div>
          <div><strong>Correo:</strong> {encargado.Correo || ""}</div>
          <div><strong>Teléfono:</strong> {encargado.Telefono || ""}</div>
          <div><strong>Dirección:</strong> {encargado.DireccionExacta || ""}</div>
          <div><strong>Parentesco:</strong> {encargado.Parentesco || ""}</div>
          <div><strong>Vive con el estudiante:</strong> {encargado.ViveConEstudiante ? "Sí" : "No"}</div>
          <div><strong>Principal:</strong> {encargado.EsPrincipal ? "Sí" : "No"}</div>
          <div><strong>Recibe notificaciones:</strong> {encargado.RecibeNotificaciones ? "Sí" : "No"}</div>
        </>
      ) : <div style={{ opacity: 0.8 }}>No hay datos registrados</div>}
    </section>
  );
}

export default function EstudiantesPage() {
  const { user } = useAuth();

  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reactivableId, setReactivableId] = useState<number | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [madreForm, setMadreForm] = useState<EncargadoForm>(
    emptyEncargado("MADRE")
  );
  const [padreForm, setPadreForm] = useState<EncargadoForm>(
    emptyEncargado("PADRE")
  );
  const [encargadoForm, setEncargadoForm] = useState<EncargadoForm>(
    emptyEncargado("ENCARGADO")
  );

  const [detalleVisibleId, setDetalleVisibleId] = useState<number | null>(null);
  const [detalleCargandoId, setDetalleCargandoId] = useState<number | null>(null);
  const [detalleEstudiante, setDetalleEstudiante] = useState<Student | null>(null);
  const [detalleEncargados, setDetalleEncargados] = useState<DetalleEncargado[]>([]);

  const [archivoImportacion, setArchivoImportacion] = useState<File | null>(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRegistros: number;
    totalOk: number;
    totalError: number;
    resultados: ImportResultRow[];
  } | null>(null);

  const [dominioCorreoEstudiante, setDominioCorreoEstudiante] = useState("@est.mep.go.cr");

  const roles = user?.roles || [];
  const canManageStudents =
    roles.includes("SUPER_ADMIN") ||
    roles.includes("ADMIN_INSTITUCIONAL") ||
    roles.includes("ADMINISTRATIVO");

  const detalleMadre = useMemo(
    () => detalleEncargados.find((x) => x.TipoEncargado === "MADRE") || null,
    [detalleEncargados]
  );
  const detallePadre = useMemo(
    () => detalleEncargados.find((x) => x.TipoEncargado === "PADRE") || null,
    [detalleEncargados]
  );
  const detalleEncargado = useMemo(
    () => detalleEncargados.find((x) => x.TipoEncargado === "ENCARGADO") || null,
    [detalleEncargados]
  );

  async function load(query = "", verInactivos = incluirInactivos) {
    try {
      const response = await api.get("/estudiantes", {
        params: {
          q: query,
          incluirInactivos: verInactivos
        }
      });
      setItems(response.data.data ?? []);
    } catch (error) {
      console.error("Error cargando estudiantes:", error);
      setErrorMessage("No se pudo cargar el listado de estudiantes");
    }
  }

  useEffect(() => {
    load("", incluirInactivos);
    api.get("/academico/configuracion-correo-estudiante").then((response) => {
      const data = response.data?.data || {};
      setDominioCorreoEstudiante(String(data?.dominio || "@est.mep.go.cr"));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const limpio = String(form.identificacion || "").replace(/\s+/g, "").trim();
    const dominio = String(dominioCorreoEstudiante || "@est.mep.go.cr").trim();
    const dominioNormalizado = dominio.startsWith("@") ? dominio : `@${dominio}`;
    setForm((prev) => ({ ...prev, correo: limpio ? `${limpio}${dominioNormalizado}`.toLowerCase() : "" }));
  }, [form.identificacion, dominioCorreoEstudiante]);

  function resetAllForms() {
    setForm(initialForm);
    setMadreForm(emptyEncargado("MADRE"));
    setPadreForm(emptyEncargado("PADRE"));
    setEncargadoForm(emptyEncargado("ENCARGADO"));
    setEditingId(null);
    setReactivableId(null);
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function handlePhotoUpload(file: File) {
    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para modificar estudiantes");
      return;
    }

    setUploadingPhoto(true);
    clearMessages();

    try {
      const formData = new FormData();
      formData.append("archivo", file);

      const response = await api.post("/archivos/subir", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const secureUrl =
        response.data?.data?.secure_url || response.data?.data?.url || "";

      if (!secureUrl) {
        throw new Error("No se recibió la URL de la foto");
      }

      setForm((prev) => ({
        ...prev,
        fotoUrl: secureUrl
      }));

      setMessage("Foto subida correctamente");
    } catch (error: any) {
      console.error("Error subiendo foto:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo subir la foto");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function buildEncargadosPayload() {
    return [madreForm, padreForm, encargadoForm].map((item) => ({
      tipoEncargado: item.tipoEncargado,
      identificacion: item.identificacion || null,
      nombre: item.nombre || null,
      primerApellido: item.primerApellido || null,
      segundoApellido: item.segundoApellido || null,
      correo: item.correo || null,
      telefono: item.telefono || null,
      direccionExacta: item.direccionExacta || null,
      parentesco: item.parentesco || null,
      viveConEstudiante: item.viveConEstudiante,
      esPrincipal: item.esPrincipal,
      recibeNotificaciones: item.recibeNotificaciones
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para incluir o modificar estudiantes");
      return;
    }

    setLoading(true);
    clearMessages();
    setReactivableId(null);

    try {
      const payload = {
        identificacion: form.identificacion,
        nombre: form.nombre,
        primerApellido: form.primerApellido,
        segundoApellido: form.segundoApellido,
        fechaNacimiento: form.fechaNacimiento || null,
        correo: form.correo || null,
        telefono: form.telefono || null,
        sexo: form.sexo || null,
        fotoUrl: form.fotoUrl || null,
        nacionalidad: form.nacionalidad || null,
        adecuacion: form.adecuacion || null,
        discapacidad: form.discapacidad || null,
        enfermedad: form.enfermedad || null,
        rutaTransporteHabitual: form.rutaTransporteHabitual || null,
        observacionMedica: form.observacionMedica || null,
        encargados: buildEncargadosPayload()
      };

      if (editingId) {
        await api.put(`/estudiantes/${editingId}`, payload);
        setMessage("Estudiante actualizado correctamente");
      } else {
        await api.post("/estudiantes", payload);
        setMessage("Estudiante guardado correctamente");
      }

      resetAllForms();
      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error guardando estudiante:", error);

      const backendCode = error?.response?.data?.code;
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "No se pudo guardar el estudiante";

      if (backendCode === "ESTUDIANTE_INACTIVO") {
        setReactivableId(error?.response?.data?.estudianteId || null);
      }

      setErrorMessage(backendMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleEdit(item: Student) {
    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para editar estudiantes");
      return;
    }

    setLoadingDetalle(true);
    clearMessages();
    setReactivableId(null);

    try {
      const response = await api.get(`/estudiantes/${item.EstudianteId}/detalle`);
      const detalle: StudentDetalleResponse = response.data?.data;

      const estudiante = detalle?.estudiante;
      const encargados = detalle?.encargados || [];

      setEditingId(item.EstudianteId);
      setForm({
        identificacion: estudiante?.Identificacion || "",
        nombre: estudiante?.Nombre || "",
        primerApellido: estudiante?.PrimerApellido || "",
        segundoApellido: estudiante?.SegundoApellido || "",
        fechaNacimiento: estudiante?.FechaNacimiento
          ? String(estudiante.FechaNacimiento).slice(0, 10)
          : "",
        correo: estudiante?.Correo || "",
        telefono: estudiante?.Telefono || "",
        sexo: estudiante?.Sexo || "",
        fotoUrl: estudiante?.FotoUrl || "",
        nacionalidad: estudiante?.Nacionalidad || "",
        adecuacion: estudiante?.Adecuacion || "",
        discapacidad: estudiante?.Discapacidad || "",
        enfermedad: estudiante?.Enfermedad || "",
        rutaTransporteHabitual: estudiante?.RutaTransporteHabitual || "",
        observacionMedica: estudiante?.ObservacionMedica || ""
      });

      const madre = encargados.find((x) => x.TipoEncargado === "MADRE");
      const padre = encargados.find((x) => x.TipoEncargado === "PADRE");
      const encargado = encargados.find((x) => x.TipoEncargado === "ENCARGADO");

      setMadreForm(
        madre
          ? {
              tipoEncargado: "MADRE",
              identificacion: madre.Identificacion || "",
              nombre: madre.Nombre || "",
              primerApellido: madre.PrimerApellido || "",
              segundoApellido: madre.SegundoApellido || "",
              correo: madre.Correo || "",
              telefono: madre.Telefono || "",
              direccionExacta: madre.DireccionExacta || "",
              parentesco: madre.Parentesco || "Madre",
              viveConEstudiante: !!madre.ViveConEstudiante,
              esPrincipal: !!madre.EsPrincipal,
              recibeNotificaciones:
                madre.RecibeNotificaciones === false ? false : true
            }
          : emptyEncargado("MADRE")
      );

      setPadreForm(
        padre
          ? {
              tipoEncargado: "PADRE",
              identificacion: padre.Identificacion || "",
              nombre: padre.Nombre || "",
              primerApellido: padre.PrimerApellido || "",
              segundoApellido: padre.SegundoApellido || "",
              correo: padre.Correo || "",
              telefono: padre.Telefono || "",
              direccionExacta: padre.DireccionExacta || "",
              parentesco: padre.Parentesco || "Padre",
              viveConEstudiante: !!padre.ViveConEstudiante,
              esPrincipal: !!padre.EsPrincipal,
              recibeNotificaciones:
                padre.RecibeNotificaciones === false ? false : true
            }
          : emptyEncargado("PADRE")
      );

      setEncargadoForm(
        encargado
          ? {
              tipoEncargado: "ENCARGADO",
              identificacion: encargado.Identificacion || "",
              nombre: encargado.Nombre || "",
              primerApellido: encargado.PrimerApellido || "",
              segundoApellido: encargado.SegundoApellido || "",
              correo: encargado.Correo || "",
              telefono: encargado.Telefono || "",
              direccionExacta: encargado.DireccionExacta || "",
              parentesco: encargado.Parentesco || "Encargado",
              viveConEstudiante: !!encargado.ViveConEstudiante,
              esPrincipal: !!encargado.EsPrincipal,
              recibeNotificaciones:
                encargado.RecibeNotificaciones === false ? false : true
            }
          : emptyEncargado("ENCARGADO")
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      console.error("Error cargando detalle del estudiante:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          "No se pudo cargar el detalle del estudiante"
      );
    } finally {
      setLoadingDetalle(false);
    }
  }

  function handleCancelEdit() {
    resetAllForms();
    clearMessages();
  }

  async function handleDelete(id: number) {
    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para desactivar estudiantes");
      return;
    }

    const confirmado = window.confirm("¿Deseás desactivar este estudiante?");
    if (!confirmado) return;

    clearMessages();
    setReactivableId(null);

    try {
      await api.delete(`/estudiantes/${id}`);
      setMessage("Estudiante desactivado correctamente");

      if (editingId === id) {
        resetAllForms();
      }

      if (detalleVisibleId === id) {
        setDetalleVisibleId(null);
        setDetalleEstudiante(null);
        setDetalleEncargados([]);
      }

      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error desactivando estudiante:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo desactivar el estudiante"
      );
    }
  }

  async function handleReactivate(id?: number) {
    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para reactivar estudiantes");
      return;
    }

    const finalId = id || reactivableId;
    if (!finalId) return;

    clearMessages();

    try {
      await api.patch(`/estudiantes/${finalId}/reactivar`);
      setMessage("Estudiante reactivado correctamente");
      resetAllForms();
      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error reactivando estudiante:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo reactivar el estudiante"
      );
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search, incluirInactivos);
  }

  async function handleVerDetalle(item: Student) {
    if (detalleVisibleId === item.EstudianteId) {
      setDetalleVisibleId(null);
      setDetalleEstudiante(null);
      setDetalleEncargados([]);
      return;
    }

    setDetalleCargandoId(item.EstudianteId);
    clearMessages();

    try {
      const response = await api.get(`/estudiantes/${item.EstudianteId}/detalle`);
      const detalle: StudentDetalleResponse = response.data?.data;

      setDetalleVisibleId(item.EstudianteId);
      setDetalleEstudiante(detalle?.estudiante || null);
      setDetalleEncargados(detalle?.encargados || []);
    } catch (error: any) {
      console.error("Error cargando detalle para visualización:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar el detalle del estudiante"
      );
    } finally {
      setDetalleCargandoId(null);
    }
  }

  async function handleDescargarPlantilla() {
    try {
      clearMessages();
      const response = await api.get("/estudiantes/plantilla-excel", {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_estudiantes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Plantilla descargada correctamente");
    } catch (error: any) {
      console.error("Error descargando plantilla:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo descargar la plantilla"
      );
    }
  }

  async function handleImportarExcel(e: FormEvent) {
    e.preventDefault();

    if (!archivoImportacion) {
      setErrorMessage("Debés seleccionar un archivo Excel");
      return;
    }

    setImportandoExcel(true);
    clearMessages();
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportacion);

      const response = await api.post("/estudiantes/importar-excel", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      setImportResult(response.data?.data || null);
      setMessage("Importación procesada correctamente");
      setArchivoImportacion(null);
      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error importando Excel:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo importar el archivo Excel"
      );
    } finally {
      setImportandoExcel(false);
    }
  }

  function EncargadoBlock({
    title,
    value,
    onChange
  }: {
    title: string;
    value: EncargadoForm;
    onChange: (next: EncargadoForm) => void;
  }) {
    return (
      <section
        style={{
          border: "1px solid #dbe4f0",
          borderRadius: "16px",
          padding: "14px",
          display: "grid",
          gap: "12px",
          background: "rgba(255,255,255,0.04)"
        }}
      >
        <h4 style={{ margin: 0 }}>{title}</h4>

        <label>
          Identificación
          <input
            value={value.identificacion}
            onChange={(e) =>
              onChange({ ...value, identificacion: e.target.value })
            }
          />
        </label>

        <label>
          Nombre
          <input
            value={value.nombre}
            onChange={(e) => onChange({ ...value, nombre: e.target.value })}
          />
        </label>

        <label>
          Primer apellido
          <input
            value={value.primerApellido}
            onChange={(e) =>
              onChange({ ...value, primerApellido: e.target.value })
            }
          />
        </label>

        <label>
          Segundo apellido
          <input
            value={value.segundoApellido}
            onChange={(e) =>
              onChange({ ...value, segundoApellido: e.target.value })
            }
          />
        </label>

        <label>
          Correo
          <input
            type="email"
            value={value.correo}
            onChange={(e) => onChange({ ...value, correo: e.target.value })}
          />
        </label>

        <label>
          Teléfono
          <input
            value={value.telefono}
            onChange={(e) => onChange({ ...value, telefono: e.target.value })}
          />
        </label>

        <label>
          Dirección exacta
          <textarea
            rows={2}
            value={value.direccionExacta}
            onChange={(e) =>
              onChange({ ...value, direccionExacta: e.target.value })
            }
          />
        </label>

        <label>
          Parentesco
          <input
            value={value.parentesco}
            onChange={(e) => onChange({ ...value, parentesco: e.target.value })}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={value.viveConEstudiante}
            onChange={(e) =>
              onChange({ ...value, viveConEstudiante: e.target.checked })
            }
          />
          Vive con el estudiante
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={value.esPrincipal}
            onChange={(e) =>
              onChange({ ...value, esPrincipal: e.target.checked })
            }
          />
          Encargado principal
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={value.recibeNotificaciones}
            onChange={(e) =>
              onChange({ ...value, recibeNotificaciones: e.target.checked })
            }
          />
          Recibe notificaciones
        </label>
      </section>
    );
  }

  function DetailCard({
    title,
    encargado
  }: {
    title: string;
    encargado: DetalleEncargado | null;
  }) {
    return (
      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "14px",
          padding: "12px",
          display: "grid",
          gap: "8px",
          background: "rgba(255,255,255,0.04)"
        }}
      >
        <strong>{title}</strong>
        {encargado ? (
          <>
            <div><strong>Nombre:</strong> {getStudentFullName({
              Nombre: encargado.Nombre || "",
              PrimerApellido: encargado.PrimerApellido || "",
              SegundoApellido: encargado.SegundoApellido || ""
            })}</div>
            <div><strong>Identificación:</strong> {encargado.Identificacion || ""}</div>
            <div><strong>Correo:</strong> {encargado.Correo || ""}</div>
            <div><strong>Teléfono:</strong> {encargado.Telefono || ""}</div>
            <div><strong>Dirección:</strong> {encargado.DireccionExacta || ""}</div>
            <div><strong>Parentesco:</strong> {encargado.Parentesco || ""}</div>
            <div><strong>Vive con el estudiante:</strong> {encargado.ViveConEstudiante ? "Sí" : "No"}</div>
            <div><strong>Principal:</strong> {encargado.EsPrincipal ? "Sí" : "No"}</div>
            <div><strong>Recibe notificaciones:</strong> {encargado.RecibeNotificaciones ? "Sí" : "No"}</div>
          </>
        ) : (
          <div style={{ opacity: 0.8 }}>No hay datos registrados</div>
        )}
      </section>
    );
  }

  return (
    <div className="two-col">
      <section className="card">
        <h3>{editingId ? "Editar estudiante" : "Registrar estudiante"}</h3>

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
            <div>{errorMessage}</div>

            {reactivableId && canManageStudents && (
              <button
                type="button"
                onClick={() => handleReactivate()}
                style={{
                  marginTop: "10px",
                  border: "1px solid #fca5a5",
                  background: "#fff",
                  color: "#991b1b",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  cursor: "pointer"
                }}
              >
                Reactivar estudiante
              </button>
            )}
          </div>
        )}

        {canManageStudents ? (
          <form className="form" onSubmit={handleSubmit}>
            <SectionTitle>Datos del estudiante</SectionTitle>

            <label>
              Identificación
              <input
                value={form.identificacion}
                onChange={(e) =>
                  setForm({ ...form, identificacion: e.target.value })
                }
              />
            </label>

            <label>
              Nombre
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            <label>
              Primer apellido
              <input
                value={form.primerApellido}
                onChange={(e) =>
                  setForm({ ...form, primerApellido: e.target.value })
                }
              />
            </label>

            <label>
              Segundo apellido
              <input
                value={form.segundoApellido}
                onChange={(e) =>
                  setForm({ ...form, segundoApellido: e.target.value })
                }
              />
            </label>

            <label>
              Fecha de nacimiento
              <input
                type="date"
                value={form.fechaNacimiento}
                onChange={(e) =>
                  setForm({ ...form, fechaNacimiento: e.target.value })
                }
              />
            </label>

            <label>
              Sexo
              <select
                value={form.sexo}
                onChange={(e) => setForm({ ...form, sexo: e.target.value })}
              >
                <option value="">Seleccione</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </label>

            <label>
              Nacionalidad
              <input
                value={form.nacionalidad}
                onChange={(e) =>
                  setForm({ ...form, nacionalidad: e.target.value })
                }
              />
            </label>

            <label>
              Usuario y correo institucional del estudiante
              <input
                type="email"
                value={form.correo}
                readOnly
              />
              <small style={{ opacity: 0.8 }}>
                Se genera automáticamente con el número de identificación + {dominioCorreoEstudiante}
              </small>
            </label>

            <label>
              Teléfono
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </label>

            <label>
              Adecuación
              <input
                value={form.adecuacion}
                onChange={(e) =>
                  setForm({ ...form, adecuacion: e.target.value })
                }
                placeholder="Ejemplo: Curricular no significativa"
              />
            </label>

            <label>
              Discapacidad
              <input
                value={form.discapacidad}
                onChange={(e) =>
                  setForm({ ...form, discapacidad: e.target.value })
                }
              />
            </label>

            <label>
              Enfermedad
              <input
                value={form.enfermedad}
                onChange={(e) =>
                  setForm({ ...form, enfermedad: e.target.value })
                }
              />
            </label>

            <label>
              Ruta transporte habitual
              <input
                value={form.rutaTransporteHabitual}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rutaTransporteHabitual: e.target.value
                  })
                }
              />
            </label>

            <label>
              Observación médica
              <textarea
                value={form.observacionMedica}
                onChange={(e) =>
                  setForm({ ...form, observacionMedica: e.target.value })
                }
                rows={3}
              />
            </label>

            <div style={{ display: "grid", gap: "8px" }}>
              <label>Foto del estudiante</label>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
              />

              {uploadingPhoto && (
                <div style={{ fontSize: "14px", color: "#475569" }}>
                  Subiendo foto...
                </div>
              )}

              {form.fotoUrl && (
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
                    src={form.fotoUrl}
                    alt="Foto estudiante"
                    style={{
                      width: "88px",
                      height: "88px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      background: "#fff"
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, fotoUrl: "" })}
                    style={{
                      border: "1px solid #d1d5db",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      background: "#fff",
                      cursor: "pointer"
                    }}
                  >
                    Quitar foto
                  </button>
                </div>
              )}
            </div>

            <SectionTitle>Datos de la madre</SectionTitle>
            <EncargadoBlockStable title="Madre" value={madreForm} onChange={setMadreForm} />

            <SectionTitle>Datos del padre</SectionTitle>
            <EncargadoBlockStable title="Padre" value={padreForm} onChange={setPadreForm} />

            <SectionTitle>Datos del encargado</SectionTitle>
            <EncargadoBlockStable
              title="Encargado"
              value={encargadoForm}
              onChange={setEncargadoForm}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="primary-btn"
                disabled={loading || uploadingPhoto || loadingDetalle}
              >
                {loading
                  ? editingId
                    ? "Actualizando..."
                    : "Guardando..."
                  : editingId
                    ? "Actualizar"
                    : "Guardar"}
              </button>

              {editingId && (
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
              )}
            </div>
          </form>
        ) : (
          <div style={{ color: "#6b7280" }}>
            Este rol solo puede consultar estudiantes y ver carnets
          </div>
        )}
      </section>

      <section className="card">
        <h3>Listado de estudiantes</h3>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "14px",
            padding: "14px",
            marginBottom: "14px",
            background: "rgba(255,255,255,0.03)"
          }}
        >
          <h4 style={{ marginTop: 0 }}>Carga masiva desde Excel</h4>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
            <button
              type="button"
              className="primary-btn"
              onClick={handleDescargarPlantilla}
            >
              Descargar plantilla
            </button>
          </div>

          <form
            onSubmit={handleImportarExcel}
            style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setArchivoImportacion(e.target.files?.[0] || null)}
            />

            <button
              type="submit"
              className="primary-btn"
              disabled={importandoExcel || !archivoImportacion}
            >
              {importandoExcel ? "Importando..." : "Cargar Excel"}
            </button>
          </form>

          {importResult && (
            <div style={{ marginTop: "14px" }}>
              <div><strong>Total registros:</strong> {importResult.totalRegistros}</div>
              <div><strong>Correctos:</strong> {importResult.totalOk}</div>
              <div><strong>Con error:</strong> {importResult.totalError}</div>

              <div className="table-wrap" style={{ marginTop: "12px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Identificación</th>
                      <th>Estado</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.resultados.map((row, idx) => (
                      <tr key={`${row.fila}-${idx}`}>
                        <td>{row.fila}</td>
                        <td>{row.identificacion}</td>
                        <td>{row.estado}</td>
                        <td>{row.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSearch}
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "12px",
            flexWrap: "wrap"
          }}
        >
          <input
            placeholder="Buscar por identificación o nombre"
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
              load("", incluirInactivos);
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

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px"
          }}
        >
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          Incluir estudiantes inactivos
        </label>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Foto</th>
                <th>Identificación</th>
                <th>Nombre</th>
                <th>Nacionalidad</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <>
                  <tr key={item.EstudianteId}>
                    <td>{item.EstudianteId}</td>
                    <td>
                      {item.FotoUrl ? (
                        <img
                          src={item.FotoUrl}
                          alt={item.Nombre}
                          style={{
                            width: "52px",
                            height: "52px",
                            objectFit: "cover",
                            borderRadius: "10px"
                          }}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                    <td>{item.Identificacion}</td>
                    <td>{getStudentFullName(item)}</td>
                    <td>{item.Nacionalidad ?? ""}</td>
                    <td>{item.Correo ?? ""}</td>
                    <td>{item.Telefono ?? ""}</td>
                    <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleVerDetalle(item)}
                          style={{
                            border: "1px solid #c7d2fe",
                            background: "#eef2ff",
                            color: "#4338ca",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            cursor: "pointer"
                          }}
                        >
                          {detalleVisibleId === item.EstudianteId ? "Ocultar detalle" : "Ver detalle"}
                        </button>

                        {canManageStudents && (
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
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            window.open(`/estudiantes/${item.EstudianteId}/carnet`, "_blank")
                          }
                          style={{
                            border: "1px solid #c7d2fe",
                            background: "#eef2ff",
                            color: "#4338ca",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            cursor: "pointer"
                          }}
                        >
                          Ver carnet
                        </button>

                        {canManageStudents && item.Activo && (
                          <button
                            type="button"
                            onClick={() => handleDelete(item.EstudianteId)}
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

                        {canManageStudents && !item.Activo && (
                          <button
                            type="button"
                            onClick={() => handleReactivate(item.EstudianteId)}
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

                  {detalleVisibleId === item.EstudianteId && (
                    <tr>
                      <td colSpan={9} style={{ padding: "14px" }}>
                        {detalleCargandoId === item.EstudianteId ? (
                          <div>Cargando detalle...</div>
                        ) : detalleEstudiante ? (
                          <div
                            style={{
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "16px",
                              padding: "16px",
                              display: "grid",
                              gap: "16px",
                              background: "rgba(255,255,255,0.03)"
                            }}
                          >
                            <SectionTitle>Detalle del estudiante</SectionTitle>

                            <div style={{ display: "grid", gap: "8px" }}>
                              <div><strong>Nombre:</strong> {getStudentFullName(detalleEstudiante)}</div>
                              <div><strong>Identificación:</strong> {detalleEstudiante.Identificacion}</div>
                              <div><strong>Fecha nacimiento:</strong> {formatDate(detalleEstudiante.FechaNacimiento)}</div>
                              <div><strong>Sexo:</strong> {detalleEstudiante.Sexo || ""}</div>
                              <div><strong>Nacionalidad:</strong> {detalleEstudiante.Nacionalidad || ""}</div>
                              <div><strong>Adecuación:</strong> {detalleEstudiante.Adecuacion || ""}</div>
                              <div><strong>Discapacidad:</strong> {detalleEstudiante.Discapacidad || ""}</div>
                              <div><strong>Enfermedad:</strong> {detalleEstudiante.Enfermedad || ""}</div>
                              <div><strong>Ruta transporte:</strong> {detalleEstudiante.RutaTransporteHabitual || ""}</div>
                              <div><strong>Observación médica:</strong> {detalleEstudiante.ObservacionMedica || ""}</div>
                              <div><strong>Correo:</strong> {detalleEstudiante.Correo || ""}</div>
                              <div><strong>Teléfono:</strong> {detalleEstudiante.Telefono || ""}</div>
                              <div><strong>Carnet:</strong> {detalleEstudiante.CodigoCarnet || ""}</div>
                            </div>

                            <SectionTitle>Encargados</SectionTitle>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                                gap: "12px"
                              }}
                            >
                              <DetailCardStable title="Madre" encargado={detalleMadre} />
                              <DetailCardStable title="Padre" encargado={detallePadre} />
                              <DetailCardStable title="Encargado" encargado={detalleEncargado} />
                            </div>
                          </div>
                        ) : (
                          <div>No hay detalle disponible</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}

              {!items.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>
                    No hay estudiantes registrados
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