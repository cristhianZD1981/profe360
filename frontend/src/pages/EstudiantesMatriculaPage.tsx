import { aceptaWhatsAppAlumno, esMayorParaWhatsApp, permisoEncargadosEnFicha } from "../utils/consentimientoWhatsApp";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";
import { getCostaRicaIsoDate } from "../utils/date";
import {
  groupLevel, levelName, sortedGroups, automaticEnrollment, transportDescription, asDate, asFlag, asText, enrollmentError, enrollmentForm, enrollmentPayload, fullName,
  guardianForm, guardiansForm, isActiveEnrollment, previousEnrollment, progressionError,
  saveCombined, studentError, studentForm, studentHistory, studentPayload, validAdecuacion,
  type EnrollmentForm, type GuardianForm, type RecordData, type StudentForm
} from "../features/estudiantes-matricula/model";
import "./EstudiantesMatriculaPage.css";

type Catalogs = { years: RecordData[]; groups: RecordData[]; specialties: RecordData[]; types: RecordData[]; supports: RecordData[]; routes: RecordData[]; domain: string };
const emptyCatalogs: Catalogs = { years: [], groups: [], specialties: [], types: [], supports: [], routes: [], domain: "" };
const errorText = (error: any) => error?.response?.data?.message || error?.message || "No se pudo completar la operación. Intentá nuevamente.";
const fingerprint = (form: StudentForm, guardians: GuardianForm[]) => JSON.stringify(studentPayload(form, guardians));

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "em-field em-wide" : "em-field"}><span>{label}</span>{children}</label>;
}
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange?: (value: boolean) => void; disabled?: boolean }) {
  return <label className="em-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange?.(e.target.checked)} />{label}</label>;
}
function DetailWindow({ title, children, disabled = false }: { title: string; children: ReactNode; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button type="button" disabled={disabled} onClick={() => dialog.current?.showModal()}>{title} ↗</button>
    <dialog className="em-dialog" ref={dialog} aria-label={title}>
      <div className="em-dialog-heading"><h2>{title}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={`Cerrar ${title}`}>Cerrar ×</button></div>
      {children}
      <div className="em-dialog-footer"><small>Los cambios se conservan en la ficha. Usá Guardar para registrarlos.</small><button type="button" onClick={() => dialog.current?.close()}>Volver a la ficha</button></div>
    </dialog></>;
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

export default function EstudiantesMatriculaPage() {
  const { user } = useAuth();
  return <StudentEnrollmentWorkspace key={user?.institucionId ?? "none"} />;
}

function StudentEnrollmentWorkspace() {
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
  const [conductOpen, setConductOpen] = useState(false);
  const [conductRows, setConductRows] = useState<RecordData[]>([]);
  const [conductContext, setConductContext] = useState<RecordData | null>(null);
  const [conduct, setConduct] = useState({ detalleHechos: "", lugarAcontecimiento: "" });
  const studentFieldsRef = useRef<HTMLFieldSetElement>(null);
  const enrollmentFieldsRef = useRef<HTMLFieldSetElement>(null);
  const enrollmentSectionRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const esMayor = esMayorParaWhatsApp(form.fechaNacimiento, getCostaRicaIsoDate());
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
  const progressWarning = progressionError(derivedEnrollment, history);

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
    setCatalogLoading(true); setCatalogError("");
    try {
      const responses = await Promise.all([
        api.get("/academico/anios-lectivos", { params: { incluirInactivos: true } }),
        api.get("/academico/grupos", { params: { incluirInactivos: true } }),
        api.get("/academico/especialidades", { params: { incluirInactivas: true } }),
        api.get("/academico/tipos-estudiante", { params: { incluirInactivos: true } }),
        api.get("/academico/tipos-adecuacion", { params: { incluirInactivos: true } }),
        api.get("/academico/rutas-transporte", { params: { incluirInactivas: true } }),
        api.get("/academico/configuracion-correo-estudiante")
      ]);
      if (!mounted.current) return;
      const [years, groups, specialties, types, supports, routes, config] = responses.map(r => r.data?.data);
      setCatalogs({ years: years || [], groups: groups || [], specialties: specialties || [], types: types || [], supports: supports || [], routes: routes || [], domain: asText(config?.dominio || "@est.mep.go.cr") });
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
    const active = rows.find(row => asText(row.AnioLectivoId) === year && isActiveEnrollment(row));
    const draft = enrollmentForm(active, year, getCostaRicaIsoDate());
    if (!active) {
      draft.rutaTransporte = student.rutaTransporteHabitual;
      draft.esRepitente = student.repitente;
      draft.correoEnvioBoleta = (contacts.find(g => g.esPrincipal) || contacts[0])?.correo || "";
    }
    setEnrollment(draft); setSavedEnrollment(JSON.stringify(draft)); setEditingId(active ? Number(active.MatriculaId) : null);
    setConflictEnrollmentId(null); setPartialSave(false);
  }
  async function fetchHistory(student: RecordData) {
    const response = await api.get("/academico/matriculas", { params: { q: student.Identificacion, incluirInactivas: true } });
    return studentHistory(response.data?.data || [], Number(student.EstudianteId));
  }
  async function loadStudent(id: number) {
    const response = await api.get(`/estudiantes/${id}/detalle`);
    const record = response.data?.data?.estudiante;
    if (!record?.EstudianteId) throw new Error("No se pudo cargar la ficha del estudiante.");
    const personal = studentForm(record, catalogs.routes);
    const contacts = guardiansForm(response.data?.data?.encargados || []);
    setSelected(record); setForm(personal); setGuardians(contacts); setSavedStudent(fingerprint(personal, contacts));
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
    setGuardians(prev => prev.map((g, i) => i === index ? { ...g, [key]: value } : key === "esPrincipal" && value === true ? { ...g, esPrincipal: false } : g));
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

  async function changeStudentStatus() {
    if (!selected || !discardChanges() || !window.confirm(inactive ? "¿Reactivar este estudiante?" : "¿Inactivar este estudiante? El registro se conserva y puede reactivarse.")) return;
    await run(inactive ? "Reactivando estudiante…" : "Inactivando estudiante…", async () => {
      if (inactive) await api.patch(`/estudiantes/${selected.EstudianteId}/reactivar`); else await api.delete(`/estudiantes/${selected.EstudianteId}`);
      await loadStudent(Number(selected.EstudianteId)); setMessage(inactive ? "Estudiante reactivado." : "Estudiante inactivado.");
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
  async function openConduct() {
    if (!selected) return;
    await run("Consultando boletas de conducta…", async () => {
      const response = await api.get(`/estudiantes/${selected.EstudianteId}/boletas-conducta`);
      setConductRows(response.data?.data || []); setConductOpen(true); setConductContext(null);
    });
  }
  async function prepareConduct() {
    if (!selected) return;
    await run("Preparando boleta…", async () => {
      const response = await api.get(`/boletas/conducta/contexto/${selected.EstudianteId}`);
      setConductContext(response.data?.data || {}); setConduct({ detalleHechos: "", lugarAcontecimiento: "" });
    });
  }
  async function createConduct(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    await run("Generando boleta…", async () => {
      const response = await api.post("/boletas/conducta", { estudianteId: selected.EstudianteId, ...conduct });
      const id = Number(response.data?.data?.boletaConductaId);
      if (!id) throw new Error("No se recibió la boleta generada.");
      setConductContext(null);
      setMessage(`Boleta de conducta generada correctamente.`);
      setConductRows(prev => [{ BoletaConductaId: id, NumeroBoleta: response.data?.data?.codigoBoleta || id, Fecha: getCostaRicaIsoDate(), DetalleHechos: conduct.detalleHechos, LugarAcontecimiento: conduct.lugarAcontecimiento }, ...prev]);
    });
  }

  const textInput = (key: keyof StudentForm, label: string, type = "text", required = false) => <Field label={label}><input type={type} required={required} value={asText(form[key])} onChange={e => changeStudent(key, e.target.value)} /></Field>;
  const enrollmentInput = (key: keyof EnrollmentForm, label: string, type = "text") => <Field label={label}><input type={type} value={asText(enrollment[key])} onChange={e => changeEnrollment(key, e.target.value)} /></Field>;

  return <div className="em-page">
    <nav className="em-shortcuts" aria-label="Herramientas existentes"><Link to="/estudiantes" target="_blank" rel="noopener noreferrer">Estudiantes · listados e importación ↗</Link><Link to="/matricula" target="_blank" rel="noopener noreferrer">Matrícula · listados e importación ↗</Link><Link to="/administrativo" target="_blank" rel="noopener noreferrer">Catálogos institucionales ↗</Link><button onClick={() => void loadCatalogs()} disabled={catalogLoading || !!busy}>Actualizar catálogos</button></nav>
    {catalogError && <div className="em-notice em-error" role="alert">No se pudieron cargar los catálogos: {catalogError} <button onClick={() => void loadCatalogs()} disabled={catalogLoading}>Reintentar</button></div>}
    <section className="em-panel em-search"><div className="em-section-title"><span className="em-step">01</span><div><h2>Buscar o registrar estudiante</h2><p>Consultá primero para recuperar el expediente existente.</p></div></div>
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="em-search-form"><Field label="Identificación, nombre o sección"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Escribí para buscar…" /></Field><Check label="Incluir inactivos" checked={includeInactive} onChange={setIncludeInactive} /><button className="em-primary" disabled={!!busy}>Buscar estudiante</button></form>
      <button type="button" className="em-primary" onClick={newStudent} disabled={!!busy}>+ Nuevo estudiante</button>
      {searchDone && showSearchResults && <><div className="em-results" aria-label="Resultados de estudiantes">{results.length ? results.map(row => <button key={row.EstudianteId} disabled={!!busy} onClick={() => openStudent(Number(row.EstudianteId))} className={row.EstudianteId === selected?.EstudianteId ? "em-result em-selected" : "em-result"}><span><strong>{fullName(row)}</strong><small>{row.Identificacion} · {row.Seccion || row.GrupoNombre || "Sin sección"}</small></span><span className="em-badge">{asFlag(row.Activo) ? "Activo" : "Inactivo"}</span></button>) : <p className="em-empty">No se encontraron estudiantes. Podés incluir inactivos o crear un nuevo estudiante.</p>}</div><div className="em-pagination"><span>{searchTotal} resultado(s) · Página {searchPage}</span><button disabled={!!busy || searchPage <= 1} onClick={() => void search(searchPage - 1, true)}>Anterior</button><button disabled={!!busy || searchPage * 10 >= searchTotal} onClick={() => void search(searchPage + 1, true)}>Siguiente</button></div></>}
      {searchDone && opened && <button className="em-results-toggle" type="button" aria-expanded={showSearchResults} onClick={() => setShowSearchResults(value => !value)}>{showSearchResults ? "Ocultar resultados" : `Cambiar estudiante · ${searchTotal} resultado(s)`}</button>}
    </section>
    <div ref={feedbackRef} className="em-feedback" aria-live="polite">
      {busy && <div className="em-notice" role="status"><span className="em-spinner" />{busy}</div>}
      {message && <div className="em-notice em-success" role="status">{message}</div>}
      {error && <div className="em-notice em-error" role="alert">{error}{conflictStudentId && <button disabled={!!busy} onClick={() => openStudent(conflictStudentId)}>Abrir estudiante inactivo</button>}{conflictEnrollmentId && <button disabled={!!busy} onClick={() => void refreshHistory()}>Consultar matrícula existente</button>}</div>}
    </div>
    {!opened ? <section className="em-welcome"><span className="em-welcome-mark">E + M</span><h2>Todo comienza con el estudiante</h2><p>Seleccioná una ficha o registrá un nuevo ingreso. Aquí podrás actualizar sus datos y matricularlo sin cambiar de pantalla.</p><div className="em-flow"><span>Datos personales</span><span>Encargados y apoyos</span><span>Matrícula e historial</span></div></section> : <>
        <div className="em-student-heading"><div className="em-avatar">{form.fotoUrl ? <img src={form.fotoUrl} alt="Foto del estudiante" /> : <span>{[form.nombre, form.primerApellido].map(s => s.charAt(0)).join("") || "+"}</span>}</div><div><h3>{[form.nombre, form.primerApellido, form.segundoApellido].filter(Boolean).join(" ") || "Nuevo estudiante"}</h3><p>{form.identificacion || "Identificación pendiente"}{selected?.CodigoCarnet ? ` · Carnet ${selected.CodigoCarnet}` : ""}</p></div><div className="em-actions">{selected && <><a className="em-button" target="_blank" rel="noopener noreferrer" href={`/estudiantes/${selected.EstudianteId}/carnet`}>Carnet / QR ↗</a><button disabled={!!busy} onClick={() => void openConduct()}>Boletas de conducta</button></>}</div></div>
        {inactive && <div className="em-notice em-warning">Este estudiante está inactivo. Reactivá el mismo expediente antes de guardar datos o matricularlo. <button disabled={!!busy} onClick={() => void changeStudentStatus()}>Reactivar estudiante</button></div>}
        {suspended && <div className="em-notice em-warning">Suspensión: {selected?.MotivoSuspension} · {asDate(selected?.FechaInicioSuspension)} al {asDate(selected?.FechaFinSuspension)}. {selected?.ObservacionSuspension}</div>}
      <div className="em-workspace">
      <fieldset className="em-student-fields" ref={studentFieldsRef} disabled={!!busy || inactive}>
      <section className="em-panel">
        <div className="em-section-title em-spread"><div className="em-title-group"><span className="em-step">01</span><div><h2>Datos del estudiante</h2><p>Información personal, contactos y apoyos educativos.</p></div></div><span className={`em-badge ${inactive || suspended ? "em-badge-warning" : ""}`}>{!selected ? "Nuevo expediente" : inactive ? "Inactivo" : suspended ? "Activo · suspendido" : "Activo"}</span></div>

          <div className="em-grid">
            {textInput("tipoIdentificacion", "Tipo de identificación")}{textInput("identificacion", "Identificación *", "text", true)}{textInput("nacionalidad", "Nacionalidad")}
            {textInput("nombre", "Nombre *", "text", true)}{textInput("primerApellido", "Primer apellido *", "text", true)}{textInput("segundoApellido", "Segundo apellido *", "text", true)}
            {textInput("fechaNacimiento", "Fecha de nacimiento *", "date", true)}<Field label="Sexo"><select value={form.sexo} onChange={e => changeStudent("sexo", e.target.value)}><option value="">Seleccione</option>{["Masculino", "Femenino", "Otro"].map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Tipo de estudiante"><CatalogSelect value={form.tipoEstudianteId} rows={catalogs.types} idKey="TipoEstudianteId" currentLabel={selected?.TipoEstudianteDescripcion} onChange={value => changeStudent("tipoEstudianteId", value)} /></Field>
          </div>
          <details open className="em-details"><summary>Contacto, fotografía y transporte<span>Correo, teléfono y ruta habitual</span></summary><div className="em-grid">
            <Field label="Usuario y correo institucional"><input type="email" value={form.correo} placeholder={form.identificacion ? `${form.identificacion}${catalogs.domain}` : "Automático al guardar"} onChange={e => changeStudent("correo", e.target.value)} /><small>Si lo dejás vacío se genera con la identificación y el dominio institucional.</small></Field>
            {textInput("telefono", "Teléfono", "tel")}<Field label="Ruta de transporte"><CatalogSelect value={form.rutaTransporteId} rows={catalogs.routes} idKey="RutaTransporteId" currentLabel={selected?.RutaTransporteDescripcion || form.rutaTransporteHabitual} legacyLabel={!form.rutaTransporteId ? form.rutaTransporteHabitual : undefined} placeholder="Sin ruta de transporte" onChange={id => { const route = catalogs.routes.find(r => asText(r.RutaTransporteId) === id); setForm(prev => ({ ...prev, rutaTransporteId: id, rutaTransporteHabitual: asText(route?.Descripcion) })); }} /></Field>
            <div><DetailWindow title="Fotografía" disabled={!!busy || inactive}><Field label="Foto del estudiante"><input type="file" ref={photoRef} accept="image/*" onChange={e => void uploadPhoto(e.target.files?.[0])} />{form.fotoUrl && <button type="button" onClick={() => changeStudent("fotoUrl", "")}>Quitar foto</button>}</Field></DetailWindow></div>
            <div className="em-wide"><Check label="Padre, madre o encargado autoriza recibir información por WhatsApp"
              checked={permisoEncargados} disabled={esMayor}
              onChange={value => changeStudent("autorizaWhatsAppEncargado", value)} />
              {esMayor && <small>Solo informativo: se activa si al menos un encargado acepta WhatsApp. Modificá esta autorización en «Encargados y autorizaciones».</small>}
            </div>
            <div className="em-wide"><Check label="El estudiante acepta WhatsApp"
              checked={aceptaWhatsAppAlumno(form.aceptaWhatsAppEstudiante, permisoEncargados, contactosRegistrados)}
              disabled={!esMayor}
              onChange={value => changeStudent("aceptaWhatsAppEstudiante", value)} />
              <small>Hereda la autorización del encargado. Solo puede modificarse desde los 18 años. Al desactivarlo, no se envían WhatsApp sobre este alumno a él ni a sus encargados.</small>
            </div>
          </div></details>
          <div className="em-health-summary"><strong>Apoyos educativos y salud</strong><p>{form.tieneAdecuacion ? form.adecuacion : "Sin adecuación"} · Discapacidad: {form.discapacidad || "Sin indicar"} · Enfermedad: {form.enfermedad || "Sin registrar"}</p><p>{form.repitente ? "Repitente · " : ""}{form.refugiado ? "Refugiado · " : ""}{form.observaciones || form.observacionMedica ? "Con observaciones registradas" : "Sin observaciones"}</p>
          <DetailWindow title="Apoyos educativos y salud" disabled={!!busy || inactive}><div className="em-grid">
            <Check label="Tiene adecuación" checked={form.tieneAdecuacion} onChange={value => changeStudent("tieneAdecuacion", value)} />
            {form.tieneAdecuacion && <Field label="Tipo de adecuación *"><select value={form.adecuacion} required onChange={e => changeStudent("adecuacion", e.target.value)}><option value="">Seleccione</option>{form.adecuacion && !catalogs.supports.some(s => s.Descripcion === form.adecuacion) && <option>{form.adecuacion}</option>}{catalogs.supports.filter(s => validAdecuacion(s.Descripcion) && (asFlag(s.Activo) || s.Descripcion === form.adecuacion)).map(s => <option key={s.TipoAdecuacionId} disabled={!asFlag(s.Activo)}>{s.Descripcion}</option>)}</select></Field>}
            {textInput("nivelFuncionamiento", "Nivel de funcionamiento")}<Field label="Observaciones de seguimiento" wide><textarea rows={2} value={form.observaciones} onChange={e => changeStudent("observaciones", e.target.value)} /></Field>
            <Field label="Discapacidad"><select value={form.discapacidad} onChange={e => changeStudent("discapacidad", e.target.value)}><option value="">Seleccione</option><option>Sí</option><option>No</option>{form.discapacidad && !["Sí", "No"].includes(form.discapacidad) && <option>{form.discapacidad}</option>}</select></Field>
            {asFlag(form.discapacidad) && textInput("tipoDiscapacidad", "Tipo de discapacidad")}{textInput("enfermedad", "Enfermedad")}
            <Field label="Observación médica" wide><textarea rows={2} value={form.observacionMedica} onChange={e => changeStudent("observacionMedica", e.target.value)} /></Field>
            <Check label="Repitente en la ficha del estudiante" checked={form.repitente} onChange={v => changeStudent("repitente", v)} /><Check label="Refugiado" checked={form.refugiado} onChange={v => changeStudent("refugiado", v)} />
          </div></DetailWindow>
          </div>
      </section>
          <section className="em-panel em-contacts"><div className="em-section-title"><span className="em-step">02</span><h2>Encargados y autorizaciones</h2></div>{guardians.map((guardian, index) => <section className="em-guardian" key={index}><h3>Encargado {index + 1}{guardian.esPrincipal ? " · Principal" : ""}</h3><div className="em-grid">

            <div className="em-wide em-contact-name">{[guardian.nombre, guardian.primerApellido, guardian.segundoApellido].filter(Boolean).join(" ") || "Datos del encargado pendientes"}</div>
            {([["correo", "Correo"], ["telefono", "Teléfono"]] as [keyof GuardianForm, string][]).map(([key, label]) => <Field key={key} label={label}><input type={key === "correo" ? "email" : "tel"} value={asText(guardian[key])} onChange={e => changeGuardian(index, key, e.target.value)} /></Field>)}
            <div className="em-wide"><DetailWindow title={`Ficha del encargado ${index + 1}`} disabled={!!busy || inactive}><div className="em-grid em-two">
            {([["nombre", "Nombre"], ["primerApellido", "Primer apellido"], ["segundoApellido", "Segundo apellido"]] as [keyof GuardianForm, string][]).map(([key, label]) => <Field key={key} label={label}><input type={key === "correo" ? "email" : key.startsWith("telefono") ? "tel" : "text"} value={asText(guardian[key])} onChange={e => changeGuardian(index, key, e.target.value)} /></Field>)}

            <Field label="Tipo de encargado"><select value={guardian.tipoEncargado} onChange={e => changeGuardian(index, "tipoEncargado", e.target.value)}>{["MADRE", "PADRE", "ENCARGADO"].map(t => <option key={t}>{t}</option>)}</select></Field>
              {([["titulo", "Tratamiento"], ["identificacion", "Identificación"], ["telefonoSecundario", "Otro celular"], ["parentesco", "Parentesco"]] as [keyof GuardianForm, string][]).map(([key, label]) => <Field key={key} label={label}><input value={asText(guardian[key])} onChange={e => changeGuardian(index, key, e.target.value)} /></Field>)}
              <Field label="Dirección exacta" wide><textarea rows={2} value={guardian.direccionExacta} onChange={e => changeGuardian(index, "direccionExacta", e.target.value)} /></Field>
            </div></DetailWindow></div>
          </div><div className="em-checks"><Check label="Vive con el estudiante" checked={guardian.viveConEstudiante} onChange={v => changeGuardian(index, "viveConEstudiante", v)} /><Check label="Encargado principal" checked={guardian.esPrincipal} onChange={v => changeGuardian(index, "esPrincipal", v)} /><Check label="Acepta WhatsApp" checked={guardian.aceptaWhatsApp} onChange={v => changeGuardian(index, "aceptaWhatsApp", v)} /><Check label="Acepta correo" checked={guardian.aceptaCorreo} onChange={v => changeGuardian(index, "aceptaCorreo", v)} /><Check label="Recibe notificaciones" checked={guardian.aceptaWhatsApp || guardian.aceptaCorreo} disabled /></div></section>)}</section>
      </fieldset>
      <section className="em-panel em-enrollment" ref={enrollmentSectionRef}>
        <div className="em-section-title em-spread"><div className="em-title-group"><span className="em-step">03</span><div><h2>Matrícula del año lectivo</h2><p>El mismo estudiante, con su información académica por año.</p></div></div><span className="em-badge">{edited?.Estado || "Por registrar"}</span></div>
        {selected && !historyReady && <div className="em-notice em-warning">Consultá el historial para verificar si ya existe una matrícula. <button disabled={!!busy} onClick={() => void refreshHistory()}>Consultar matrícula</button></div>}
        {!derivedEnrollment.correoEnvioBoleta && <div className="em-notice em-warning" role="status">Ningún encargado tiene correo registrado. Completalo en su ficha para disponer del correo de envío de la boleta.</div>}
        <p className="em-auto-fields">La boleta toma la sección del grupo, la ruta del estudiante y el correo del encargado{derivedEnrollment.correoEnvioBoleta ? `: ${derivedEnrollment.correoEnvioBoleta}` : "."}</p>
        {partialSave && <div className="em-notice em-warning">Los datos personales están guardados. Revisá la matrícula y reintentá sin crear otro estudiante.</div>}
        <fieldset disabled={!!busy || inactive || catalogLoading || !!catalogError || !historyReady} ref={enrollmentFieldsRef}>
          <div className="em-year-row"><Field label="Año lectivo *"><CatalogSelect value={enrollment.anioLectivoId} rows={catalogs.years} idKey="AnioLectivoId" textKey="Nombre" currentLabel={edited?.AnioNombre} required onChange={changeYear} /></Field><div className="em-year-hint">{editingId ? `Editando matrícula #${editingId}. Se conserva el registro existente.` : "Nueva matrícula para el año seleccionado."}</div></div>
          {inactiveEnrollment && <div className="em-notice em-warning">Esta matrícula está inactiva. Podés reactivarla desde el historial si no existe otra activa en el año.</div>}
          {!yearActive && enrollment.anioLectivoId && <div className="em-notice em-warning">El año seleccionado está inactivo. Su matrícula se conserva para consulta.</div>}
          {!groupOptions.some(g => asFlag(g.Activo)) && <div className="em-notice em-warning">No hay grupos activos para este año. Configuralos en Administrativo; podés guardar los datos del estudiante mientras tanto.</div>}
          <fieldset disabled={inactiveEnrollment || !yearActive}>
            <div className="em-grid">
              <Field label="Tipo de matrícula"><input list="em-enrollment-types" value={enrollment.tipoMatricula} onChange={e => changeEnrollment("tipoMatricula", e.target.value)} placeholder="Regular CTP, Plan Nacional u otro" /><datalist id="em-enrollment-types"><option value={`Regular CTP ${catalogs.years.find(y => asText(y.AnioLectivoId) === enrollment.anioLectivoId)?.Nombre || ""}`} /><option value={`Plan Nacional ${catalogs.years.find(y => asText(y.AnioLectivoId) === enrollment.anioLectivoId)?.Nombre || ""}`} /></datalist></Field>
              {enrollmentInput("fechaMatricula", "Fecha de matrícula", "date")}<Field label="Grupo / sección *"><CatalogSelect value={enrollment.grupoId} rows={groupOptions} idKey="GrupoId" textKey="Nombre" currentLabel={edited?.GrupoNombre} required onChange={changeGroup} /></Field>
              <Field label="Nivel académico"><input value={enrollment.grupoId ? levelName(derivedEnrollment.nivelAcademico) : "Seleccione una sección"} readOnly /><small>Se actualiza al seleccionar el grupo / sección.</small></Field>
              <Field label="Especialidad (opcional)"><CatalogSelect value={enrollment.especialidadId} rows={catalogs.specialties} idKey="EspecialidadId" placeholder="Sin especialidad del catálogo" currentLabel={enrollment.especialidad} onChange={id => setEnrollment(prev => ({ ...prev, especialidadId: id, especialidad: asText(catalogs.specialties.find(s => asText(s.EspecialidadId) === id)?.Descripcion) }))} />{!enrollment.especialidadId && enrollment.especialidad && <small>Descripción registrada: {enrollment.especialidad}</small>}</Field>

            </div>
            <div className="em-checks"><Check label="Es repitente en esta matrícula" checked={enrollment.esRepitente} onChange={v => changeEnrollment("esRepitente", v)} /><Check label="Permitir excepción de progresión" checked={enrollment.permiteExcepcionProgresion} onChange={v => changeEnrollment("permiteExcepcionProgresion", v)} /></div>
            {enrollment.permiteExcepcionProgresion && <Field label="Justificación de excepción"><textarea rows={2} value={enrollment.justificacionExcepcion} onChange={e => changeEnrollment("justificacionExcepcion", e.target.value)} /></Field>}
            <div className={`em-progression ${progressWarning ? "em-warning" : ""}`}>{progressWarning || (prior ? `Último nivel registrado: ${prior.GrupoNivelAcademico || prior.NivelAcademico || prior.GrupoNivel || "No indicado"}. La progresión se verifica al guardar.` : "Sin matrícula anterior registrada. El servicio validará el nuevo ingreso.")}</div>
            <details open className="em-details"><summary>Observaciones de matrícula<span>General y detalle para la boleta</span></summary><div className="em-grid em-two"><Field label="Observación general"><textarea rows={3} value={enrollment.observacion} onChange={e => changeEnrollment("observacion", e.target.value)} /></Field><Field label="Observaciones del detalle"><textarea rows={3} value={enrollment.observacionesDetalle} onChange={e => changeEnrollment("observacionesDetalle", e.target.value)} /></Field></div></details>
          </fieldset>
        </fieldset>
        {isTransfer && <div className="em-notice em-warning"><strong>Traslado de sección: {edited?.GrupoNombre} → {groupOptions.find(g => asText(g.GrupoId) === enrollment.grupoId)?.Nombre || enrollment.seccionTexto}</strong><span>Se utilizará el proceso existente de traslado de notas, seguimiento y asistencia. Se pedirá confirmación antes de guardar.</span></div>}

      </section>
      </div>
      <div className="em-savebar">        <div className="em-panel-footer"><small>* Campos obligatorios. Podés guardar el expediente sin matricular.</small><button disabled={!!busy || inactive} onClick={() => void save(false)}>Guardar datos del estudiante</button></div>        <div className="em-panel-footer"><small>Los datos personales y la matrícula se guardan en pasos separados. El formulario se conserva si ocurre un error.</small><div className="em-actions">{editingId && <a className="em-button" href={`/boletas/matricula/${editingId}`} target="_blank" rel="noopener noreferrer">Boleta guardada / imprimir ↗</a>}<button className="em-primary" disabled={!!busy || inactive || inactiveEnrollment || !historyReady || catalogLoading || !!catalogError || !yearActive} onClick={() => void save(true)}>{partialSave ? "Reintentar matrícula" : isTransfer ? "Guardar y trasladar" : editingId ? "Guardar datos y actualizar matrícula" : "Guardar y matricular"}</button></div></div></div>
      <div className="em-secondary-tools">
      <DetailWindow title="Historial completo de matrícula" disabled={!!busy}><div className="em-section-title em-spread"><div><h2>Historial de matrícula</h2><p>Consultá cada año sin duplicar el expediente.</p></div><div className="em-actions"><Check label="Mostrar inactivas" checked={showInactiveHistory} onChange={setShowInactiveHistory} /><button disabled={!!busy || !selected} onClick={() => void refreshHistory()}>Actualizar historial</button></div></div>
        <div className="em-table-wrap"><table><thead><tr><th>Año</th><th>Grupo / sección</th><th>Tipo y especialidad</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{history.filter(row => showInactiveHistory || isActiveEnrollment(row)).map(row => <tr key={row.MatriculaId}><td>{row.AnioNombre}</td><td>{row.GrupoNombre}</td><td>{row.TipoMatricula || "—"}<small>{row.EspecialidadDescripcion || row.Especialidad}</small></td><td>{asDate(row.FechaMatricula) || "—"}</td><td><span className="em-badge">{row.Estado}</span></td><td><div className="em-actions"><button disabled={!!busy} onClick={event => { if (editEnrollment(row)) event.currentTarget.closest("dialog")?.close(); }}>{isActiveEnrollment(row) ? "Editar / trasladar" : "Ver registro"}</button><a href={`/boletas/matricula/${row.MatriculaId}`} target="_blank" rel="noopener noreferrer">Boleta ↗</a><button disabled={!!busy || inactive} onClick={() => void changeEnrollmentStatus(row)}>{isActiveEnrollment(row) ? "Inactivar" : "Reactivar"}</button></div></td></tr>)}</tbody></table>{!history.filter(row => showInactiveHistory || isActiveEnrollment(row)).length && <p className="em-empty">{historyReady ? "No hay matrículas para mostrar con este filtro." : "Historial pendiente de consulta."}</p>}</div>
      </DetailWindow>
      {selected && <section className="em-panel"><div className="em-section-title em-spread"><div><h2>Administración del expediente</h2><p>Estado del estudiante y seguimiento institucional.</p></div><div className="em-actions"><button disabled={!!busy || inactive} onClick={openSuspension}>{suspended ? "Modificar suspensión" : "Suspender estudiante"}</button><button className="em-danger" disabled={!!busy} onClick={() => void changeStudentStatus()}>{inactive ? "Reactivar estudiante" : "Inactivar estudiante"}</button></div></div>
        {suspensionOpen && <form onSubmit={e => { e.preventDefault(); void saveSuspension(); }}><fieldset disabled={!!busy}><div className="em-grid"><Field label="Motivo"><select value={suspension.motivo} onChange={e => setSuspension(prev => ({ ...prev, motivo: e.target.value }))}><option>Medida Precautoria</option><option>Acción Correctiva</option></select></Field><Field label="Fecha de inicio"><input type="date" required value={suspension.fechaInicio} onChange={e => setSuspension(prev => ({ ...prev, fechaInicio: e.target.value }))} /></Field><Field label="Fecha de fin"><input type="date" required value={suspension.fechaFin} onChange={e => setSuspension(prev => ({ ...prev, fechaFin: e.target.value }))} /></Field><Field label="Observación" wide><textarea value={suspension.observacion} onChange={e => setSuspension(prev => ({ ...prev, observacion: e.target.value }))} /></Field></div><div className="em-actions"><button className="em-primary">Guardar suspensión</button>{suspended && selected.SuspensionId && <button type="button" onClick={() => void saveSuspension(true)}>Retirar suspensión</button>}<button type="button" onClick={() => setSuspensionOpen(false)}>Cancelar</button></div></fieldset></form>}
      </section>}
      {conductOpen && <section className="em-panel"><div className="em-section-title em-spread"><h2>Boletas de conducta</h2><div className="em-actions"><button disabled={!!busy || inactive} onClick={() => void prepareConduct()}>Generar boleta</button><button disabled={!!busy} onClick={() => setConductOpen(false)}>Cerrar</button></div></div>
        {conductContext && <form onSubmit={createConduct}><fieldset disabled={!!busy}><div className="em-notice">{conductContext.estudianteNombre} · Sección {conductContext.seccion} · {conductContext.funcionarioNombre} · {asDate(conductContext.fecha)}</div><div className="em-grid em-two"><Field label="Detalle de los hechos"><textarea required rows={3} value={conduct.detalleHechos} onChange={e => setConduct(prev => ({ ...prev, detalleHechos: e.target.value }))} /></Field><Field label="Lugar del acontecimiento"><input required value={conduct.lugarAcontecimiento} onChange={e => setConduct(prev => ({ ...prev, lugarAcontecimiento: e.target.value }))} /></Field></div><div className="em-actions"><button className="em-primary">Guardar boleta</button><button type="button" onClick={() => setConductContext(null)}>Cancelar</button></div></fieldset></form>}
        <div className="em-table-wrap"><table><thead><tr><th>Número</th><th>Fecha</th><th>Detalle</th><th>Correo / WhatsApp</th><th>Documento</th></tr></thead><tbody>{conductRows.map(row => <tr key={row.BoletaConductaId}><td>{row.CodigoBoleta || row.NumeroBoleta}</td><td>{asDate(row.Fecha)}</td><td>{row.DetalleHechos}<small>{row.LugarAcontecimiento}</small></td><td>{row.EnvioCorreo || "—"} / {row.EnvioWhatsApp || "—"}</td><td><a href={`/boletas/conducta/${row.BoletaConductaId}`} target="_blank" rel="noopener noreferrer">Ver boleta ↗</a></td></tr>)}</tbody></table>{!conductRows.length && <p className="em-empty">Sin boletas de conducta registradas.</p>}</div>
      </section>}
      </div>
    </>}
  </div>;
}
