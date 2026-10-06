import { aceptaWhatsAppAlumno, esMayorParaWhatsApp, permisoEncargadosEnFicha } from "../utils/consentimientoWhatsApp";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";
import { getCostaRicaIsoDate } from "../utils/date";
import {
  groupLevel, levelName, sortedGroups, automaticEnrollment, transportDescription, asDate, asFlag, asText, enrollmentError, enrollmentForm, enrollmentPayload, fullName, phonePayload,
  guardianForm, guardiansForm, isActiveEnrollment, previousEnrollment,
  saveCombined, studentError, studentForm, studentHistory, studentPayload, validAdecuacion,
  type EnrollmentForm, type GuardianForm, type RecordData, type StudentForm
} from "../features/estudiantes-matricula/model";
import "./EstudiantesMatriculaPage.css";

type Catalogs = { years: RecordData[]; groups: RecordData[]; specialties: RecordData[]; types: RecordData[]; supports: RecordData[]; routes: RecordData[]; identificationTypes: RecordData[]; nationalities: RecordData[]; guardianTypes: RecordData[]; domain: string };
const emptyCatalogs: Catalogs = { years: [], groups: [], specialties: [], types: [], supports: [], routes: [], identificationTypes: [], nationalities: [], guardianTypes: [], domain: "" };
type ConductaFaltaCatalog = { FaltaConductaId: number; TipoFalta: string; Falta: string; Articulo: string };
const errorText = (error: any) => error?.response?.data?.message || error?.message || "No se pudo completar la operación. Intentá nuevamente.";
const fingerprint = (form: StudentForm, guardians: GuardianForm[]) => JSON.stringify(studentPayload(form, guardians));
const isValidEmail = (value: unknown) => /^\S+@\S+\.\S+$/.test(asText(value).trim());

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "em-field em-wide" : "em-field"}><span>{label}</span>{children}</label>;
}
function Check({ label, checked, onChange, disabled = false, help }: { label: string; checked: boolean; onChange?: (value: boolean) => void; disabled?: boolean; help?: string }) {
  return <label className="em-check" title={help}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange?.(e.target.checked)} />{label}</label>;
}
function CatalogSelect({ value, onChange, rows, idKey, textKey = "Descripcion", placeholder = "Seleccione", currentLabel, legacyLabel, required = false }: {
  value: string; onChange: (value: string) => void; rows: RecordData[]; idKey: string; textKey?: string; placeholder?: string; currentLabel?: string; legacyLabel?: string; required?: boolean;
}) {
  const selectable = rows.filter(row => asFlag(row.Activo) || asText(row[idKey]) === value);
  return <select value={value || (legacyLabel ? "__legacy__" : "")} required={required} onChange={e => { if (e.target.value !== "__legacy__") onChange(e.target.value); }}>
    <option value="">{placeholder}</option>
    {!value && legacyLabel && <option value="__legacy__">{legacyLabel} (valor registrado)</option>}
    {value && !selectable.some(row => asText(row[idKey]) === value) && <option value={value}>{currentLabel || value} (valor registrado)</option>}
    {selectable.map(row => <option key={row[idKey]} value={row[idKey]} disabled={!asFlag(row.Activo)}>{row[textKey]}{!asFlag(row.Activo) ? " (inactivo)" : ""}{row.PermiteMultiplesPorSeccion ? " · varias especialidades por sección" : ""}</option>)}
  </select>;
}

export default function EstudiantesMatriculaPage({ teacherView = false }: { teacherView?: boolean }) {
  const { user } = useAuth();
  return <StudentEnrollmentWorkspace key={`${user?.institucionId ?? "none"}-${teacherView ? "teacher" : "admin"}`} teacherView={teacherView} />;
}

function StudentEnrollmentWorkspace({ teacherView = false }: { teacherView?: boolean }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.roles?.some(role => role.trim().toUpperCase() === "SUPER_ADMIN") ?? false;
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [results, setResults] = useState<RecordData[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [lastSearch, setLastSearch] = useState({ query: "", inactive: false });
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [opened, setOpened] = useState(false);
  const [form, setForm] = useState(studentForm);
  const [guardians, setGuardians] = useState(() => guardiansForm());
  const [savedStudent, setSavedStudent] = useState(() => fingerprint(studentForm(), guardiansForm()));
  const [history, setHistory] = useState<RecordData[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [showInactiveHistory, setShowInactiveHistory] = useState(false);
  const [enrollment, setEnrollment] = useState(() => enrollmentForm());
  const [savedEnrollment, setSavedEnrollment] = useState(() => JSON.stringify(enrollmentForm()));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [partialSave, setPartialSave] = useState(false);
  const [conflictStudentId, setConflictStudentId] = useState<number | null>(null);
  const [conflictEnrollmentId, setConflictEnrollmentId] = useState<number | null>(null);
  const [suspensionOpen, setSuspensionOpen] = useState(false);
  const [suspension, setSuspension] = useState({ motivo: "Medida Precautoria", fechaInicio: "", fechaFin: "", observacion: "" });
  const [statusHistoryOpen, setStatusHistoryOpen] = useState(false);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<{ suspensiones: RecordData[]; inactivaciones: RecordData[] }>({ suspensiones: [], inactivaciones: [] });
  const [inactivacionOpen, setInactivacionOpen] = useState(false);
  const [inactivacionEditing, setInactivacionEditing] = useState(false);
  const [inactivacion, setInactivacion] = useState({ motivo: "Abandono", observacion: "" });
  const [conductOpen, setConductOpen] = useState(false);
  const [conductRows, setConductRows] = useState<RecordData[]>([]);
  const [conductContext, setConductContext] = useState<RecordData | null>(null);
  const [conductFaltas, setConductFaltas] = useState<ConductaFaltaCatalog[]>([]);
  const [conduct, setConduct] = useState({ faltaConductaId: "", detalleNormativa: "", lugarAcontecimiento: "" });
  const [savedTeacherConsent, setSavedTeacherConsent] = useState({ encargado: false, estudiante: null as boolean | null });
  const studentFieldsRef = useRef<HTMLFieldSetElement>(null);
  const enrollmentFieldsRef = useRef<HTMLFieldSetElement>(null);
  const enrollmentSectionRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const esMayor = esMayorParaWhatsApp(form.fechaNacimiento, getCostaRicaIsoDate());
  const principalGuardianIndex = Math.max(guardians.findIndex(guardian => guardian.esPrincipal), 0);
  const principalGuardian = guardians[principalGuardianIndex];
  const currentTeacherConsent = {
    encargado: principalGuardian?.aceptaWhatsApp ?? form.autorizaWhatsAppEncargado,
    estudiante: esMayor ? form.aceptaWhatsAppEstudiante : null
  };
  const teacherConsentDirty = teacherView && !!selected && (
    currentTeacherConsent.encargado !== savedTeacherConsent.encargado ||
    currentTeacherConsent.estudiante !== savedTeacherConsent.estudiante
  );
  const teacherConsentAccepted = currentTeacherConsent.encargado || currentTeacherConsent.estudiante === true;
  const teacherAuthorizationMatriculaId = editingId || Number(history.find(row => isActiveEnrollment(row))?.MatriculaId || 0) || null;
  const contactosRegistrados = studentPayload(form, guardians).encargados;
  const permisoEncargados = permisoEncargadosEnFicha(esMayor, form.autorizaWhatsAppEncargado, contactosRegistrados);
  const studentDirty = fingerprint(form, guardians) !== savedStudent;
  const enrollmentDirty = JSON.stringify(enrollment) !== savedEnrollment;
  const dirty = opened && (studentDirty || enrollmentDirty);
  const inactive = !!selected && !asFlag(selected.Activo);
  const edited = history.find(row => Number(row.MatriculaId) === editingId);
  const inactiveEnrollment = !!edited && !isActiveEnrollment(edited);
  const yearActive = catalogs.years.some(year => asText(year.AnioLectivoId) === enrollment.anioLectivoId && asFlag(year.Activo));
  const isTransfer = !!edited && asText(edited.GrupoId) !== enrollment.grupoId;
  const prior = previousEnrollment(history, enrollment.anioLectivoId);
  const groupOptions = sortedGroups(catalogs.groups.filter(group => asText(group.AnioLectivoId) === enrollment.anioLectivoId));

  const suspended = asFlag(selected?.Suspendido);
  const derivedEnrollment = automaticEnrollment(enrollment, form, guardians, catalogs.groups, catalogs.routes);
  const destinatariosBoletaCorreo = guardians.filter(guardian => guardian.aceptaCorreo && isValidEmail(guardian.correo));
  const puedeEnviarBoletaCorreo = !!editingId && !studentDirty && destinatariosBoletaCorreo.length > 0;
  const motivoEnvioBoletaCorreo = !editingId
    ? "Guardá primero la matrícula para enviar la boleta."
    : studentDirty
      ? "Guardá los cambios del estudiante y sus encargados antes de enviar la boleta."
    : destinatariosBoletaCorreo.length === 0
      ? "Al menos un encargado debe tener un correo válido y marcar Acepta correo para habilitar el envío."
      : "Enviar la boleta de matrícula al correo de los encargados que aceptaron recibirla.";
  const levelOptions = [...new Set(groupOptions.map(groupLevel).map(level => Number(level)).filter(level => level >= 7 && level <= 12))].sort((a, b) => a - b);
  const sectionOptions = sortedGroups(groupOptions.filter(group => groupLevel(group) === enrollment.nivelAcademico && Number(groupLevel(group)) >= 7 && Number(groupLevel(group)) <= 12));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { void loadCatalogs(); }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ""; } };
    // BrowserRouter no admite useBlocker; proteger los enlaces de navegación
    // sin modificar el router ni los comportamientos de las pantallas anteriores.
    const beforeLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (lock.current || (dirty && !window.confirm("Hay cambios sin guardar. ¿Deseás salir de esta ficha?"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeLink, true); };
  }, [dirty]);
  useEffect(() => { if (error || message) feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [error, message]);

  async function loadCatalogs() {
    if (teacherView) { setCatalogLoading(false); return; }
    setCatalogLoading(true); setCatalogError("");
    try {
      const responses = await Promise.all([
        api.get("/academico/anios-lectivos", { params: { incluirInactivos: true } }),
        api.get("/academico/grupos", { params: { incluirInactivos: true } }),
        api.get("/academico/especialidades", { params: { incluirInactivas: true } }),
        api.get("/academico/tipos-estudiante", { params: { incluirInactivos: true } }),
        api.get("/academico/tipos-adecuacion", { params: { incluirInactivos: true } }),
        api.get("/academico/rutas-transporte", { params: { incluirInactivas: true } }),
        api.get("/academico/configuracion-correo-estudiante"),
        api.get("/estudiantes/catalogos-matricula/TIPO_IDENTIFICACION"),
        api.get("/estudiantes/catalogos-matricula/NACIONALIDAD"),
        api.get("/estudiantes/catalogos-matricula/TIPO_ENCARGADO")
      ]);
      if (!mounted.current) return;
      const [years, groups, specialties, types, supports, routes, config, identificationTypes, nationalities, guardianTypes] = responses.map(r => r.data?.data);
      setCatalogs({ years: years || [], groups: groups || [], specialties: specialties || [], types: types || [], supports: supports || [], routes: routes || [], identificationTypes: identificationTypes || [], nationalities: nationalities || [], guardianTypes: guardianTypes || [], domain: asText(config?.dominio || "@est.mep.go.cr") });
    } catch (cause) { if (mounted.current) setCatalogError(errorText(cause)); }
    finally { if (mounted.current) setCatalogLoading(false); }
  }

  function discardChanges() { return !dirty || window.confirm("Hay cambios sin guardar. ¿Deseás descartarlos y continuar?"); }
  async function run(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setMessage("");
    try { await action(); }
    catch (cause: any) {
      setError(errorText(cause));
      const data = cause?.response?.data;
      if (data?.code === "ESTUDIANTE_INACTIVO") setConflictStudentId(Number(data.estudianteId));
      if (data?.code === "MATRICULA_INACTIVA") setConflictEnrollmentId(Number(data.matriculaId));
    } finally { lock.current = false; if (mounted.current) setBusy(""); }
  }

  function defaultYear() {
    const active = catalogs.years.filter(row => asFlag(row.Activo));
    return asText((active.find(row => asText(row.Nombre) === getCostaRicaIsoDate().slice(0, 4)) || active[0])?.AnioLectivoId);
  }
  function applyYear(year: string, rows: RecordData[], student: StudentForm, contacts: GuardianForm[]) {
    const active = teacherView
      ? rows.find(isActiveEnrollment) || rows[0]
      : rows.find(row => asText(row.AnioLectivoId) === year && isActiveEnrollment(row));
    const targetYear = teacherView ? asText(active?.AnioLectivoId) : year;
    const draft = enrollmentForm(active, targetYear, getCostaRicaIsoDate());
    if (teacherView && active) {
      setCatalogs(current => ({
        ...current,
        years: [{ AnioLectivoId: active.AnioLectivoId, Nombre: active.AnioNombre, Activo: true }],
        groups: [{ GrupoId: active.GrupoId, AnioLectivoId: active.AnioLectivoId, Nombre: active.GrupoNombre, Nivel: active.GrupoNivel, NivelAcademico: active.GrupoNivelAcademico, Especialidad: active.GrupoEspecialidad, Activo: true }],
        specialties: active.EspecialidadId ? [{ EspecialidadId: active.EspecialidadId, Descripcion: active.EspecialidadDescripcion || active.Especialidad, Activo: true }] : []
      }));
    }
    if (!active) {
      draft.rutaTransporte = student.rutaTransporteHabitual;
      draft.correoEnvioBoleta = (contacts.find(g => g.esPrincipal) || contacts[0])?.correo || "";
    }
    setEnrollment(draft); setSavedEnrollment(JSON.stringify(draft)); setEditingId(active ? Number(active.MatriculaId) : null);
    setConflictEnrollmentId(null); setPartialSave(false);
  }
  async function fetchHistory(student: RecordData): Promise<RecordData[]> {
    if (teacherView) {
      const response = await api.get(`/estudiantes/${student.EstudianteId}/matriculas-historial`);
      return Array.isArray(response.data?.data) ? response.data.data : [];
    }
    const response = await api.get("/academico/matriculas", { params: { q: student.Identificacion, incluirInactivas: true } });
    return studentHistory(response.data?.data || [], Number(student.EstudianteId));
  }
  async function loadStudent(id: number) {
    const response = await api.get(`/estudiantes/${id}/detalle`);
    const record = response.data?.data?.estudiante;
    if (!record?.EstudianteId) throw new Error("No se pudo cargar la ficha del estudiante.");
    const personal = studentForm(record, catalogs.routes);
    const contacts = guardiansForm(response.data?.data?.encargados || []);
    if (teacherView) {
      setCatalogs(current => ({
        ...current,
        identificationTypes: personal.tipoIdentificacion ? [{ Descripcion: personal.tipoIdentificacion, Activo: true }] : [],
        nationalities: personal.nacionalidad ? [{ Descripcion: personal.nacionalidad, Activo: true }] : [],
        types: personal.tipoEstudianteId ? [{ TipoEstudianteId: personal.tipoEstudianteId, Descripcion: asText(record.TipoEstudianteDescripcion), Activo: true }] : [],
        routes: personal.rutaTransporteId ? [{ RutaTransporteId: personal.rutaTransporteId, Descripcion: asText(record.RutaTransporteDescripcion || personal.rutaTransporteHabitual), Activo: true }] : [],
        supports: personal.adecuacion ? [{ TipoAdecuacionId: 0, Descripcion: personal.adecuacion, Activo: true }] : [],
        guardianTypes: contacts.filter(contact => contact.tipoEncargado).map(contact => ({ Descripcion: contact.tipoEncargado, Activo: true })),
        domain: ""
      }));
    }
    setSelected(record); setForm(personal); setGuardians(contacts); setSavedStudent(fingerprint(personal, contacts));
    const principal = contacts.find(contact => contact.esPrincipal) || contacts[0];
    setSavedTeacherConsent({ encargado: principal?.aceptaWhatsApp ?? !!record.AutorizaWhatsAppEncargado, estudiante: esMayorParaWhatsApp(personal.fechaNacimiento, getCostaRicaIsoDate()) ? personal.aceptaWhatsAppEstudiante : null });
    setOpened(true); setShowSearchResults(false); setHistory([]); setHistoryReady(false); setConflictStudentId(null); setConflictEnrollmentId(null);
    setSuspensionOpen(false); setConductOpen(false); setConductContext(null); setConductRows([]);
    applyYear(defaultYear(), [], personal, contacts);
    try {
      const rows = await fetchHistory(record);
      setHistory(rows); setHistoryReady(true); applyYear(defaultYear(), rows, personal, contacts);
    } catch (cause) { throw new Error(`La ficha está cargada, pero no se pudo consultar la matrícula. Reintentá la consulta antes de matricular. ${errorText(cause)}`); }
  }
  function openStudent(id: number) {
    if (!discardChanges()) return;
    void run("Cargando expediente…", () => loadStudent(id));
  }
  function newStudent() {
    if (teacherView) return;
    if (lock.current || !discardChanges()) return;
    const personal = studentForm(); const contacts = guardiansForm();
    setSelected(null); setForm(personal); setGuardians(contacts); setSavedStudent(fingerprint(personal, contacts));
    setOpened(true); setHistory([]); setHistoryReady(true); setError(""); setMessage(""); setConflictStudentId(null);
    setConductOpen(false); setConductContext(null); setSuspensionOpen(false);
    applyYear(defaultYear(), [], personal, contacts);
  }
  async function search(page = 1, usePrevious = false) {
    const criteria = usePrevious ? lastSearch : { query: query.trim(), inactive: includeInactive };
    if (!criteria.query) { setError("Escribí una identificación, nombre o sección para buscar."); return; }
    await run("Buscando estudiantes…", async () => {
      const response = await api.get("/estudiantes", { params: { q: criteria.query, incluirInactivos: criteria.inactive, page, pageSize: 10 } });
      const data = response.data?.data;
      setResults(Array.isArray(data) ? data : data?.items || []);
      setSearchTotal(Array.isArray(data) ? data.length : Number(data?.total || 0));
      setSearchPage(page); setSearchDone(true); setShowSearchResults(true); setLastSearch(criteria);
    });
  }
  function changeStudent<K extends keyof StudentForm>(key: K, value: StudentForm[K]) { setForm(prev => ({ ...prev, [key]: value })); }
  function changeEnrollment<K extends keyof EnrollmentForm>(key: K, value: EnrollmentForm[K]) { setEnrollment(prev => ({ ...prev, [key]: value })); }
  function changeGuardian<K extends keyof GuardianForm>(index: number, key: K, value: GuardianForm[K]) {
    setGuardians(prev => prev.map((g, i) => {
      if (i === index) return {
        ...g,
        [key]: value,
        ...(key === "correo" && !isValidEmail(value) ? { aceptaCorreo: false } : {}),
        ...(key === "telefono" && !phonePayload(value) ? { aceptaWhatsApp: false } : {})
      };
      return key === "esPrincipal" && value === true ? { ...g, esPrincipal: false } : g;
    }));
  }
  function changeTeacherGuardianConsent(value: boolean) {
    setGuardians(prev => prev.map((guardian, index) => index === principalGuardianIndex ? { ...guardian, aceptaWhatsApp: value } : guardian));
    setForm(prev => ({ ...prev, autorizaWhatsAppEncargado: value }));
  }
  function changeYear(year: string) {
    if (enrollmentDirty && !window.confirm("Hay cambios de matrícula sin guardar. ¿Deseás cambiar de año?")) return;
    applyYear(year, history, form, guardians);
  }
  function changeGroup(id: string) {
    const group = catalogs.groups.find(row => asText(row.GrupoId) === id);
    setEnrollment(prev => ({ ...prev, grupoId: id, nivelAcademico: groupLevel(group), seccionTexto: asText(group?.Nombre), especialidadId: "", especialidad: asText(group?.Especialidad) }));
  }
  function editEnrollment(row: RecordData) {
    if (enrollmentDirty && !window.confirm("¿Descartar los cambios de matrícula y abrir este registro?")) return;
    const next = enrollmentForm(row);
    setEnrollment(next); setSavedEnrollment(JSON.stringify(next)); setEditingId(Number(row.MatriculaId)); setPartialSave(false); setConflictEnrollmentId(null);
    enrollmentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  async function refreshHistory() {
    if (!selected || (enrollmentDirty && !window.confirm("¿Descartar los cambios de matrícula y volver a consultar?"))) return;
    await run("Actualizando matrículas…", async () => {
      const rows = await fetchHistory(selected); setHistory(rows); setHistoryReady(true);
      applyYear(enrollment.anioLectivoId || defaultYear(), rows, form, guardians);
    });
  }
  function validateFields(container: HTMLFieldSetElement | null) {
    const controls = Array.from(container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea") || []);
    const invalid = controls.find(control => !control.disabled && !control.checkValidity());
    if (!invalid) return true;
    let parent: Element | null = invalid.parentElement;
    while (parent && parent !== container) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      if (parent instanceof HTMLDialogElement && !parent.open) parent.showModal();
      parent = parent.parentElement;
    }
    invalid.reportValidity(); return false;
  }
  async function save(withEnrollment: boolean) {
    if (lock.current || inactive) return;
    if (!phonePayload(guardians[0]?.telefono)) { setError("El teléfono del encargado 1 es obligatorio."); return; }
    const secondGuardian = guardians[1];
    const hasSecondGuardian = !!secondGuardian && [secondGuardian.identificacion, secondGuardian.nombre, secondGuardian.primerApellido, secondGuardian.segundoApellido, secondGuardian.correo, phonePayload(secondGuardian.telefono), secondGuardian.direccionExacta].some(value => asText(value).trim());
    if (hasSecondGuardian && !phonePayload(secondGuardian.telefono)) { setError("El teléfono del encargado 2 es obligatorio cuando se registran sus datos."); return; }
    const personalError = studentError(form);
    if (personalError) { setError(personalError); return; }
    if (!validateFields(studentFieldsRef.current) || (withEnrollment && !validateFields(enrollmentFieldsRef.current))) return;
    if (withEnrollment) {
      if (catalogLoading || catalogError || !historyReady) { setError("Primero cargá los catálogos y el historial de matrícula."); return; }
      if (inactiveEnrollment) { setError("La matrícula está inactiva. Reactivala antes de editarla."); return; }
      const problem = enrollmentError(derivedEnrollment, history, editingId, catalogs.groups, catalogs.years, catalogs.specialties);
      if (problem) { setError(problem); return; }
      if (isTransfer && !window.confirm(`¿Confirmás el traslado de ${edited?.GrupoNombre || edited?.GrupoId} a ${groupOptions.find(g => asText(g.GrupoId) === enrollment.grupoId)?.Nombre || enrollment.seccionTexto}? Se ejecutará el proceso existente de traslado de notas, seguimiento y asistencia.`)) return;
    }
    await run(withEnrollment ? "Guardando estudiante y matrícula…" : "Guardando datos…", async () => {
      const normalizedStudent = { ...form, autorizaWhatsAppEncargado: permisoEncargados,
        rutaTransporteHabitual: transportDescription(form, catalogs.routes) };
      const needsStudentSave = fingerprint(normalizedStudent, guardians) !== savedStudent;
      let current = selected;
      let personalSaved = !!selected && !studentDirty;
      try {
        // Refrescar antes de escribir para detectar matrículas creadas en otra ventana.
        if (withEnrollment && current) {
          const latest = await fetchHistory(current); setHistory(latest);
          const problem = enrollmentError(derivedEnrollment, latest, editingId, catalogs.groups, catalogs.years, catalogs.specialties);
          if (problem) throw new Error(problem);
          if (editingId && !latest.some(row => Number(row.MatriculaId) === editingId && isActiveEnrollment(row))) throw new Error("La matrícula cambió o está inactiva. Actualizá el historial antes de continuar.");
        }
        await saveCombined<RecordData>({
          studentId: current ? Number(current.EstudianteId) : null, studentChanged: needsStudentSave, withEnrollment,
          saveStudent: async id => {
            const payload = studentPayload(normalizedStudent, guardians);
            const response = id ? await api.put(`/estudiantes/${id}`, payload) : await api.post("/estudiantes", payload);
            return response.data?.data;
          },
          studentSaved: record => {
            if (!record?.EstudianteId) throw new Error("El servicio no devolvió el identificador. Buscá al estudiante antes de intentar crearlo de nuevo.");
            current = { ...selected, ...record }; personalSaved = true;
            const saved = { ...normalizedStudent, correo: asText(record.Correo || form.correo) };
            setSelected(current); setForm(saved); setSavedStudent(fingerprint(saved, guardians)); setConflictStudentId(null);
            return Number(record.EstudianteId);
          },
          saveEnrollment: async id => {
            const payload = enrollmentPayload(derivedEnrollment, id);
            const response = editingId ? await api.put(`/academico/matriculas/${editingId}`, payload) : await api.post("/academico/matriculas", payload);
            const newId = Number(response.data?.data?.MatriculaId || editingId);
            if (!newId) throw new Error("El servicio no devolvió la matrícula. Actualizá el historial antes de reintentar.");
            // Registrar el éxito antes del GET de actualización (que también puede fallar).
            setEditingId(newId); setSavedEnrollment(JSON.stringify(enrollment)); setPartialSave(false); setConflictEnrollmentId(null);
          }
        });
      } catch (cause) {
        if (withEnrollment && personalSaved) {
          setPartialSave(true);
          throw Object.assign(new Error(`Los datos del estudiante están guardados. No se confirmó la matrícula: ${errorText(cause)}`), { response: undefined });
        }
        throw cause;
      }
      setMessage(withEnrollment ? "Datos y matrícula guardados correctamente. Ya podés abrir la boleta." : "Datos del estudiante guardados correctamente.");
      setPartialSave(false);
      if (withEnrollment && current) {
        try {
          const rows = await fetchHistory(current); setHistory(rows); setHistoryReady(true);
          applyYear(enrollment.anioLectivoId, rows, form, guardians);
        } catch {
          setHistoryReady(false);
          setError("La matrícula se guardó, pero no se pudo actualizar el historial. Volvé a consultar; no hace falta guardarla otra vez.");
        }
      }
    });
  }
  async function sendBoletaMatriculaEmail() {
    if (!editingId || !puedeEnviarBoletaCorreo) return;
    await run("Enviando boleta por correo…", async () => {
      const response = await api.post(`/boletas/matricula/${editingId}/enviar-correo`);
      setMessage(response.data?.message || "Boleta enviada por correo correctamente.");
    });
  }

  async function changeStudentStatus() {
    if (!selected || !discardChanges()) return;
    if (!inactive) {
      setInactivacion({ motivo: "Abandono", observacion: "" });
      setInactivacionEditing(false);
      setInactivacionOpen(true);
      return;
    }
    if (!window.confirm("¿Reactivar este estudiante y cerrar su inactivación vigente?")) return;
    await run(inactive ? "Reactivando estudiante…" : "Inactivando estudiante…", async () => {
      await api.patch(`/estudiantes/${selected.EstudianteId}/reactivar`);
      await loadStudent(Number(selected.EstudianteId)); setMessage(inactive ? "Estudiante reactivado." : "Estudiante inactivado.");
    });
  }
  async function editInactivation() {
    if (!selected) return;
    setInactivacion({ motivo: asText(selected.MotivoInactivacion) || "Abandono", observacion: asText(selected.ObservacionInactivacion) });
    setInactivacionEditing(true);
    setInactivacionOpen(true);
  }
  async function saveStudentInactivation() {
    if (!selected) return;
    await run("Actualizando causa…", async () => {
      if (inactivacionEditing) await api.put(`/estudiantes/${selected.EstudianteId}/inactivacion`, inactivacion);
      else await api.delete(`/estudiantes/${selected.EstudianteId}`, { data: inactivacion });
      await loadStudent(Number(selected.EstudianteId));
      setInactivacionOpen(false);
      setMessage(inactivacionEditing ? "Causa de inactivación actualizada." : `Estudiante inactivado por ${inactivacion.motivo}.`);
    });
  }
  async function changeEnrollmentStatus(row: RecordData) {
    if (!selected || !discardChanges()) return;
    const active = isActiveEnrollment(row);
    if (!active && history.some(other => Number(other.MatriculaId) !== Number(row.MatriculaId) && other.AnioLectivoId === row.AnioLectivoId && isActiveEnrollment(other))) { setError("Ya hay otra matrícula activa en ese año. No se puede reactivar esta matrícula."); return; }
    if (!window.confirm(active ? "¿Inactivar esta matrícula? Su historial se conserva." : "¿Reactivar esta matrícula existente?")) return;
    await run(active ? "Inactivando matrícula…" : "Reactivando matrícula…", async () => {
      if (active) await api.delete(`/academico/matriculas/${row.MatriculaId}`); else await api.patch(`/academico/matriculas/${row.MatriculaId}/reactivar`);
      const rows = await fetchHistory(selected); setHistory(rows); setHistoryReady(true);
      applyYear(asText(row.AnioLectivoId), rows, form, guardians);
      setMessage(active ? "Matrícula inactivada." : "Matrícula reactivada.");
    });
  }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Seleccioná una imagen para la foto."); return; }
    await run("Subiendo foto…", async () => {
      const data = new FormData(); data.append("archivo", file);
      const response = await api.post("/archivos/subir", data);
      const url = response.data?.data?.secure_url || response.data?.data?.url;
      if (!url) throw new Error("No se recibió la dirección de la foto.");
      changeStudent("fotoUrl", url); setMessage("Foto cargada. Guardá los datos para asociarla al estudiante.");
    });
    if (photoRef.current) photoRef.current.value = "";
  }
  function openSuspension() {
    setSuspension({ motivo: selected?.MotivoSuspension || "Medida Precautoria", fechaInicio: asDate(selected?.FechaInicioSuspension), fechaFin: asDate(selected?.FechaFinSuspension), observacion: selected?.ObservacionSuspension || "" });
    setSuspensionOpen(value => !value);
  }
  async function saveSuspension(remove = false) {
    if (!selected) return;
    if (!remove && (!suspension.fechaInicio || !suspension.fechaFin || suspension.fechaFin < suspension.fechaInicio)) { setError("Indicá fechas válidas de inicio y fin de suspensión."); return; }
    if (remove && !window.confirm("¿Retirar la suspensión del estudiante?")) return;
    await run("Actualizando suspensión…", async () => {
      const base = `/estudiantes/${selected.EstudianteId}/suspension`;
      if (remove) await api.delete(`${base}/${selected.SuspensionId}`);
      else if (suspended && selected.SuspensionId) await api.put(`${base}/${selected.SuspensionId}`, suspension);
      else await api.post(base, suspension);
      const response = await api.get(`/estudiantes/${selected.EstudianteId}/detalle`);
      setSelected(response.data.data.estudiante); setSuspensionOpen(false); setMessage("Suspensión actualizada. Los demás campos de la ficha se conservaron.");
    });
  }
  async function toggleStatusHistory() {
    if (!selected) return;
    if (statusHistoryOpen) { setStatusHistoryOpen(false); return; }
    setStatusHistoryLoading(true);
    try {
      const response = await api.get(`/estudiantes/${selected.EstudianteId}/estados-historial`);
      setStatusHistory({
        suspensiones: Array.isArray(response.data?.data?.suspensiones) ? response.data.data.suspensiones : [],
        inactivaciones: Array.isArray(response.data?.data?.inactivaciones) ? response.data.data.inactivaciones : []
      });
      setStatusHistoryOpen(true);
    } catch (error: any) {
      setError(error?.response?.data?.message || "No se pudo cargar el historial de estados.");
    } finally { setStatusHistoryLoading(false); }
  }
  async function saveTeacherWhatsAppConsent(): Promise<boolean> {
    if (!teacherView || !selected || !teacherConsentDirty) return false;
    const aceptaEstudiante = esMayor ? form.aceptaWhatsAppEstudiante : null;
    const aceptaEncargado = !!currentTeacherConsent.encargado;
    let saved = false;
    await run("Guardando autorización de WhatsApp…", async () => {
      await api.patch(`/estudiantes/${selected.EstudianteId}/consentimiento-whatsapp`, {
        aceptaWhatsAppEncargado: aceptaEncargado,
        aceptaWhatsAppEstudiante: aceptaEstudiante
      });
      const nextForm = { ...form, autorizaWhatsAppEncargado: aceptaEncargado, aceptaWhatsAppEstudiante: aceptaEstudiante };
      const nextGuardians = guardians.map((guardian, index) => index === principalGuardianIndex ? { ...guardian, aceptaWhatsApp: aceptaEncargado } : guardian);
      const nextStudent = { ...selected, AutorizaWhatsAppEncargado: aceptaEncargado, AceptaWhatsAppEstudiante: aceptaEstudiante };
      setSelected(nextStudent); setForm(nextForm); setGuardians(nextGuardians);
      setSavedTeacherConsent({ encargado: aceptaEncargado, estudiante: aceptaEstudiante });
      setSavedStudent(fingerprint(nextForm, nextGuardians));
      setMessage("La autorización de WhatsApp se guardó correctamente.");
      saved = true;
    });
    return saved;
  }
  async function printTeacherWhatsAppAuthorization() {
    if (!teacherAuthorizationMatriculaId || !teacherConsentAccepted) return;
    const url = `/boletas/matricula/${teacherAuthorizationMatriculaId}?solo=whatsapp`;
    if (teacherConsentDirty) {
      const popup = window.open("about:blank", "AutorizacionWhatsApp", "popup=yes,width=1100,height=900,resizable=yes,scrollbars=yes");
      if (!popup) { setError("Permití las ventanas emergentes para imprimir la autorización."); return; }
      if (!(await saveTeacherWhatsAppConsent())) { popup.close(); return; }
      popup.location.href = url;
      return;
    }
    window.open(url, "AutorizacionWhatsApp", "popup=yes,width=1100,height=900,resizable=yes,scrollbars=yes");
  }
  async function openConduct() {
    if (!selected) return;
    await run("Consultando boletas de conducta…", async () => {
      const response = await api.get(`/estudiantes/${selected.EstudianteId}/boletas-conducta`);
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setConductRows(rows.filter((row: RecordData) => Number(row.boletaConductaId) > 0)); setConductOpen(true); setConductContext(null);
    });
  }
  async function prepareConduct() {
    if (!selected) return;
    await run("Preparando boleta…", async () => {
      const [contextResponse, faltasResponse] = await Promise.all([
        api.get(`/boletas/conducta/contexto/${selected.EstudianteId}`),
        api.get("/boletas/conducta/faltas")
      ]);
      setConductContext(contextResponse.data?.data || {});
      setConductFaltas(Array.isArray(faltasResponse.data?.data) ? faltasResponse.data.data : []);
      setConduct({ faltaConductaId: "", detalleNormativa: "", lugarAcontecimiento: "" });
    });
  }
  async function createConduct(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    const customDetail = conduct.faltaConductaId === "normativa-interna";
    const chosenFault = conductFaltas.find(item => String(item.FaltaConductaId) === conduct.faltaConductaId);
    const detailText = customDetail ? conduct.detalleNormativa.trim() : chosenFault?.Falta || "";
    await run("Generando boleta…", async () => {
      const response = await api.post("/boletas/conducta", {
        estudianteId: selected.EstudianteId,
        faltaConductaId: chosenFault?.FaltaConductaId || null,
        segunNormativaInterna: customDetail,
        detalleHechos: detailText,
        lugarAcontecimiento: conduct.lugarAcontecimiento
      });
      const id = Number(response.data?.data?.boletaConductaId);
      if (!id) throw new Error("No se recibió la boleta generada.");
      const consecutivo = Number(response.data?.data?.consecutivo);
      const numeroBoleta = String(response.data?.data?.codigoBoleta || (consecutivo ? String(consecutivo).padStart(3, "0") : id));
      setConductContext(null);
      setMessage(`Boleta de conducta generada correctamente.`);
      setConductRows(prev => [{ boletaConductaId: id, numeroBoleta, fecha: getCostaRicaIsoDate(), detalleHechos: detailText, lugarAcontecimiento: conduct.lugarAcontecimiento, envioCorreo: false, envioWhatsApp: false }, ...prev]);
    });
  }

  const textInput = (key: keyof StudentForm, label: string, type = "text", required = false) => <Field label={label}><input type={type} required={required} value={asText(form[key])} onChange={e => changeStudent(key, e.target.value)} /></Field>;
  const enrollmentInput = (key: keyof EnrollmentForm, label: string, type = "text") => <Field label={label}><input type={type} value={asText(enrollment[key])} readOnly={key === "fechaMatricula"} onChange={e => changeEnrollment(key, e.target.value)} /></Field>;

  return <div className={`em-page ${teacherView ? "em-teacher-view" : ""}`}>
    {isSuperAdmin && <nav className="em-shortcuts" aria-label="Herramientas existentes"><Link to="/estudiantes" target="_blank" rel="noopener noreferrer">Estudiantes · listados e importación ↗</Link><Link to="/matricula" target="_blank" rel="noopener noreferrer">Matrícula · listados e importación ↗</Link><Link to="/administrativo" target="_blank" rel="noopener noreferrer">Catálogos institucionales ↗</Link><button onClick={() => void loadCatalogs()} disabled={catalogLoading || !!busy}>Actualizar catálogos</button></nav>}
    {catalogError && <div className="em-notice em-error" role="alert">No se pudieron cargar los catálogos: {catalogError} <button onClick={() => void loadCatalogs()} disabled={catalogLoading}>Reintentar</button></div>}
    <section className="em-panel em-search"><div className="em-section-title"><span className="em-step">01</span><div><h2>{teacherView ? "Buscar estudiante" : "Buscar o registrar estudiante"}</h2><p>Consultá primero para recuperar el expediente existente.</p></div></div>
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="em-search-form"><Field label="Identificación, nombre o sección"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Escribí para buscar…" /></Field><Check label="Incluir inactivos" checked={includeInactive} onChange={setIncludeInactive} /><button className="em-primary" disabled={!!busy}>Buscar estudiante</button></form>
      {teacherView ? <span title="Esta gestión se debe realizar ante la Dirección."><button type="button" className="em-primary" disabled title="Esta gestión se debe realizar ante la Dirección.">+ Nuevo estudiante</button></span> : <button type="button" className="em-primary" onClick={newStudent} disabled={!!busy}>+ Nuevo estudiante</button>}
      {searchDone && showSearchResults && <><div className="em-results" aria-label="Resultados de estudiantes">{results.length ? results.map(row => <button key={row.EstudianteId} disabled={!!busy} onClick={() => openStudent(Number(row.EstudianteId))} className={row.EstudianteId === selected?.EstudianteId ? "em-result em-selected" : "em-result"}><span><strong>{fullName(row)}</strong><small>{row.Identificacion} · {row.Seccion || row.GrupoNombre || "Sin sección"}</small></span><span className="em-badge">{asFlag(row.Activo) ? "Activo" : "Inactivo"}</span></button>) : <p className="em-empty">No se encontraron estudiantes. Podés incluir inactivos o crear un nuevo estudiante.</p>}</div><div className="em-pagination"><span>{searchTotal} resultado(s) · Página {searchPage}</span><button disabled={!!busy || searchPage <= 1} onClick={() => void search(searchPage - 1, true)}>Anterior</button><button disabled={!!busy || searchPage * 10 >= searchTotal} onClick={() => void search(searchPage + 1, true)}>Siguiente</button></div></>}
      {searchDone && opened && <button className="em-results-toggle" type="button" aria-expanded={showSearchResults} onClick={() => setShowSearchResults(value => !value)}>{showSearchResults ? "Ocultar resultados" : `Cambiar estudiante · ${searchTotal} resultado(s)`}</button>}
    </section>
    <div ref={feedbackRef} className="em-feedback" aria-live="polite">
      {busy && <div className="em-notice" role="status"><span className="em-spinner" />{busy}</div>}
      {message && <div className="em-notice em-success" role="status">{message}</div>}
      {error && <div className="em-notice em-error" role="alert">{error}{conflictStudentId && <button disabled={!!busy} onClick={() => openStudent(conflictStudentId)}>Abrir estudiante inactivo</button>}{conflictEnrollmentId && <button disabled={!!busy} onClick={() => void refreshHistory()}>Consultar matrícula existente</button>}</div>}
    </div>
    {!opened ? <section className="em-welcome"><span className="em-welcome-mark">{teacherView ? "E" : "E + M"}</span><h2>{teacherView ? "Consulta de estudiante" : "Todo comienza con el estudiante"}</h2><p>{teacherView ? "Seleccioná un expediente para consultar sus datos, matrícula, horario, carnet e historial." : "Seleccioná una ficha o registrá un nuevo ingreso. Aquí podrás actualizar sus datos y matricularlo sin cambiar de pantalla."}</p><div className="em-flow"><span>Datos personales</span><span>Encargados y apoyos</span><span>Matrícula e historial</span></div></section> : <>
        <div className={`em-student-heading ${selected ? "" : "em-new-student"}`}><div className="em-avatar">{form.fotoUrl ? <img src={form.fotoUrl} alt="Foto del estudiante" /> : <span>{[form.nombre, form.primerApellido].map(s => s.charAt(0)).join("") || "+"}</span>}</div><div><div className="em-student-title"><h3>{[form.nombre, form.primerApellido, form.segundoApellido].filter(Boolean).join(" ") || "Nuevo estudiante"}</h3>{selected && <span className={`em-student-status ${inactive ? "em-student-status-inactive" : suspended ? "em-student-status-suspended" : "em-student-status-active"}`}>{inactive ? "Inactivo" : suspended ? "Suspendido" : "Activo"}</span>}</div><p>{form.identificacion || "Identificación pendiente"}{selected?.CodigoCarnet ? ` · Carnet ${selected.CodigoCarnet}` : ""}</p></div><div className="em-actions">{selected && <><a className="em-button" target="_blank" rel="noopener noreferrer" href={`/estudiantes/${selected.EstudianteId}/carnet`}>Carnet / QR ↗</a><button type="button" onClick={() => window.open(`/horario-estudiante/${selected.EstudianteId}`, "HorarioEstudiante", "popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes")}>Horario</button><button disabled={!!busy} onClick={() => void openConduct()}>Boletas de conducta</button></>}</div></div>
        {inactive && <div className="em-notice em-warning">Estado: Inactivo · Causa: {asText(selected?.MotivoInactivacion) || "sin registrar"}{selected?.ObservacionInactivacion ? ` · ${selected.ObservacionInactivacion}` : ""}.{!teacherView && <> Reactivá el mismo expediente antes de guardar datos o matricularlo. <button disabled={!!busy} onClick={() => void editInactivation()}>Editar causa</button><button disabled={!!busy} onClick={() => void changeStudentStatus()}>Reactivar estudiante</button></>}</div>}
        {suspended && <div className="em-notice em-warning">Estado: Suspendido · Causa: {selected?.MotivoSuspension} · {asDate(selected?.FechaInicioSuspension)} al {asDate(selected?.FechaFinSuspension)}. {selected?.ObservacionSuspension}</div>}
        {inactivacionOpen && <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", padding: 18 }}><form onSubmit={event => { event.preventDefault(); void saveStudentInactivation(); }} style={{ width: "min(560px, 100%)", background: "white", borderRadius: 14, padding: 18, display: "grid", gap: 12 }}><h3 style={{ margin: 0 }}>{inactivacionEditing ? "Editar causa de inactivación" : "Inactivar estudiante"}</h3><strong>{selected ? fullName(selected) : ""}</strong><Field label="Causa"><select required value={inactivacion.motivo} onChange={event => setInactivacion(prev => ({ ...prev, motivo: event.target.value }))}><option value="Traslado">Traslado</option><option value="Abandono">Abandono</option></select></Field><Field label="Observaciones"><textarea rows={3} maxLength={1000} value={inactivacion.observacion} onChange={event => setInactivacion(prev => ({ ...prev, observacion: event.target.value }))} /></Field><div className="em-actions"><button type="button" disabled={!!busy} onClick={() => setInactivacionOpen(false)}>Cancelar</button><button className="em-primary" disabled={!!busy}>Guardar</button></div></form></div>}
      <div className="em-workspace">
      <fieldset className="em-student-fields" ref={studentFieldsRef} disabled={!!busy || inactive || teacherView} title={teacherView ? "Para modificar los datos del estudiante, diríjase a la Dirección." : undefined}>
      <section className="em-panel" title={teacherView ? "Para modificar los datos del estudiante, diríjase a la Dirección." : undefined}>
        <div className="em-section-title em-spread"><div className="em-title-group"><span className="em-step">01</span><div><h2>{teacherView ? "Estudiante" : "Datos del estudiante"}</h2><p>Información personal, contactos y apoyos educativos.</p></div></div></div>

          <div className="em-grid em-student-identity">
            <Field label="Tipo de identificación"><CatalogSelect value={form.tipoIdentificacion} rows={catalogs.identificationTypes} idKey="Descripcion" onChange={value => changeStudent("tipoIdentificacion", value)} /></Field>
            {textInput("identificacion", "Identificación *", "text", true)}
            <Field label="Nacionalidad"><CatalogSelect value={form.nacionalidad} rows={catalogs.nationalities} idKey="Descripcion" onChange={value => changeStudent("nacionalidad", value)} /></Field>
            {textInput("nombre", "Nombre *", "text", true)}
            {textInput("primerApellido", "Apellido 1 *", "text", true)}
            {textInput("segundoApellido", "Apellido 2 *", "text", true)}
            {textInput("fechaNacimiento", "Fecha de nacimiento *", "date", true)}
            <Field label="Sexo"><select value={form.sexo} onChange={e => changeStudent("sexo", e.target.value)}><option value="">Seleccione</option>{["Masculino", "Femenino", "Otro"].map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Tipo de estudiante"><CatalogSelect value={form.tipoEstudianteId} rows={catalogs.types} idKey="TipoEstudianteId" currentLabel={selected?.TipoEstudianteDescripcion} onChange={value => changeStudent("tipoEstudianteId", value)} /></Field>
          </div>
          <div className="em-student-contact em-student-rest-row">
            {textInput("telefono", "Teléfono", "tel")}
            <Field label="Ruta de transporte"><CatalogSelect value={form.rutaTransporteId} rows={catalogs.routes} idKey="RutaTransporteId" currentLabel={selected?.RutaTransporteDescripcion || form.rutaTransporteHabitual} legacyLabel={!form.rutaTransporteId ? form.rutaTransporteHabitual : undefined} placeholder="Sin ruta" onChange={id => { const route = catalogs.routes.find(r => asText(r.RutaTransporteId) === id); setForm(prev => ({ ...prev, rutaTransporteId: id, rutaTransporteHabitual: asText(route?.Descripcion) })); }} /></Field>
            <Field label="Correo"><input type="email" value={form.correo} placeholder={form.identificacion ? `${form.identificacion}${catalogs.domain}` : "Se genera al guardar"} onChange={e => changeStudent("correo", e.target.value)} /></Field>
            <Field label="Fotografía"><div className="em-photo-actions"><input type="file" ref={photoRef} accept="image/*" onChange={e => void uploadPhoto(e.target.files?.[0])} />{form.fotoUrl && <button type="button" onClick={() => changeStudent("fotoUrl", "")}>Quitar foto</button>}</div></Field>
            <Check label="Acepta WhatsApp" help="Hereda la autorización del encargado. Solo puede modificarse desde los 18 años. Si se desactiva, no se envían mensajes sobre este estudiante ni a sus encargados." checked={aceptaWhatsAppAlumno(form.aceptaWhatsAppEstudiante, permisoEncargados, contactosRegistrados)} disabled={!esMayor} onChange={value => changeStudent("aceptaWhatsAppEstudiante", value)} />
            <Check label="Repitente" checked={form.repitente} onChange={v => changeStudent("repitente", v)} />
            <Check label="Refugiado" checked={form.refugiado} onChange={v => changeStudent("refugiado", v)} />
            <Check label="Beca de Transporte" checked={form.becaTransporte} onChange={v => changeStudent("becaTransporte", v)} />
          <section className="em-supports"><div className="em-section-title"><h3>Apoyos y salud</h3><div className="em-support-toggles"><Check label="Tiene adecuación" checked={form.tieneAdecuacion} onChange={value => changeStudent("tieneAdecuacion", value)} /><Check label="Tiene discapacidad" checked={asFlag(form.discapacidad)} onChange={value => changeStudent("discapacidad", value ? "Sí" : "No")} /></div></div>
            <div className="em-support-row em-grid">
              {form.tieneAdecuacion && <Field label="Tipo de adecuación *"><select value={form.adecuacion} required onChange={e => changeStudent("adecuacion", e.target.value)}><option value="">Seleccione</option>{form.adecuacion && !catalogs.supports.some(s => s.Descripcion === form.adecuacion) && <option>{form.adecuacion}</option>}{catalogs.supports.filter(s => validAdecuacion(s.Descripcion) && (asFlag(s.Activo) || s.Descripcion === form.adecuacion)).map(s => <option key={s.TipoAdecuacionId} disabled={!asFlag(s.Activo)}>{s.Descripcion}</option>)}</select></Field>}
              {form.tieneAdecuacion && textInput("nivelFuncionamiento", "Nivel de funcionamiento")}
              {form.tieneAdecuacion && <Field label="Observaciones"><textarea rows={1} value={form.observaciones} onChange={e => changeStudent("observaciones", e.target.value)} /></Field>}
            </div>
            <div className="em-support-row em-grid">
              {asFlag(form.discapacidad) && textInput("tipoDiscapacidad", "Tipo de discapacidad")}
              {asFlag(form.discapacidad) && textInput("enfermedad", "Enfermedad")}
              {asFlag(form.discapacidad) && <Field label="Observación médica"><textarea rows={1} value={form.observacionMedica} onChange={e => changeStudent("observacionMedica", e.target.value)} /></Field>}
            </div>
          </section>
          </div>
      </section>
          <section className="em-panel em-contacts"><div className="em-section-title"><span className="em-step">02</span><h2>Encargados y autorizaciones</h2></div>{guardians.map((guardian, index) => <section className={`em-guardian em-guardian-${index + 1}`} key={index}>



            <div className="em-grid em-guardian-data">
              {([ ["nombre", `Nombre · Encargado ${index + 1}`], ["primerApellido", "Primer apellido"], ["segundoApellido", "Segundo apellido"]] as [keyof GuardianForm, string][]).map(([key,label]) => <Field key={key} label={label}><input required={index === 0} value={asText(guardian[key])} onChange={e => changeGuardian(index,key,e.target.value)} /></Field>)}
              <Field label="Tipo de encargado"><CatalogSelect value={guardian.tipoEncargado} rows={catalogs.guardianTypes} idKey="Descripcion" onChange={value => changeGuardian(index,"tipoEncargado",value)} /></Field>
              <Field label="Identificación"><input value={guardian.identificacion} onChange={e => changeGuardian(index,"identificacion",e.target.value)} /></Field>
              <Field label="Teléfono" ><input type="tel" required={index === 0} value={guardian.telefono} onChange={e => changeGuardian(index,"telefono",e.target.value)} /></Field>
              <Field label="Correo electrónico"><input type="email" value={guardian.correo} onChange={e => changeGuardian(index,"correo",e.target.value)} /></Field>
              <Field label="Dirección exacta"><textarea rows={1} value={guardian.direccionExacta} onChange={e => changeGuardian(index,"direccionExacta",e.target.value)} /></Field>
            </div>
                        <div className="em-checks"><Check label="Vive con el estudiante" checked={guardian.viveConEstudiante} onChange={v => changeGuardian(index,"viveConEstudiante",v)} />
              <Check label="Encargado principal" checked={guardian.esPrincipal} disabled={index === 1 && guardians[0]?.esPrincipal} onChange={v => changeGuardian(index,"esPrincipal",v)} />
              <Check label="Acepta WhatsApp" help={guardian.esPrincipal && !phonePayload(guardian.telefono) ? "Ingresá el número de teléfono de WhatsApp del encargado principal para habilitar esta opción." : undefined} checked={guardian.aceptaWhatsApp} disabled={(index === 1 && guardians[0]?.esPrincipal) || !guardian.esPrincipal || !phonePayload(guardian.telefono)} onChange={v => changeGuardian(index,"aceptaWhatsApp",v)} />
              <Check label="Acepta correo" help={!isValidEmail(guardian.correo) ? "Ingresá una dirección de correo válida para habilitar esta opción." : undefined} checked={guardian.aceptaCorreo} disabled={!isValidEmail(guardian.correo)} onChange={v => changeGuardian(index,"aceptaCorreo",v)} />
            </div>
</section>)}</section>
      </fieldset>
      {teacherView && selected && <section className="em-panel em-teacher-consent" aria-label="Autorización de WhatsApp">
        <div className="em-section-title em-spread"><div><h2>Autorización de WhatsApp</h2><p>Podés actualizar únicamente las autorizaciones para WhatsApp.</p></div></div>
        <div className="em-checks">
          <Check label="Encargado principal acepta WhatsApp" checked={!!currentTeacherConsent.encargado} disabled={!!busy || inactive} onChange={changeTeacherGuardianConsent} />
          {esMayor && <Check label="Estudiante mayor de edad acepta WhatsApp" checked={form.aceptaWhatsAppEstudiante === true} disabled={!!busy || inactive} onChange={value => changeStudent("aceptaWhatsAppEstudiante", value)} />}
        </div>
        {teacherConsentDirty && <div className="em-actions"><button type="button" className="em-primary" disabled={!!busy || inactive} onClick={() => void saveTeacherWhatsAppConsent()}>Guardar cambios de WhatsApp</button></div>}
      </section>}
      <section className="em-panel em-enrollment" ref={enrollmentSectionRef} title={teacherView ? "Para modificar la matrícula, diríjase a la Dirección." : undefined}>
        <div className="em-section-title em-spread"><div className="em-title-group"><span className="em-step">03</span><div><h2>Matrícula del año lectivo</h2><p>{teacherView ? "Consulta de matrícula. Para modificar estos datos, diríjase a la Dirección." : "El mismo estudiante, con su información académica por año."}</p></div></div><span className="em-badge">{edited?.Estado || "Por registrar"}</span></div>
        {selected && !historyReady && <div className="em-notice em-warning">Consultá el historial para verificar si ya existe una matrícula. <button disabled={!!busy} onClick={() => void refreshHistory()}>Consultar matrícula</button></div>}
        {partialSave && <div className="em-notice em-warning">Los datos personales están guardados. Revisá la matrícula y reintentá sin crear otro estudiante.</div>}
        <fieldset disabled={teacherView || !!busy || inactive || catalogLoading || !!catalogError || !historyReady} ref={enrollmentFieldsRef} title={teacherView ? "Para modificar la matrícula, diríjase a la Dirección." : undefined}>

          {inactiveEnrollment && <div className="em-notice em-warning">Esta matrícula está inactiva. Podés reactivarla desde el historial si no existe otra activa en el año.</div>}
          {!yearActive && enrollment.anioLectivoId && <div className="em-notice em-warning">El año seleccionado está inactivo. Su matrícula se conserva para consulta.</div>}
          {!groupOptions.some(g => asFlag(g.Activo)) && <div className="em-notice em-warning">No hay grupos activos para este año. Configuralos en Administrativo; podés guardar los datos del estudiante mientras tanto.</div>}
          <fieldset disabled={inactiveEnrollment || !yearActive}>
            <div className="em-grid em-enrollment-row">
              <Field label="Año lectivo *"><CatalogSelect value={enrollment.anioLectivoId} rows={catalogs.years} idKey="AnioLectivoId" textKey="Nombre" currentLabel={edited?.AnioNombre} required onChange={changeYear} /></Field>
              <Field label="Tipo de matrícula"><input list="em-enrollment-types" value={enrollment.tipoMatricula} onChange={e => changeEnrollment("tipoMatricula", e.target.value)} placeholder="Regular CTP, Plan Nacional u otro" /><datalist id="em-enrollment-types"><option value={`Regular CTP ${catalogs.years.find(y => asText(y.AnioLectivoId) === enrollment.anioLectivoId)?.Nombre || ""}`} /><option value={`Plan Nacional ${catalogs.years.find(y => asText(y.AnioLectivoId) === enrollment.anioLectivoId)?.Nombre || ""}`} /></datalist></Field>
              {enrollmentInput("fechaMatricula", "Fecha de matrícula", "date")}<Field label="Nivel académico *"><select value={enrollment.grupoId ? groupLevel(groupOptions.find(g => asText(g.GrupoId) === enrollment.grupoId)) : ""} onChange={e => { const candidate=groupOptions.find(g => groupLevel(g)===e.target.value && asText(g.AnioLectivoId)===enrollment.anioLectivoId); setEnrollment(prev=>({...prev,grupoId:candidate?asText(candidate.GrupoId):"",nivelAcademico:e.target.value,seccionTexto:""})); }}><option value="">Seleccione</option>{[7,8,9,10,11,12].map(n=><option key={n} value={n}>{levelName(String(n))}</option>)}</select></Field><Field label="Grupo / sección *"><CatalogSelect value={enrollment.grupoId} rows={sortedGroups(groupOptions.filter(g=>groupLevel(g)===groupLevel(groupOptions.find(x=>asText(x.GrupoId)===enrollment.grupoId)) || !enrollment.grupoId))} idKey="GrupoId" textKey="Nombre" currentLabel={edited?.GrupoNombre} required onChange={changeGroup} /></Field>
              <Field label="Especialidad (opcional)"><CatalogSelect value={enrollment.especialidadId} rows={catalogs.specialties} idKey="EspecialidadId" placeholder="Sin especialidad del catálogo" currentLabel={enrollment.especialidad} onChange={id => setEnrollment(prev => ({ ...prev, especialidadId: id, especialidad: asText(catalogs.specialties.find(s => asText(s.EspecialidadId) === id)?.Descripcion) }))} /></Field>

              <Field label="Observaciones"><textarea rows={1} value={enrollment.observacion} onChange={e => changeEnrollment("observacion", e.target.value)} /></Field>
            </div>
          </fieldset>
        </fieldset>
        {isTransfer && <div className="em-notice em-warning"><strong>Traslado de sección: {edited?.GrupoNombre} → {groupOptions.find(g => asText(g.GrupoId) === enrollment.grupoId)?.Nombre || enrollment.seccionTexto}</strong><span>Se utilizará el proceso existente de traslado de notas, seguimiento y asistencia. Se pedirá confirmación antes de guardar.</span></div>}

      </section>
      </div>
      {teacherView ? <div className="em-savebar"><div className="em-panel-footer"><div className="em-actions"><button type="button" className="em-primary" disabled={!teacherConsentDirty || !!busy || inactive} onClick={() => void saveTeacherWhatsAppConsent()}>Guardar autorización WhatsApp</button><button type="button" className="em-button" disabled={!teacherAuthorizationMatriculaId || !teacherConsentAccepted || !!busy} onClick={() => void printTeacherWhatsAppAuthorization()} title={!teacherAuthorizationMatriculaId ? "El estudiante debe tener una matrícula registrada." : !teacherConsentAccepted ? "Marcá una autorización de WhatsApp para habilitar la impresión." : teacherConsentDirty ? "Al imprimir se guardarán primero los cambios de WhatsApp. Se mostrará únicamente esta autorización." : "Imprimir únicamente la autorización de WhatsApp."}>Imprimir autorización de WhatsApp</button></div></div></div> : <div className="em-savebar"><div className="em-panel-footer"><div className="em-actions"><button title={enrollmentDirty ? "Se guardarán los datos del estudiante y los cambios de matrícula." : "Se guardarán los datos del estudiante. Para matricular o actualizar la matrícula, modificá sus datos académicos."} className="em-primary" disabled={!!busy || inactive} onClick={() => void save(enrollmentDirty)}>{partialSave ? "Reintentar matrícula" : isTransfer ? "Guardar y trasladar" : enrollmentDirty ? "Guardar estudiante y matrícula" : "Guardar datos del estudiante"}</button>{editingId && <><a className="em-button" href={`/boletas/matricula/${editingId}`} target="_blank" rel="noopener noreferrer">Imprimir Boletas</a><span className={`em-button-tooltip ${!puedeEnviarBoletaCorreo || !!busy ? "is-disabled" : ""}`} title={motivoEnvioBoletaCorreo}><button type="button" className="em-button" disabled={!puedeEnviarBoletaCorreo || !!busy} title={motivoEnvioBoletaCorreo} onClick={() => void sendBoletaMatriculaEmail()}>{busy.includes("Enviando boleta") ? "Enviando…" : "Enviar por correo Boletas"}</button></span></>}</div></div></div>}
      <div className="em-secondary-tools">
      <details className="em-history"><summary>Historial completo de matrícula</summary><div className="em-section-title em-spread"><div><h2>Historial de matrícula</h2><p>Consultá cada año sin duplicar el expediente.</p></div><div className="em-actions"><Check label="Mostrar inactivas" checked={showInactiveHistory} onChange={setShowInactiveHistory} /><button disabled={!!busy || !selected} onClick={() => void refreshHistory()}>Actualizar historial</button></div></div>
        <div className="em-table-wrap"><table><thead><tr><th>Año</th><th>Grupo / sección</th><th>Tipo y especialidad</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{history.filter(row => showInactiveHistory || isActiveEnrollment(row)).map(row => <tr key={row.MatriculaId}><td>{row.AnioNombre}</td><td>{row.GrupoNombre}</td><td>{row.TipoMatricula || "—"}<small>{row.EspecialidadDescripcion || row.Especialidad}</small></td><td>{asDate(row.FechaMatricula) || "—"}</td><td><span className="em-badge">{row.Estado}</span></td><td><div className="em-actions">{teacherView ? <button disabled={!!busy} onClick={() => { editEnrollment(row); document.querySelector(".em-enrollment")?.scrollIntoView({behavior:"smooth"}); }}>Ver registro</button> : <><button disabled={!!busy} onClick={() => { if (editEnrollment(row)) document.querySelector(".em-enrollment")?.scrollIntoView({behavior:"smooth"}); }}>{isActiveEnrollment(row) ? "Editar / trasladar" : "Ver registro"}</button><a href={`/boletas/matricula/${row.MatriculaId}`} target="_blank" rel="noopener noreferrer">Boleta ↗</a><button disabled={!!busy || inactive} onClick={() => void changeEnrollmentStatus(row)}>{isActiveEnrollment(row) ? "Inactivar" : "Reactivar"}</button></>}</div></td></tr>)}</tbody></table>{!history.filter(row => showInactiveHistory || isActiveEnrollment(row)).length && <p className="em-empty">{historyReady ? "No hay matrículas para mostrar con este filtro." : "Historial pendiente de consulta."}</p>}</div>
      </details>
      {selected && <section className="em-panel"><div className="em-section-title em-spread"><div><h2>{teacherView ? "Historial de estados" : "Administración del expediente"}</h2><p>{teacherView ? "Consulta de suspensiones e inactivaciones del estudiante." : "Estado del estudiante y seguimiento institucional."}</p></div>{!teacherView && <div className="em-actions"><button disabled={!!busy || inactive} onClick={openSuspension}>{suspended ? "Modificar suspensión" : "Suspender estudiante"}</button><button className="em-danger" disabled={!!busy} onClick={() => void changeStudentStatus()}>{inactive ? "Reactivar estudiante" : "Inactivar estudiante"}</button></div>}</div>
        {!teacherView && suspensionOpen && <form onSubmit={e => { e.preventDefault(); void saveSuspension(); }}><fieldset disabled={!!busy}><div className="em-grid"><Field label="Motivo"><select value={suspension.motivo} onChange={e => setSuspension(prev => ({ ...prev, motivo: e.target.value }))}><option>Acción Correctiva</option><option>Medida Precautoria</option><option>Situación Médica</option></select></Field><Field label="Fecha de inicio"><input type="date" required value={suspension.fechaInicio} onChange={e => setSuspension(prev => ({ ...prev, fechaInicio: e.target.value }))} /></Field><Field label="Fecha de fin"><input type="date" required value={suspension.fechaFin} onChange={e => setSuspension(prev => ({ ...prev, fechaFin: e.target.value }))} /></Field><Field label="Observación" wide><textarea value={suspension.observacion} onChange={e => setSuspension(prev => ({ ...prev, observacion: e.target.value }))} /></Field></div><div className="em-actions"><button className="em-primary">Guardar suspensión</button>{suspended && selected.SuspensionId && <button type="button" onClick={() => void saveSuspension(true)}>Retirar suspensión</button>}<button type="button" onClick={() => setSuspensionOpen(false)}>Cancelar</button></div></fieldset></form>}
        <div className="em-actions"><button type="button" disabled={statusHistoryLoading} onClick={() => void toggleStatusHistory()}>{statusHistoryLoading ? "Cargando historial…" : statusHistoryOpen ? "Ocultar historial de estados" : "Historial de suspensiones e inactivaciones"}</button></div>
        {statusHistoryOpen && <div className="em-table-wrap">
          <h3>Suspensiones</h3>
          <table><thead><tr><th>Motivo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Observación</th><th>Registró</th><th>Levantamiento</th></tr></thead><tbody>{statusHistory.suspensiones.map(row => <tr key={row.EstudianteSuspensionId}><td>{row.Motivo}</td><td>{asDate(row.FechaInicio)}</td><td>{asDate(row.FechaFin)}</td><td>{asFlag(row.Activo) && asDate(row.FechaFin) >= getCostaRicaIsoDate() ? "Vigente" : row.FechaLevantamiento ? "Levantada" : "Finalizada"}</td><td>{row.Observacion || "—"}</td><td>{row.UsuarioCrea || "—"}</td><td>{row.FechaLevantamiento ? `${asDate(row.FechaLevantamiento)}${row.UsuarioLevanta ? ` · ${row.UsuarioLevanta}` : ""}` : "—"}</td></tr>)}</tbody></table>{!statusHistory.suspensiones.length && <p className="em-empty">No hay suspensiones registradas.</p>}
          <h3>Inactivaciones</h3>
          <table><thead><tr><th>Causa</th><th>Fecha</th><th>Estado</th><th>Observación</th><th>Registró</th><th>Reactivación</th></tr></thead><tbody>{statusHistory.inactivaciones.map(row => <tr key={row.EstudianteInactivacionId}><td>{row.Motivo}</td><td>{asDate(row.FechaInactivacion)}</td><td>{asFlag(row.Activo) ? "Vigente" : "Revertida"}</td><td>{row.Observacion || "—"}</td><td>{row.UsuarioInactiva || "—"}</td><td>{row.FechaReactivacion ? `${asDate(row.FechaReactivacion)}${row.UsuarioReactiva ? ` · ${row.UsuarioReactiva}` : ""}` : "—"}</td></tr>)}</tbody></table>{!statusHistory.inactivaciones.length && <p className="em-empty">No hay inactivaciones registradas.</p>}
        </div>}
      </section>}
      {conductOpen && <section className="em-panel"><div className="em-section-title em-spread"><h2>Boletas de conducta</h2><div className="em-actions"><button disabled={!!busy || inactive} onClick={() => void prepareConduct()}>Generar boleta</button><button disabled={!!busy} onClick={() => setConductOpen(false)}>Cerrar</button></div></div>
        {conductContext && <form onSubmit={createConduct}><fieldset disabled={!!busy}><div className="em-notice">{conductContext.estudianteNombre} · Sección {conductContext.seccion} · {conductContext.funcionarioNombre} · {asDate(conductContext.fecha)}</div><div className="em-grid em-two"><Field label="Detalle de los hechos"><select required value={conduct.faltaConductaId} onChange={e => setConduct(prev => ({ ...prev, faltaConductaId: e.target.value, detalleNormativa: "" }))}><option value="">Seleccione una falta</option>{conductFaltas.map(item => <option key={item.FaltaConductaId} value={item.FaltaConductaId} title={`Artículo: ${item.Articulo} · Tipo de falta: ${item.TipoFalta}`}>{item.Falta}</option>)}<option value="normativa-interna" title="Detalle escrito por el docente según la normativa interna">Según la normativa interna</option></select></Field><Field label="Lugar del acontecimiento"><input required value={conduct.lugarAcontecimiento} onChange={e => setConduct(prev => ({ ...prev, lugarAcontecimiento: e.target.value }))} /></Field>{conduct.faltaConductaId === "normativa-interna" ? <Field label="Detalle según la normativa interna" wide><textarea required rows={3} value={conduct.detalleNormativa} onChange={e => setConduct(prev => ({ ...prev, detalleNormativa: e.target.value }))} /></Field> : null}{conductFaltas.find(item => String(item.FaltaConductaId) === conduct.faltaConductaId) ? <div className="em-notice" role="status">Artículo: {conductFaltas.find(item => String(item.FaltaConductaId) === conduct.faltaConductaId)?.Articulo} · Tipo de falta: {conductFaltas.find(item => String(item.FaltaConductaId) === conduct.faltaConductaId)?.TipoFalta}</div> : null}</div><div className="em-actions"><button className="em-primary" disabled={!conduct.faltaConductaId || (conduct.faltaConductaId === "normativa-interna" && !conduct.detalleNormativa.trim())}>Guardar boleta</button><button type="button" onClick={() => setConductContext(null)}>Cancelar</button></div></fieldset></form>}
        <div className="em-table-wrap"><table><thead><tr><th>Número</th><th>Fecha</th><th>Detalle</th><th>Correo / WhatsApp</th><th>Documento</th></tr></thead><tbody>{conductRows.map(row => <tr key={row.boletaConductaId}><td>{row.numeroBoleta || "—"}</td><td>{row.fecha || "—"}</td><td>{row.detalleHechos || "—"}<small>{row.lugarAcontecimiento || ""}</small></td><td>{row.envioCorreo ? "Enviado" : "Pendiente"} / {row.envioWhatsApp ? "Enviado" : "Pendiente"}</td><td><a href={`/boletas/conducta/${row.boletaConductaId}`} target="_blank" rel="noopener noreferrer">Ver boleta ↗</a></td></tr>)}</tbody></table>{!conductRows.length && <p className="em-empty">Sin boletas de conducta registradas.</p>}</div>
      </section>}
      </div>
    </>}
  </div>;
}
