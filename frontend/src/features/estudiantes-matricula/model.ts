// Adaptadores exclusivos de la ficha combinada. Los contratos existentes no cambian.
export type RecordData = Record<string, any>;
export const asText = (value: unknown) => value == null ? "" : String(value);
export const asFlag = (value: unknown) => ["true", "1", "si", "sí"].includes(asText(value).trim().toLowerCase());
export const asDate = (value: unknown) => asText(value).slice(0, 10);
export const fullName = (value: RecordData) => [value.PrimerApellido, value.SegundoApellido, value.Nombre].filter(Boolean).join(" ");
const comparable = (value: unknown) => asText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const validAdecuacion = (value: unknown) => !!comparable(value) && !["regular", "sin adecuacion", "seleccione", "no"].includes(comparable(value));

export const studentTextKeys = ["identificacion", "nombre", "primerApellido", "segundoApellido", "fechaNacimiento", "tipoIdentificacion", "correo", "telefono", "tipoEstudianteId", "rutaTransporteId", "sexo", "fotoUrl", "nacionalidad", "adecuacion", "nivelFuncionamiento", "discapacidad", "tipoDiscapacidad", "enfermedad", "rutaTransporteHabitual", "observaciones", "observacionMedica"] as const;
export const studentFlagKeys = ["autorizaWhatsAppEncargado", "repitente", "refugiado", "tieneAdecuacion"] as const;
export type StudentForm = Record<typeof studentTextKeys[number], string> & Record<typeof studentFlagKeys[number], boolean> & { aceptaWhatsAppEstudiante: boolean | null };
export const guardianTextKeys = ["tipoEncargado", "titulo", "identificacion", "nombre", "primerApellido", "segundoApellido", "correo", "telefono", "telefonoSecundario", "direccionExacta", "parentesco"] as const;
export const guardianFlagKeys = ["viveConEstudiante", "esPrincipal", "aceptaWhatsApp", "aceptaCorreo"] as const;
export type GuardianForm = Record<typeof guardianTextKeys[number], string> & Record<typeof guardianFlagKeys[number], boolean>;
export const enrollmentTextKeys = ["anioLectivoId", "grupoId", "fechaMatricula", "observacion", "tipoMatricula", "nivelAcademico", "especialidadId", "especialidad", "seccionTexto", "rutaTransporte", "justificacionExcepcion", "correoEnvioBoleta", "observacionesDetalle"] as const;
export type EnrollmentForm = Record<typeof enrollmentTextKeys[number], string> & { esRepitente: boolean; permiteExcepcionProgresion: boolean };
const capitalized = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
export function phoneDraft(value: unknown) {
  const phone = asText(value).trim();
  if (!phone) return "+506 ";
  if (phone.startsWith("+")) return phone;
  return `+506 ${phone}`;
}
export function phonePayload(value: unknown) {
  const phone = asText(value).trim();
  if (!phone || /^\+506[\s().-]*$/.test(phone)) return null;
  return phone.startsWith("+") ? phone.replace(/[\s().-]/g, "") : `+506${phone.replace(/\D/g, "")}`;
}

export function studentForm(record: RecordData = {}, routes: RecordData[] = []): StudentForm {
  const form = Object.fromEntries([
    ...studentTextKeys.map(key => [key, asText(record[capitalized(key)])]),
    ...studentFlagKeys.map(key => [key, asFlag(record[capitalized(key)])])
  ]) as StudentForm;
  form.aceptaWhatsAppEstudiante = record.AceptaWhatsAppEstudiante == null ? null : asFlag(record.AceptaWhatsAppEstudiante);
  form.fechaNacimiento = asDate(record.FechaNacimiento);
  form.telefono = phoneDraft(form.telefono);
  form.rutaTransporteHabitual ||= asText(record.RutaTransporteDescripcion);
  if (!form.rutaTransporteId && form.rutaTransporteHabitual.trim()) {
    const matches = routes.filter(route => comparable(route.Descripcion) === comparable(form.rutaTransporteHabitual));
    if (matches.length === 1) form.rutaTransporteId = asText(matches[0].RutaTransporteId);
  }
  form.tieneAdecuacion = record.TieneAdecuacion == null ? validAdecuacion(record.Adecuacion) : asFlag(record.TieneAdecuacion);
  return form;
}

export function guardianForm(record: RecordData = {}): GuardianForm {
  const form = Object.fromEntries([
    ...guardianTextKeys.map(key => [key, asText(record[capitalized(key)])]),
    ...guardianFlagKeys.map(key => [key, asFlag(record[capitalized(key)])])
  ]) as GuardianForm;
  form.tipoEncargado ||= "ENCARGADO";
  form.telefono = phoneDraft(form.telefono);
  form.telefonoSecundario = phoneDraft(form.telefonoSecundario);
  return form;
}

export function guardiansForm(records: RecordData[] = []): GuardianForm[] {
  // No truncar vínculos existentes aunque una importación haya agregado más de dos.
  const forms = records.map(guardianForm);
  while (forms.length < 2) forms.push(guardianForm());
  return forms;
}

export function enrollmentForm(record: RecordData = {}, year = "", today = ""): EnrollmentForm {
  const form = Object.fromEntries([
    ...enrollmentTextKeys.map(key => [key, asText(record[capitalized(key)])]),
    ["esRepitente", asFlag(record.EsRepitente)],
    ["permiteExcepcionProgresion", asFlag(record.PermiteExcepcionProgresion)]
  ]) as EnrollmentForm;
  form.anioLectivoId ||= year;
  form.fechaMatricula = asDate(record.FechaMatricula) || today;
  form.nivelAcademico ||= asText(record.GrupoNivelAcademico);
  form.especialidad ||= asText(record.EspecialidadDescripcion || record.GrupoEspecialidad);
  form.seccionTexto ||= asText(record.GrupoNombre);
  form.esRepitente = asFlag(record.EsRepitente);
  form.permiteExcepcionProgresion = asFlag(record.PermiteExcepcionProgresion);
  return form;
}

export function studentPayload(form: StudentForm, guardians: GuardianForm[]) {
  return {
    ...form,
    telefono: phonePayload(form.telefono),
    identificacion: form.identificacion.trim(), nombre: form.nombre.trim(),
    primerApellido: form.primerApellido.trim(), segundoApellido: form.segundoApellido.trim(),
    correo: form.correo.trim() || null,
    tipoEstudianteId: Number(form.tipoEstudianteId) || null,
    rutaTransporteId: Number(form.rutaTransporteId) || null,
    adecuacion: form.tieneAdecuacion ? form.adecuacion : null,
    tipoDiscapacidad: comparable(form.discapacidad) === "si" ? form.tipoDiscapacidad : null,
    encargados: guardians.filter(g => guardianTextKeys.some(key => {
      if (["tipoEncargado", "titulo", "parentesco"].includes(key)) return false;
      if (key === "telefono" || key === "telefonoSecundario") return !!phonePayload(g[key]);
      return g[key].trim() !== "";
    })).map(g => ({
      ...g, telefono: phonePayload(g.telefono), telefonoSecundario: phonePayload(g.telefonoSecundario),
      recibeNotificaciones: g.aceptaWhatsApp || g.aceptaCorreo
    }))
  };
}

export function enrollmentPayload(form: EnrollmentForm, studentId: number) {
  return { ...form, estudianteId: studentId, anioLectivoId: Number(form.anioLectivoId), grupoId: Number(form.grupoId),
    nivelAcademico: Number(form.nivelAcademico) || null, especialidadId: Number(form.especialidadId) || null,
    fechaMatricula: form.fechaMatricula || null, correoEnvioBoleta: form.correoEnvioBoleta.trim() || null };
}

export function transportDescription(student: StudentForm, routes: RecordData[]) {
  const route = routes.find(r => asText(r.RutaTransporteId) === student.rutaTransporteId);
  return route ? asText(route.Descripcion) : student.rutaTransporteHabitual;
}

export function groupLevel(group: RecordData | undefined) {
  if (!group) return "";
  const sectionLevel = asText(group.Nombre).trim().match(/^(\d{1,2})\s*[-–]/)?.[1];
  return sectionLevel ? String(Number(sectionLevel)) : asText(group.NivelAcademico);
}

export function levelName(level: string) {
  const names = ["", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo", "Duodécimo"];
  return names[Number(level)] || (level ? `Nivel ${level}` : "Sin nivel configurado");
}

export function sortedGroups(groups: RecordData[]) {
  return [...groups].sort((a, b) => asText(a.Nombre).localeCompare(asText(b.Nombre), "es", { numeric: true, sensitivity: "base" }));
}

export function automaticEnrollment(form: EnrollmentForm, student: StudentForm, guardians: GuardianForm[], groups: RecordData[], routes: RecordData[]): EnrollmentForm {
  const group = groups.find(g => asText(g.GrupoId) === form.grupoId && asText(g.AnioLectivoId) === form.anioLectivoId);
  const contact = guardians.find(g => g.esPrincipal && g.correo.trim()) || guardians.find(g => g.correo.trim());
  return { ...form, nivelAcademico: group ? groupLevel(group) : form.nivelAcademico,
    seccionTexto: group ? asText(group.Nombre) : form.seccionTexto,
    rutaTransporte: transportDescription(student, routes), correoEnvioBoleta: contact?.correo.trim() || "" };
}

export function studentError(form: StudentForm) {
  if ([form.identificacion, form.nombre, form.primerApellido, form.segundoApellido, form.fechaNacimiento].some(v => !v.trim())) return "Completá identificación, nombre, ambos apellidos y fecha de nacimiento.";
  if (form.tieneAdecuacion && !validAdecuacion(form.adecuacion)) return "Seleccioná un tipo de adecuación válido.";
  return "";
}

export function isActiveEnrollment(record: RecordData) { return asText(record.Estado).toLowerCase() === "activa"; }
export function studentHistory(records: RecordData[], studentId: number) {
  return records.filter(r => Number(r.EstudianteId) === studentId).sort((a, b) => Number(b.AnioLectivoId) - Number(a.AnioLectivoId) || Number(b.MatriculaId) - Number(a.MatriculaId));
}
export function previousEnrollment(history: RecordData[], year: string) {
  // Mantener el mismo criterio por AnioLectivoId del servicio de progresión.
  return [...history].filter(r => Number(r.AnioLectivoId) < Number(year)).sort((a, b) => Number(b.AnioLectivoId) - Number(a.AnioLectivoId) || Number(b.MatriculaId) - Number(a.MatriculaId))[0];
}
export function progressionError(form: EnrollmentForm, history: RecordData[]) {
  const last = previousEnrollment(history, form.anioLectivoId);
  const before = Number(last?.GrupoNivelAcademico || last?.NivelAcademico || 0);
  const next = Number(form.nivelAcademico);
  if (!before || !next) return "";
  if (before === next) return form.esRepitente ? "" : `El último nivel es ${before}. Marcá «Es repitente» para matricularlo en el mismo nivel.`;
  if (next === before + 1) return "";
  if (!form.permiteExcepcionProgresion) return `El siguiente nivel esperado es ${before + 1}. Este cambio requiere una excepción de progresión.`;
  return form.justificacionExcepcion.trim() ? "" : "Indicá la justificación de la excepción de progresión.";
}

export function enrollmentError(form: EnrollmentForm, history: RecordData[], editingId: number | null, groups: RecordData[], years: RecordData[], specialties: RecordData[]) {
  if (!form.anioLectivoId || !form.grupoId) return "Seleccioná el año lectivo y el grupo.";
  if (!years.some(y => asText(y.AnioLectivoId) === form.anioLectivoId && asFlag(y.Activo))) return "Seleccioná un año lectivo activo.";
  if (!groups.some(g => asText(g.GrupoId) === form.grupoId && asText(g.AnioLectivoId) === form.anioLectivoId && asFlag(g.Activo))) return "El grupo debe estar activo y pertenecer al año lectivo seleccionado.";
  if (form.especialidadId && !specialties.some(s => asText(s.EspecialidadId) === form.especialidadId && asFlag(s.Activo))) return "La especialidad seleccionada está inactiva o no está disponible.";
  if (history.some(r => asText(r.AnioLectivoId) === form.anioLectivoId && isActiveEnrollment(r) && Number(r.MatriculaId) !== editingId)) return "Ya hay una matrícula activa en este año. Abrí esa matrícula para editarla o trasladarla.";
  return progressionError(form, history);
}

// La ficha y la matrícula son dos operaciones existentes. Registrar el éxito de
// cada paso antes de continuar permite reintentar sin volver a crear el estudiante.
export async function saveCombined<T>(steps: {
  studentId: number | null;
  studentChanged: boolean;
  withEnrollment: boolean;
  saveStudent: (id: number | null) => Promise<T>;
  studentSaved: (record: T) => number;
  saveEnrollment: (id: number) => Promise<void>;
}) {
  let id = steps.studentId;
  if (!id || steps.studentChanged) id = steps.studentSaved(await steps.saveStudent(id));
  if (!id) throw new Error("No se recibió el identificador del estudiante. Consultá su ficha antes de reintentar.");
  if (steps.withEnrollment) await steps.saveEnrollment(id);
  return id;
}
