import { FormEvent, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import api from "../lib/http";
import { getCostaRicaIsoDate } from "../utils/date";
import { useAuth } from "../context/auth";

type Student = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string;
  SegundoApellido: string;
  FechaNacimiento: string | null;
  TipoIdentificacion?: string | null;
  Sexo: string | null;
  Correo: string | null;
  Telefono: string | null;
  TipoEstudianteId?: number | null;
  TipoEstudianteDescripcion?: string | null;
  Repitente?: boolean | null;
  Refugiado?: boolean | null;
  NivelFuncionamiento: string | null;
  FotoUrl: string | null;
  CodigoCarnet: string | null;
  QrContenido: string | null;
  Nacionalidad: string | null;
  Adecuacion: string | null;
  Discapacidad: string | null;
  TipoDiscapacidad?: string | null;
  Enfermedad: string | null;
  Observaciones: string | null;
  RutaTransporteId?: number | null;
  RutaTransporteDescripcion?: string | null;
  RutaTransporteHabitual: string | null;
  AutorizaWhatsAppEncargado?: boolean | null;
  TieneAdecuacion?: boolean | null;
  ObservacionMedica: string | null;
  Activo?: boolean;
};

type EncargadoForm = {
  tipoEncargado: "MADRE" | "PADRE" | "ENCARGADO";
  titulo: string;
  identificacion: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string;
  correo: string;
  telefono: string;
  telefonoSecundario: string;
  direccionExacta: string;
  parentesco: string;
  viveConEstudiante: boolean;
  esPrincipal: boolean;
  aceptaWhatsApp: boolean;
  aceptaCorreo: boolean;
  recibeNotificaciones: boolean;
};

type DetalleEncargado = {
  EstudianteEncargadoId?: number;
  Parentesco?: string | null;
  EsPrincipal?: boolean;
  AceptaWhatsApp?: boolean;
  AceptaCorreo?: boolean;
  RecibeNotificaciones?: boolean;
  ViveConEstudiante?: boolean;
  VigenciaDesde?: string | null;
  VigenciaHasta?: string | null;
  Activo?: boolean;
  EncargadoId?: number;
  TipoEncargado?: "MADRE" | "PADRE" | "ENCARGADO";
  Titulo?: string | null;
  Identificacion?: string | null;
  Nombre?: string | null;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  Correo?: string | null;
  Telefono?: string | null;
  TelefonoSecundario?: string | null;
  DireccionExacta?: string | null;
};

type StudentDetalleResponse = {
  estudiante: Student;
  encargados: DetalleEncargado[];
};

type StudentType = {
  TipoEstudianteId: number;
  Descripcion: string;
  Activo: boolean;
};

type TipoAdecuacion = {
  TipoAdecuacionId: number;
  Descripcion: string;
  Activo: boolean;
};

type RutaTransporte = {
  RutaTransporteId: number;
  Descripcion: string;
  Responsable?: string | null;
  LugarInicio?: string | null;
  LugarFin?: string | null;
  CapacidadEstudiantes?: number | null;
  HoraInicio?: string | null;
  HoraFin?: string | null;
  Activo: boolean;
};

type ImportResultRow = {
  fila: number;
  identificacion: string;
  estado: "CREADO" | "ACTUALIZADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
  motivo: string;
};

type ImportProgress = {
  jobId: string;
  status: "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";
  totalRegistros: number;
  procesados: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalActualizados: number;
  totalReactivados: number;
  totalOmitidos: number;
  porcentaje: number;
  error?: string | null;
  resultados: ImportResultRow[];
};

type DashboardBucket = {
  Label?: string | null;
  label?: string | null;
  Total?: number | null;
  total?: number | null;
};

type StudentDashboard = {
  totalActivos: number;
  totalInactivos: number;
  totalGeneral: number;
  totalMatriculados: number;
  porGrupo: DashboardBucket[];
  porSeccion: DashboardBucket[];
  porGenero: DashboardBucket[];
  porEspecialidad: DashboardBucket[];
  porNacionalidad: DashboardBucket[];
  porTipo: DashboardBucket[];
  otros: DashboardBucket[];
};

type BoletaConductaContexto = {
  fecha: string;
  estudianteId: number;
  estudianteNombre: string;
  seccion: string;
  siguienteNumero: number;
  prefijo?: string;
  anioLectivo?: string;
  codigoBoleta?: string;
  funcionarioNombre: string;
  institucion?: {
    Nombre?: string | null;
    NombreComercial?: string | null;
    NombreOficialBoleta?: string | null;
    RegionalEducativa?: string | null;
    CircuitoEducativo?: string | null;
  };
};

const STUDENTS_PAGE_SIZE = 100;

const emptyEncargado = (
  tipo: "MADRE" | "PADRE" | "ENCARGADO"
): EncargadoForm => ({
  tipoEncargado: tipo,
  titulo: "",
  identificacion: "",
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  correo: "",
  telefono: "",
  telefonoSecundario: "",
  direccionExacta: "",
  parentesco:
    tipo === "MADRE" ? "Madre" : tipo === "PADRE" ? "Padre" : "Encargado",
  viveConEstudiante: false,
  esPrincipal: tipo === "MADRE",
  aceptaWhatsApp: true,
  aceptaCorreo: true,
  recibeNotificaciones: true
});

const initialForm = {
  identificacion: "",
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  fechaNacimiento: "",
  tipoIdentificacion: "",
  correo: "",
  telefono: "",
  tipoEstudianteId: "",
  rutaTransporteId: "",
  autorizaWhatsAppEncargado: false,
  sexo: "",
  fotoUrl: "",
  nacionalidad: "",
  repitente: false,
  refugiado: false,
  tieneAdecuacion: false,
  adecuacion: "",
  nivelFuncionamiento: "",
  discapacidad: "",
  tipoDiscapacidad: "",
  enfermedad: "",
  rutaTransporteHabitual: "",
  observaciones: "",
  observacionMedica: ""
};

function getStudentFullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function normalizeComparableText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isValidAdecuacionOption(value?: string | null) {
  const normalized = normalizeComparableText(value);
  return !!normalized && !["regular", "sin adecuacion", "seleccione", "no"].includes(normalized);
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
      <label>Tratamiento<input value={value.titulo} onChange={(e) => onChange({ ...value, titulo: e.target.value })} placeholder="Ejemplo: Sr., Sra." /></label>
      <label>Identificación<input value={value.identificacion} onChange={(e) => onChange({ ...value, identificacion: e.target.value })} /></label>
      <label>Nombre<input value={value.nombre} onChange={(e) => onChange({ ...value, nombre: e.target.value })} /></label>
      <label>Primer apellido<input value={value.primerApellido} onChange={(e) => onChange({ ...value, primerApellido: e.target.value })} /></label>
      <label>Segundo apellido<input value={value.segundoApellido} onChange={(e) => onChange({ ...value, segundoApellido: e.target.value })} /></label>
      <label>Correo<input type="email" value={value.correo} onChange={(e) => onChange({ ...value, correo: e.target.value })} /></label>
      <label>Teléfono<input value={value.telefono} onChange={(e) => onChange({ ...value, telefono: normalizePhoneForInput(e.target.value) })} /></label>
      <label>Otro celular<input value={value.telefonoSecundario} onChange={(e) => onChange({ ...value, telefonoSecundario: normalizePhoneForInput(e.target.value) })} /></label>
      <label>Dirección exacta<textarea rows={2} value={value.direccionExacta} onChange={(e) => onChange({ ...value, direccionExacta: e.target.value })} /></label>
      <label>Parentesco<input value={value.parentesco} onChange={(e) => onChange({ ...value, parentesco: e.target.value })} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.viveConEstudiante} onChange={(e) => onChange({ ...value, viveConEstudiante: e.target.checked })} />Vive con el estudiante</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.esPrincipal} onChange={(e) => onChange({ ...value, esPrincipal: e.target.checked })} />Encargado principal</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.aceptaWhatsApp} onChange={(e) => onChange({ ...value, aceptaWhatsApp: e.target.checked, recibeNotificaciones: e.target.checked || value.aceptaCorreo })} />Acepta WhatsApp</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" checked={value.aceptaCorreo} onChange={(e) => onChange({ ...value, aceptaCorreo: e.target.checked, recibeNotificaciones: value.aceptaWhatsApp || e.target.checked })} />Acepta correo</label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.85 }}><input type="checkbox" checked={value.aceptaWhatsApp || value.aceptaCorreo} readOnly disabled />Recibe notificaciones</label>
    </section>
  );
}

function DetailCardStable({ title, encargado }: { title: string; encargado: DetalleEncargado | null; }) {
  return (
    <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: "14px", padding: "12px", display: "grid", gap: "8px", background: "rgba(255,255,255,0.04)" }}>
      <strong>{title}</strong>
      {encargado ? (
        <>
          <div><strong>Tratamiento:</strong> {encargado.Titulo || ""}</div>
          <div><strong>Nombre:</strong> {getStudentFullName({ Nombre: encargado.Nombre || "", PrimerApellido: encargado.PrimerApellido || "", SegundoApellido: encargado.SegundoApellido || "" })}</div>
          <div><strong>Identificación:</strong> {encargado.Identificacion || ""}</div>
          <div><strong>Correo:</strong> {encargado.Correo || ""}</div>
          <div><strong>Teléfono:</strong> {encargado.Telefono || ""}</div>
          <div><strong>Otro celular:</strong> {encargado.TelefonoSecundario || ""}</div>
          <div><strong>Dirección:</strong> {encargado.DireccionExacta || ""}</div>
          <div><strong>Parentesco:</strong> {encargado.Parentesco || ""}</div>
          <div><strong>Vive con el estudiante:</strong> {encargado.ViveConEstudiante ? "Sí" : "No"}</div>
          <div><strong>Principal:</strong> {encargado.EsPrincipal ? "Sí" : "No"}</div>
          <div><strong>Acepta WhatsApp:</strong> {encargado.AceptaWhatsApp ? "Sí" : "No"}</div>
          <div><strong>Acepta correo:</strong> {encargado.AceptaCorreo ? "Sí" : "No"}</div>
          <div><strong>Recibe notificaciones:</strong> {encargado.RecibeNotificaciones ? "Sí" : "No"}</div>
        </>
      ) : <div style={{ opacity: 0.8 }}>No hay datos registrados</div>}
    </section>
  );
}

function normalizePhoneForInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw.replace(/\s+/g, "");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `+506${digits}`;
}

export default function EstudiantesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [lastSearch, setLastSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reactivableId, setReactivableId] = useState<number | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [loadingListado, setLoadingListado] = useState(false);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [encargadoPrincipalForm, setEncargadoPrincipalForm] = useState<EncargadoForm>(
    { ...emptyEncargado("ENCARGADO"), esPrincipal: true }
  );
  const [encargadoSecundarioForm, setEncargadoSecundarioForm] = useState<EncargadoForm>(
    emptyEncargado("ENCARGADO")
  );

  const [detalleVisibleId, setDetalleVisibleId] = useState<number | null>(null);
  const [detalleCargandoId, setDetalleCargandoId] = useState<number | null>(null);
  const [detalleCargaPorcentaje, setDetalleCargaPorcentaje] = useState(0);
  const [detalleEstudiante, setDetalleEstudiante] = useState<Student | null>(null);
  const [detalleEncargados, setDetalleEncargados] = useState<DetalleEncargado[]>([]);
  const detalleVisibleRef = useRef<HTMLDivElement | null>(null);

  const [archivoImportacion, setArchivoImportacion] = useState<File | null>(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<{
    totalRegistros: number;
    totalOk: number;
    totalError: number;
    totalCreados?: number;
    totalActualizados?: number;
    totalReactivados?: number;
    totalOmitidos?: number;
    resultados: ImportResultRow[];
  } | null>(null);

  const [dominioCorreoEstudiante, setDominioCorreoEstudiante] = useState("@est.mep.go.cr");
  const [studentTypes, setStudentTypes] = useState<StudentType[]>([]);
  const [tiposAdecuacion, setTiposAdecuacion] = useState<TipoAdecuacion[]>([]);
  const [rutasTransporte, setRutasTransporte] = useState<RutaTransporte[]>([]);
  const [boletaConductaOpen, setBoletaConductaOpen] = useState(false);
  const [boletaConductaLoading, setBoletaConductaLoading] = useState(false);
  const [boletaConductaSaving, setBoletaConductaSaving] = useState(false);
  const [boletaConductaItem, setBoletaConductaItem] = useState<Student | null>(null);
  const [boletaConductaContexto, setBoletaConductaContexto] = useState<BoletaConductaContexto | null>(null);
  const [boletaConductaDetalleHechos, setBoletaConductaDetalleHechos] = useState("");
  const [boletaConductaLugar, setBoletaConductaLugar] = useState("");

  const roles = user?.roles || [];
  const canManageStudents =
    roles.includes("SUPER_ADMIN") ||
    roles.includes("ADMIN_INSTITUCIONAL") ||
    roles.includes("ADMINISTRATIVO");
  const canManualInstitutionalUserCorreo =
    roles.includes("SUPER_ADMIN") ||
    roles.includes("ADMIN_INSTITUCIONAL") ||
    roles.includes("ADMINISTRATIVO");
  const canImportStudents = canManageStudents;
  const isProfesorRole = roles.includes("PROFESOR");
  const canAccessStudentMatricula =
    canManageStudents ||
    isProfesorRole ||
    roles.includes("PROFESOR_GUIA");

  const detalleEncargadoPrincipal = useMemo(
    () =>
      detalleEncargados.find((x) => x.EsPrincipal) ||
      detalleEncargados[0] ||
      null,
    [detalleEncargados]
  );
  const detalleEncargadoSecundario = useMemo(
    () =>
      detalleEncargados.find((x) => x.EncargadoId !== detalleEncargadoPrincipal?.EncargadoId) ||
      null,
    [detalleEncargados, detalleEncargadoPrincipal]
  );
  function clearStudentResults() {
    setItems([]);
    setTotalItems(0);
    setPage(1);
    setLastSearch("");
    setDetalleVisibleId(null);
    setDetalleEstudiante(null);
    setDetalleEncargados([]);
  }

  async function loadDashboard() {
    setLoadingDashboard(true);
    try {
      const response = await api.get("/estudiantes/dashboard");
      setDashboard(response.data?.data || null);
    } catch (error) {
      console.error("Error cargando dashboard de estudiantes:", error);
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function load(query = "", verInactivos = incluirInactivos, nextPage = page) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
      clearStudentResults();
      return;
    }

    setLoadingListado(true);
    try {
      const response = await api.get("/estudiantes", {
        params: {
          q: cleanQuery,
          incluirInactivos: verInactivos,
          page: nextPage,
          pageSize: STUDENTS_PAGE_SIZE
        }
      });
      const data = response.data.data ?? [];
      if (Array.isArray(data)) {
        setItems(data);
        setTotalItems(data.length);
        setPage(nextPage);
      } else {
        setItems(data.items ?? []);
        setTotalItems(Number(data.total || 0));
        setPage(Number(data.page || nextPage));
      }
      setLastSearch(cleanQuery);
    } catch (error) {
      console.error("Error cargando estudiantes:", error);
      setErrorMessage("No se pudo cargar el listado de estudiantes");
    } finally {
      setLoadingListado(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    api.get("/academico/configuracion-correo-estudiante").then((response) => {
      const data = response.data?.data || {};
      setDominioCorreoEstudiante(String(data?.dominio || "@est.mep.go.cr"));
    }).catch(() => {});

    api.get("/academico/tipos-estudiante", { params: { incluirInactivos: false } }).then((response) => {
      setStudentTypes(response.data?.data ?? []);
    }).catch(() => {});

    api.get("/academico/tipos-adecuacion", { params: { incluirInactivos: false } }).then((response) => {
      setTiposAdecuacion(response.data?.data ?? []);
    }).catch(() => {});

    api.get("/academico/rutas-transporte", { params: { incluirInactivas: false } }).then((response) => {
      setRutasTransporte(response.data?.data ?? []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!importandoExcel) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [importandoExcel]);

  useEffect(() => {
    if (detalleCargandoId === null) {
      setDetalleCargaPorcentaje(0);
      return;
    }

    setDetalleCargaPorcentaje(18);
    const intervalId = window.setInterval(() => {
      setDetalleCargaPorcentaje((prev) => {
        if (prev >= 88) return prev;
        return Math.min(88, prev + 14);
      });
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [detalleCargandoId]);

  useEffect(() => {
    if (!detalleVisibleId || !detalleEstudiante || detalleCargandoId !== null) return;
    window.setTimeout(() => {
      detalleVisibleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [detalleVisibleId, detalleEstudiante, detalleCargandoId]);

  useEffect(() => {
    const limpio = String(form.identificacion || "").replace(/\s+/g, "").trim();
    const dominio = String(dominioCorreoEstudiante || "@est.mep.go.cr").trim();
    const dominioNormalizado = dominio.startsWith("@") ? dominio : `@${dominio}`;
    if (!canManualInstitutionalUserCorreo) {
      setForm((prev) => ({ ...prev, correo: limpio ? `${limpio}${dominioNormalizado}`.toLowerCase() : "" }));
    }
  }, [form.identificacion, dominioCorreoEstudiante, canManualInstitutionalUserCorreo]);

  function resetAllForms() {
    setForm(initialForm);
    setEncargadoPrincipalForm({ ...emptyEncargado("ENCARGADO"), esPrincipal: true });
    setEncargadoSecundarioForm(emptyEncargado("ENCARGADO"));
    setEditingId(null);
    setReactivableId(null);
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function openCreateForm() {
    resetAllForms();
    clearMessages();
    setIsFormExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleGoToMatricula(item: Student) {
    clearMessages();
    navigate("/matricula", {
      state: {
        openTab: "matriculas",
        matriculaPrefill: {
          estudianteId: item.EstudianteId,
          fechaMatricula: getCostaRicaIsoDate(),
          rutaTransporte: item.RutaTransporteDescripcion || item.RutaTransporteHabitual || "",
          correoEnvioBoleta: item.Correo || ""
        }
      }
    });
  }

  async function handleOpenBoletaConducta(item: Student) {
    clearMessages();
    setBoletaConductaItem(item);
    setBoletaConductaOpen(true);
    setBoletaConductaDetalleHechos("");
    setBoletaConductaLugar("");
    setBoletaConductaLoading(true);
    try {
      const response = await api.get(`/boletas/conducta/contexto/${item.EstudianteId}`);
      setBoletaConductaContexto(response.data?.data || null);
    } catch (error: any) {
      console.error("Error cargando contexto de boleta de conducta:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el contexto de la boleta de conducta");
      setBoletaConductaOpen(false);
      setBoletaConductaItem(null);
      setBoletaConductaContexto(null);
    } finally {
      setBoletaConductaLoading(false);
    }
  }

  async function handleGuardarBoletaConducta() {
    if (!boletaConductaItem) return;
    if (!boletaConductaDetalleHechos.trim()) {
      setErrorMessage("Debés indicar el detalle de los hechos");
      return;
    }
    if (!boletaConductaLugar.trim()) {
      setErrorMessage("Debés indicar el lugar del acontecimiento");
      return;
    }
    clearMessages();
    setBoletaConductaSaving(true);
    try {
      const response = await api.post("/boletas/conducta", {
        estudianteId: boletaConductaItem.EstudianteId,
        detalleHechos: boletaConductaDetalleHechos,
        lugarAcontecimiento: boletaConductaLugar
      });
      const boletaConductaId = Number(response.data?.data?.boletaConductaId || 0);
      if (!boletaConductaId) throw new Error("No se recibió el id de la boleta");
      setMessage("Boleta de conducta generada correctamente");
      setBoletaConductaOpen(false);
      setBoletaConductaItem(null);
      setBoletaConductaContexto(null);
      window.open(`/boletas/conducta/${boletaConductaId}`, "_blank");
    } catch (error: any) {
      console.error("Error generando boleta de conducta:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo generar la boleta de conducta");
    } finally {
      setBoletaConductaSaving(false);
    }
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
    return [encargadoPrincipalForm, encargadoSecundarioForm]
      .map((item) => ({
        tipoEncargado: item.tipoEncargado,
        titulo: item.titulo || null,
        identificacion: item.identificacion || null,
        nombre: item.nombre || null,
        primerApellido: item.primerApellido || null,
        segundoApellido: item.segundoApellido || null,
        correo: item.correo || null,
        telefono: item.telefono || null,
        telefonoSecundario: item.telefonoSecundario || null,
        direccionExacta: item.direccionExacta || null,
        parentesco: item.parentesco || null,
        viveConEstudiante: item.viveConEstudiante,
        esPrincipal: item.esPrincipal,
        aceptaWhatsApp: item.aceptaWhatsApp,
        aceptaCorreo: item.aceptaCorreo,
        recibeNotificaciones: item.aceptaWhatsApp || item.aceptaCorreo
      }))
      .filter((item) =>
        !!(
          item.identificacion ||
          item.nombre ||
          item.telefono ||
          item.telefonoSecundario ||
          item.direccionExacta
        )
      );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para incluir o modificar estudiantes");
      return;
    }

    if (!form.fechaNacimiento || !form.primerApellido?.trim() || !form.segundoApellido?.trim()) {
      setErrorMessage("Completá los campos obligatorios: primer apellido, segundo apellido y fecha de nacimiento.");
      return;
    }

    if (form.tieneAdecuacion && !String(form.adecuacion || "").trim()) {
      setErrorMessage("Marcá Adecuación solo si seleccionás una opción del combo.");
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
        tipoIdentificacion: form.tipoIdentificacion || null,
        correo: form.correo || null,
        telefono: form.telefono || null,
        tipoEstudianteId: form.tipoEstudianteId ? Number(form.tipoEstudianteId) : null,
        rutaTransporteId: form.rutaTransporteId ? Number(form.rutaTransporteId) : null,
        autorizaWhatsAppEncargado: !!form.autorizaWhatsAppEncargado,
        sexo: form.sexo || null,
        fotoUrl: form.fotoUrl || null,
        nacionalidad: form.nacionalidad || null,
        repitente: !!form.repitente,
        refugiado: !!form.refugiado,
        tieneAdecuacion: !!form.tieneAdecuacion,
        adecuacion: form.tieneAdecuacion ? form.adecuacion || null : null,
        nivelFuncionamiento: form.nivelFuncionamiento || null,
        discapacidad: form.discapacidad || null,
        tipoDiscapacidad: String(form.discapacidad || "").toLowerCase() === "sí" || String(form.discapacidad || "").toLowerCase() === "si"
          ? form.tipoDiscapacidad || null
          : null,
        enfermedad: form.enfermedad || null,
        rutaTransporteHabitual: form.rutaTransporteHabitual || null,
        observaciones: form.observaciones || null,
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
      setIsFormExpanded(false);
      await loadDashboard();
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
      const adecuacionActual = estudiante?.Adecuacion || "";
      const adecuacionActualValida = isValidAdecuacionOption(adecuacionActual);
      const tieneAdecuacionActual = estudiante?.TieneAdecuacion == null
        ? adecuacionActualValida
        : Boolean(estudiante?.TieneAdecuacion) && adecuacionActualValida;

      setEditingId(item.EstudianteId);
      setForm({
        identificacion: estudiante?.Identificacion || "",
        nombre: estudiante?.Nombre || "",
        primerApellido: estudiante?.PrimerApellido || "",
        segundoApellido: estudiante?.SegundoApellido || "",
        fechaNacimiento: estudiante?.FechaNacimiento
          ? String(estudiante.FechaNacimiento).slice(0, 10)
          : "",
        tipoIdentificacion: estudiante?.TipoIdentificacion || "",
        correo: estudiante?.Correo || "",
        telefono: normalizePhoneForInput(estudiante?.Telefono || ""),
        tipoEstudianteId: estudiante?.TipoEstudianteId ? String(estudiante.TipoEstudianteId) : "",
        rutaTransporteId: estudiante?.RutaTransporteId ? String(estudiante.RutaTransporteId) : "",
        autorizaWhatsAppEncargado: !!estudiante?.AutorizaWhatsAppEncargado,
        sexo: estudiante?.Sexo || "",
        fotoUrl: estudiante?.FotoUrl || "",
        nacionalidad: estudiante?.Nacionalidad || "",
        repitente: !!estudiante?.Repitente,
        refugiado: !!estudiante?.Refugiado,
        tieneAdecuacion: tieneAdecuacionActual,
        adecuacion: tieneAdecuacionActual ? adecuacionActual : "",
        nivelFuncionamiento: estudiante?.NivelFuncionamiento || "",
        discapacidad: estudiante?.Discapacidad || "",
        tipoDiscapacidad: estudiante?.TipoDiscapacidad || "",
        enfermedad: estudiante?.Enfermedad || "",
        rutaTransporteHabitual: estudiante?.RutaTransporteHabitual || "",
        observaciones: estudiante?.Observaciones || "",
        observacionMedica: estudiante?.ObservacionMedica || ""
      });

      const encargadoPrincipal =
        encargados.find((x) => x.EsPrincipal) ||
        encargados[0];
      const encargadoSecundario =
        encargados.find((x) => x.EncargadoId !== encargadoPrincipal?.EncargadoId) ||
        null;
      setEncargadoPrincipalForm(
        encargadoPrincipal
          ? {
              tipoEncargado: "ENCARGADO",
              titulo: encargadoPrincipal.Titulo || "",
              identificacion: encargadoPrincipal.Identificacion || "",
              nombre: encargadoPrincipal.Nombre || "",
              primerApellido: encargadoPrincipal.PrimerApellido || "",
              segundoApellido: encargadoPrincipal.SegundoApellido || "",
              correo: encargadoPrincipal.Correo || "",
              telefono: normalizePhoneForInput(encargadoPrincipal.Telefono || ""),
              telefonoSecundario: normalizePhoneForInput(encargadoPrincipal.TelefonoSecundario || ""),
              direccionExacta: encargadoPrincipal.DireccionExacta || "",
              parentesco: encargadoPrincipal.Parentesco || "Encargado",
              viveConEstudiante: !!encargadoPrincipal.ViveConEstudiante,
              esPrincipal: true,
              aceptaWhatsApp: !!encargadoPrincipal.AceptaWhatsApp,
              aceptaCorreo: !!encargadoPrincipal.AceptaCorreo,
              recibeNotificaciones:
                encargadoPrincipal.RecibeNotificaciones === false ? false : true
            }
          : { ...emptyEncargado("ENCARGADO"), esPrincipal: true }
      );
      setEncargadoSecundarioForm(
        encargadoSecundario
          ? {
              tipoEncargado: "ENCARGADO",
              titulo: encargadoSecundario.Titulo || "",
              identificacion: encargadoSecundario.Identificacion || "",
              nombre: encargadoSecundario.Nombre || "",
              primerApellido: encargadoSecundario.PrimerApellido || "",
              segundoApellido: encargadoSecundario.SegundoApellido || "",
              correo: encargadoSecundario.Correo || "",
              telefono: normalizePhoneForInput(encargadoSecundario.Telefono || ""),
              telefonoSecundario: normalizePhoneForInput(encargadoSecundario.TelefonoSecundario || ""),
              direccionExacta: encargadoSecundario.DireccionExacta || "",
              parentesco: encargadoSecundario.Parentesco || "Encargado",
              viveConEstudiante: !!encargadoSecundario.ViveConEstudiante,
              esPrincipal: !!encargadoSecundario.EsPrincipal,
              aceptaWhatsApp: !!encargadoSecundario.AceptaWhatsApp,
              aceptaCorreo: !!encargadoSecundario.AceptaCorreo,
              recibeNotificaciones:
                encargadoSecundario.RecibeNotificaciones === false ? false : true
            }
          : emptyEncargado("ENCARGADO")
      );

      setIsFormExpanded(true);
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
    setIsFormExpanded(false);
  }

  async function handleDelete(id: number) {
    if (!canManageStudents) {
      setErrorMessage("No tenés permisos para eliminar estudiantes");
      return;
    }

    const confirmado = window.confirm("¿Deseás eliminar este estudiante? El registro quedará inactivo y podrés reactivarlo si lo necesités.");
    if (!confirmado) return;

    clearMessages();
    setReactivableId(null);

    try {
      await api.delete(`/estudiantes/${id}`);
      setMessage("Estudiante eliminado correctamente");

      if (editingId === id) {
        resetAllForms();
        setIsFormExpanded(false);
      }

      if (detalleVisibleId === id) {
        setDetalleVisibleId(null);
        setDetalleEstudiante(null);
        setDetalleEncargados([]);
      }

      await loadDashboard();
      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error desactivando estudiante:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo eliminar el estudiante"
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
      setIsFormExpanded(false);
      await loadDashboard();
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
    const cleanQuery = String(search || "").trim();
    if (!cleanQuery) {
      clearStudentResults();
      setMessage("Digite un valor de busqueda para consultar estudiantes.");
      return;
    }

    await load(cleanQuery, incluirInactivos, 1);
  }

  async function handleVerDetalle(item: Student) {
    if (detalleVisibleId === item.EstudianteId) {
      setDetalleVisibleId(null);
      setDetalleCargaPorcentaje(0);
      setDetalleEstudiante(null);
      setDetalleEncargados([]);
      return;
    }

    setDetalleVisibleId(item.EstudianteId);
    setDetalleCargandoId(item.EstudianteId);
    setDetalleEstudiante(null);
    setDetalleEncargados([]);
    clearMessages();
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const response = await api.get(`/estudiantes/${item.EstudianteId}/detalle`);
      const detalle: StudentDetalleResponse = response.data?.data;

      setDetalleCargaPorcentaje(100);
      setDetalleEstudiante(detalle?.estudiante || null);
      setDetalleEncargados(detalle?.encargados || []);
    } catch (error: any) {
      console.error("Error cargando detalle para visualización:", error);
      setDetalleVisibleId(null);
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
    setImportProgress(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportacion);

      const response = await api.post("/estudiantes/importar-excel/iniciar", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const initialProgress: ImportProgress = response.data?.data;
      const jobId = initialProgress?.jobId;

      if (!jobId) {
        throw new Error("No se recibio el identificador de la importacion");
      }

      setImportProgress(initialProgress);

      let finalProgress = initialProgress;
      while (!["COMPLETADO", "ERROR"].includes(finalProgress.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const progressResponse = await api.get(`/estudiantes/importar-excel/progreso/${jobId}`);
        finalProgress = progressResponse.data?.data;
        setImportProgress(finalProgress);
      }

      if (finalProgress.status === "ERROR") {
        throw new Error(finalProgress.error || "No se pudo procesar la importacion");
      }

      setImportResult({
        totalRegistros: finalProgress.totalRegistros,
        totalOk: finalProgress.totalOk,
        totalError: finalProgress.totalError,
        totalCreados: finalProgress.totalCreados,
        totalActualizados: finalProgress.totalActualizados,
        totalReactivados: finalProgress.totalReactivados,
        totalOmitidos: finalProgress.totalOmitidos,
        resultados: finalProgress.resultados || []
      });
      setMessage("Importación procesada correctamente");
      setArchivoImportacion(null);
      await loadDashboard();
      await load(search, incluirInactivos);
    } catch (error: any) {
      console.error("Error importando Excel:", error);
      setErrorMessage(
        error?.response?.data?.message || error?.message || "No se pudo importar el archivo Excel"
      );
    } finally {
      setImportandoExcel(false);
    }
  }

  async function handleDescargarResumenImportacion() {
    const jobId = importProgress?.jobId;
    if (!jobId) {
      setErrorMessage("No hay un resumen de importacion disponible para exportar");
      return;
    }

    try {
      clearMessages();
      const response = await api.get(`/estudiantes/importar-excel/resumen/${jobId}/excel`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resumen_importacion_estudiantes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error descargando resumen de importacion:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo exportar el resumen de importacion");
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
            onChange={(e) => onChange({ ...value, telefono: normalizePhoneForInput(e.target.value) })}
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

  function getBucketLabel(item: DashboardBucket) {
    return String(item.Label ?? item.label ?? "Sin dato").trim() || "Sin dato";
  }

  function getBucketTotal(item: DashboardBucket) {
    return Number(item.Total ?? item.total ?? 0);
  }

  function DashboardSummaryList({ title, data }: { title: string; data?: DashboardBucket[] }) {
    const rows = (data || []).filter((item) => getBucketTotal(item) > 0);

    return (
      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", padding: "12px", background: "rgba(255,255,255,0.03)", display: "grid", gap: "8px", minHeight: "120px" }}>
        <strong>{title}</strong>
        {rows.length ? rows.slice(0, 6).map((item, index) => (
          <div key={`${title}-${getBucketLabel(item)}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", fontSize: "13px" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getBucketLabel(item)}</span>
            <span style={{ fontWeight: 900 }}>{getBucketTotal(item)}</span>
          </div>
        )) : (
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>Sin datos</span>
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / STUDENTS_PAGE_SIZE));
  const pageStart = totalItems ? (page - 1) * STUDENTS_PAGE_SIZE + 1 : 0;
  const pageEnd = totalItems ? Math.min(totalItems, pageStart + items.length - 1) : 0;
  const studentsTableColSpan = 12;

  return (
    <div className="two-col">
      <section className="card">
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
                  ? "Editar estudiante"
                  : "Registrar estudiante"
                : "Estudiantes"}
            </h3>
          </div>

          {canManageStudents && !isFormExpanded && (
            <button
              type="button"
              className="primary-btn"
              onClick={openCreateForm}
            >
              Agregar estudiante
            </button>
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
          isFormExpanded ? (
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
                required
                value={form.primerApellido}
                onChange={(e) =>
                  setForm({ ...form, primerApellido: e.target.value })
                }
              />
            </label>

            <label>
              Segundo apellido
              <input
                required
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
                required
                value={form.fechaNacimiento}
                onChange={(e) =>
                  setForm({ ...form, fechaNacimiento: e.target.value })
                }
              />
            </label>

            <label>
              Tipo de identificación
              <input
                value={form.tipoIdentificacion}
                onChange={(e) =>
                  setForm({ ...form, tipoIdentificacion: e.target.value })
                }
                placeholder="Ejemplo: Cédula nacional, DIMEX, Pasaporte"
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
                readOnly={!canManualInstitutionalUserCorreo}
                onChange={(e) =>
                  setForm({ ...form, correo: e.target.value })
                }
              />
              <small style={{ opacity: 0.8 }}>
                {canManualInstitutionalUserCorreo
                  ? "Podés editar manualmente este campo. Si lo dejás vacío, se generará automático con identificación + dominio institucional."
                  : `Se genera automáticamente con el número de identificación + ${dominioCorreoEstudiante}`}
              </small>
            </label>

            <label>
              Teléfono
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: normalizePhoneForInput(e.target.value) })}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={!!form.repitente}
                onChange={(e) => setForm({ ...form, repitente: e.target.checked })}
              />
              Repitente
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={!!form.refugiado}
                onChange={(e) => setForm({ ...form, refugiado: e.target.checked })}
              />
              Refugiado
            </label>

            <label>
              Tipo de estudiante
              <select
                value={form.tipoEstudianteId}
                onChange={(e) => setForm({ ...form, tipoEstudianteId: e.target.value })}
              >
                <option value="">Seleccione</option>
                {studentTypes.filter((item) => item.Activo).map((item) => (
                  <option key={item.TipoEstudianteId} value={item.TipoEstudianteId}>
                    {item.Descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={!!form.tieneAdecuacion}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    tieneAdecuacion: e.target.checked,
                    adecuacion: e.target.checked ? prev.adecuacion : ""
                  }))
                }
              />
              Adecuación
            </label>

            {form.tieneAdecuacion ? (
              <label>
                Seleccione la adecuación
                <select
                  value={form.adecuacion}
                  onChange={(e) =>
                    setForm({ ...form, adecuacion: e.target.value })
                  }
                >
                  <option value="">Seleccione</option>
                  {tiposAdecuacion.filter((item) => item.Activo && isValidAdecuacionOption(item.Descripcion)).map((item) => (
                    <option key={item.TipoAdecuacionId} value={item.Descripcion}>
                      {item.Descripcion}
                    </option>
                  ))}
                  {form.adecuacion &&
                  isValidAdecuacionOption(form.adecuacion) &&
                  !tiposAdecuacion.some((item) => normalizeComparableText(item.Descripcion) === normalizeComparableText(form.adecuacion)) ? (
                    <option value={form.adecuacion}>{form.adecuacion}</option>
                  ) : null}
                </select>
              </label>
            ) : null}

            <label>
              Ruta
              <select
                value={form.rutaTransporteId}
                onChange={(e) => {
                  const rutaId = e.target.value;
                  const ruta = rutasTransporte.find((item) => String(item.RutaTransporteId) === String(rutaId));
                  setForm({
                    ...form,
                    rutaTransporteId: rutaId,
                    rutaTransporteHabitual: ruta?.Descripcion || ""
                  });
                }}
              >
                <option value="">Seleccione</option>
                {rutasTransporte.filter((item) => item.Activo).map((item) => (
                  <option key={item.RutaTransporteId} value={item.RutaTransporteId}>
                    {item.Descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <input
                type="checkbox"
                checked={!!form.autorizaWhatsAppEncargado}
                onChange={(e) => setForm({ ...form, autorizaWhatsAppEncargado: e.target.checked })}
              />
              <span>
                Padre, madre o encargado autoriza recibir información por WhatsApp
                <small style={{ display: "block", opacity: 0.75 }}>
                  Marcar Sí cuando exista visto bueno para enviar información institucional por WhatsApp.
                </small>
              </span>
            </label>

            <label>
              Discapacidad
              <select
                value={form.discapacidad}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discapacidad: e.target.value,
                    tipoDiscapacidad:
                      e.target.value === "Sí" ? form.tipoDiscapacidad : ""
                  })
                }
              >
                <option value="">Seleccione</option>
                <option value="Sí">Sí</option>
                <option value="No">No</option>
              </select>
            </label>

            {form.discapacidad === "Sí" ? (
              <label>
                Tipo de discapacidad
                <input
                  value={form.tipoDiscapacidad}
                  onChange={(e) =>
                    setForm({ ...form, tipoDiscapacidad: e.target.value })
                  }
                />
              </label>
            ) : null}

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

            <section
              style={{
                display: "grid",
                gap: "12px",
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)"
              }}
            >
              <strong style={{ fontSize: "14px" }}>Seguimiento de adecuación</strong>
              <small style={{ opacity: 0.8, marginTop: "-6px" }}>
                Estos dos campos se usan juntos para describir el apoyo y el seguimiento del estudiante.
              </small>

              <label>
                Nivel de funcionamiento
                <input
                  value={form.nivelFuncionamiento}
                  onChange={(e) =>
                    setForm({ ...form, nivelFuncionamiento: e.target.value })
                  }
                />
              </label>

              <label>
                Observaciones
                <textarea
                  value={form.observaciones}
                  onChange={(e) =>
                    setForm({ ...form, observaciones: e.target.value })
                  }
                  rows={3}
                />
              </label>
            </section>

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

            <SectionTitle>Datos de encargados</SectionTitle>
            <EncargadoBlockStable
              title="Encargado 1"
              value={encargadoPrincipalForm}
              onChange={setEncargadoPrincipalForm}
            />
            <EncargadoBlockStable
              title="Encargado 2"
              value={encargadoSecundarioForm}
              onChange={setEncargadoSecundarioForm}
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
          ) : null
        ) : (
          <div style={{ color: "#6b7280" }}>
            Este rol puede consultar estudiantes, ver carnets y generar boletas
          </div>
        )}
      </section>

      <section className="card">
        {canImportStudents && (
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
              disabled={importandoExcel}
            >
              Descargar plantilla
            </button>
          </div>

          <form
            onSubmit={handleImportarExcel}
            aria-busy={importandoExcel}
            style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={importandoExcel}
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

          {importandoExcel && (
            <div className="processing-indicator" role="status" aria-live="polite">
              <span className="processing-spinner" aria-hidden="true" />
              <div className="processing-body">
                <strong>Procesando importacion de estudiantes</strong>
                <span>
                  {importProgress
                    ? `${importProgress.procesados} de ${importProgress.totalRegistros} filas procesadas`
                    : "Preparando archivo..."}
                </span>
                <div className="processing-progress-track" aria-label="Progreso de importacion">
                  <div
                    className="processing-progress-bar"
                    style={{ width: `${Math.max(0, Math.min(100, importProgress?.porcentaje || 0))}%` }}
                  />
                </div>
                <div className="processing-progress-meta">
                  <span>{importProgress?.porcentaje || 0}%</span>
                  <span>Creados: {importProgress?.totalCreados || 0}</span>
                  <span>Actualizados: {importProgress?.totalActualizados || 0}</span>
                  <span>Reactivados: {importProgress?.totalReactivados || 0}</span>
                  <span>Omitidos: {importProgress?.totalOmitidos || 0}</span>
                  <span>Errores: {importProgress?.totalError || 0}</span>
                </div>
                <span>No refresques ni cierres esta pantalla hasta que aparezca el resultado.</span>
              </div>
            </div>
          )}

          {importResult && (
            <div style={{ marginTop: "14px" }}>
              <div><strong>Total registros:</strong> {importResult.totalRegistros}</div>
              <div><strong>Creados:</strong> {importResult.totalCreados || 0}</div>
              <div><strong>Actualizados:</strong> {importResult.totalActualizados || 0}</div>
              <div><strong>Reactivados y actualizados:</strong> {importResult.totalReactivados || 0}</div>
              <div><strong>Omitidos:</strong> {importResult.totalOmitidos || 0}</div>
              <div><strong>Con error:</strong> {importResult.totalError}</div>

              <button
                type="button"
                className="primary-btn"
                onClick={handleDescargarResumenImportacion}
                style={{ marginTop: "12px" }}
              >
                Exportar resumen a Excel
              </button>

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
        )}

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
            placeholder="Buscar por identificacion, nombre, nacionalidad, tipo o ruta"
            value={search}
            onChange={(e) => {
              const nextValue = e.target.value;
              setSearch(nextValue);
              if (!nextValue.trim()) clearStudentResults();
            }}
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
              clearStudentResults();
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
            onChange={(e) => {
              const checked = e.target.checked;
              setIncluirInactivos(checked);
              const queryToReload = lastSearch || search.trim();
              if (queryToReload) {
                load(queryToReload, checked, 1);
              } else {
                clearStudentResults();
              }
            }}
          />
          Incluir estudiantes inactivos
        </label>

        {!lastSearch ? (
          <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "#cbd5e1", fontWeight: 800 }}>
            Digite un valor de busqueda para mostrar estudiantes. El listado completo se reserva para reportes.
          </div>
        ) : (
          <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
          <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
            {loadingListado
              ? "Cargando estudiantes..."
              : `Mostrando ${pageStart}-${pageEnd} de ${totalItems} estudiantes`}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              disabled={loadingListado || page <= 1}
              onClick={() => load(lastSearch, incluirInactivos, page - 1)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer" }}
            >
              Anterior
            </button>
            <span style={{ color: "#cbd5e1", fontWeight: 800 }}>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={loadingListado || page >= totalPages}
              onClick={() => load(lastSearch, incluirInactivos, page + 1)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer" }}
            >
              Siguiente
            </button>
          </div>
        </div>

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
                <th>Tipo</th>
                <th>Nivel de funcionamiento</th>
                <th>Observaciones</th>
                <th>Ruta</th>
                <th>VB WhatsApp</th>
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
                    <td>{item.TipoEstudianteDescripcion ?? ""}</td>
                    <td>{item.NivelFuncionamiento ?? ""}</td>
                    <td>{item.Observaciones ?? ""}</td>
                    <td>{item.RutaTransporteDescripcion ?? item.RutaTransporteHabitual ?? ""}</td>
                    <td>{item.AutorizaWhatsAppEncargado ? "Sí" : "No"}</td>
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

                        {canAccessStudentMatricula && item.Activo && (
                          <button
                            type="button"
                            onClick={() => (isProfesorRole ? handleOpenBoletaConducta(item) : handleGoToMatricula(item))}
                            style={{
                              border: "1px solid #bbf7d0",
                              background: "#ecfdf3",
                              color: "#166534",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              cursor: "pointer"
                            }}
                          >
                            {isProfesorRole ? "Generar Boleta" : "Matrícula"}
                          </button>
                        )}

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
                            Eliminar
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
                      <td colSpan={studentsTableColSpan} style={{ padding: "14px" }}>
                        {detalleCargandoId === item.EstudianteId ? (
                          <div
                            ref={detalleVisibleRef}
                            style={{
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "16px",
                              padding: "16px",
                              display: "grid",
                              gap: "10px",
                              background: "rgba(255,255,255,0.03)"
                            }}
                          >
                            <SectionTitle>Detalle del estudiante</SectionTitle>
                            <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
                              Cargando datos del estudiante...
                            </div>
                            <div className="processing-progress-track" aria-label="Progreso de carga del detalle del estudiante">
                              <div
                                className="processing-progress-bar"
                                style={{ width: `${Math.max(0, Math.min(100, detalleCargaPorcentaje))}%` }}
                              />
                            </div>
                            <div className="processing-progress-meta">
                              <span>{detalleCargaPorcentaje}%</span>
                              <span>Preparando datos y encargados</span>
                            </div>
                          </div>
                        ) : detalleEstudiante ? (
                          <div
                            ref={detalleVisibleRef}
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
                              <div><strong>Tipo de identificación:</strong> {detalleEstudiante.TipoIdentificacion || ""}</div>
                              <div><strong>Sexo:</strong> {detalleEstudiante.Sexo || ""}</div>
                              <div><strong>Nacionalidad:</strong> {detalleEstudiante.Nacionalidad || ""}</div>
                              <div><strong>Repitente:</strong> {detalleEstudiante.Repitente ? "Sí" : "No"}</div>
                              <div><strong>Refugiado:</strong> {detalleEstudiante.Refugiado ? "Sí" : "No"}</div>
                              <div><strong>Tipo de estudiante:</strong> {detalleEstudiante.TipoEstudianteDescripcion || ""}</div>
                              <div><strong>Adecuación:</strong> {detalleEstudiante.Adecuacion || ""}</div>
                              <div><strong>Nivel de funcionamiento:</strong> {detalleEstudiante.NivelFuncionamiento || ""}</div>
                              <div><strong>Discapacidad:</strong> {detalleEstudiante.Discapacidad || ""}</div>
                              <div><strong>Tipo de discapacidad:</strong> {detalleEstudiante.TipoDiscapacidad || ""}</div>
                              <div><strong>Enfermedad:</strong> {detalleEstudiante.Enfermedad || ""}</div>
                              <div><strong>Ruta transporte:</strong> {detalleEstudiante.RutaTransporteDescripcion || detalleEstudiante.RutaTransporteHabitual || ""}</div>
                              <div><strong>VB WhatsApp encargado:</strong> {detalleEstudiante.AutorizaWhatsAppEncargado ? "Sí" : "No"}</div>
                              <div><strong>Observaciones:</strong> {detalleEstudiante.Observaciones || ""}</div>
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
                              <DetailCardStable title="Encargado 1" encargado={detalleEncargadoPrincipal} />
                              <DetailCardStable title="Encargado 2" encargado={detalleEncargadoSecundario} />
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
                  <td colSpan={studentsTableColSpan} style={{ textAlign: "center", padding: "16px" }}>
                    No hay estudiantes que coincidan con la busqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </>
        )}

        {boletaConductaOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 50, display: "grid", placeItems: "center", padding: "18px" }}>
            <div style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflow: "auto", background: "#ffffff", borderRadius: "16px", border: "1px solid #cbd5e1", padding: "16px", display: "grid", gap: "12px" }}>
              <h3 style={{ margin: 0, color: "#0f172a" }}>Generar Boleta de Reporte de Conducta</h3>
              {boletaConductaLoading ? (
                <div>Cargando contexto...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                    <label>Fecha<input value={String(boletaConductaContexto?.fecha || "").slice(0, 10)} readOnly /></label>
                    <label>N° (consecutivo)<input value={boletaConductaContexto?.codigoBoleta || String(boletaConductaContexto?.siguienteNumero || "")} readOnly /></label>
                    <label>Estudiante<input value={boletaConductaContexto?.estudianteNombre || getStudentFullName(boletaConductaItem || { Nombre: "", PrimerApellido: "", SegundoApellido: "" })} readOnly /></label>
                    <label>Sección<input value={boletaConductaContexto?.seccion || ""} readOnly /></label>
                    <label>Persona funcionaria<input value={boletaConductaContexto?.funcionarioNombre || ""} readOnly /></label>
                    <label>Colegio<input value={boletaConductaContexto?.institucion?.NombreOficialBoleta || boletaConductaContexto?.institucion?.NombreComercial || boletaConductaContexto?.institucion?.Nombre || ""} readOnly /></label>
                  </div>
                  <label>Detalle de los hechos
                    <textarea rows={6} value={boletaConductaDetalleHechos} onChange={(e) => setBoletaConductaDetalleHechos(e.target.value)} placeholder="Describí el hecho reportado..." />
                  </label>
                  <label>Lugar del acontecimiento
                    <input value={boletaConductaLugar} onChange={(e) => setBoletaConductaLugar(e.target.value)} placeholder="Ejemplo: Aula 8-3, cancha, pasillo..." />
                  </label>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setBoletaConductaOpen(false); setBoletaConductaItem(null); setBoletaConductaContexto(null); }} style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                    <button type="button" className="primary-btn" disabled={boletaConductaSaving} onClick={handleGuardarBoletaConducta}>
                      {boletaConductaSaving ? "Generando..." : "Generar e imprimir boleta"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}




