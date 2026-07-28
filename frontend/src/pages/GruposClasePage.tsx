// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/http";
import { getAdecuacionStyleKind } from "../utils/adecuacionStyles";

const dias: Record<number, string> = {
  2: "Lunes",
  3: "Martes",
  4: "Miércoles",
  5: "Jueves",
  6: "Viernes"
};

function dataOf(response: any) {
  return response?.data?.data ?? response?.data ?? null;
}

function idsFrom(values: unknown[]) {
  return values.map(Number).filter((value) => Number.isInteger(value) && value > 0);
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const initialForm = {
  nombre: "",
  descripcion: "",
  anioLectivoId: 0,
  periodoId: 0,
  materiaId: 0,
  grupoIdPrincipal: 0,
  grupoIds: [] as number[],
  subEspecialidadIds: [] as number[],
  matriculaIds: [] as number[],
  usuarioIds: [] as number[],
  usuarioPrincipalId: 0,
  horarioGrupoIds: [] as number[],
  modoSeleccion: "MIXTO",
  reglaCoincidencia: "CUALQUIERA"
};

export default function GruposClasePage() {
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  const [catalogos, setCatalogos] = useState<any>(null);
  const [gruposClase, setGruposClase] = useState<any[]>([]);
  const [horarios, setHorarios] = useState<any[]>([]);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [perfilMatriculaId, setPerfilMatriculaId] = useState<number | null>(null);
  const [perfilIds, setPerfilIds] = useState<number[]>([]);
  const [materiaSearch, setMateriaSearch] = useState("");
  const [profesorSearch, setProfesorSearch] = useState("");
  const [estudianteSearch, setEstudianteSearch] = useState("");
  const horarioRequestKeyRef = useRef("");

  async function loadBase() {
    setError("");
    try {
      const schema = dataOf(await api.get("/grupos-clase/estado-esquema"));
      const ready = Boolean(schema?.listo);
      setSchemaReady(ready);
      if (!ready) return;
      const [catalogResponse, listResponse] = await Promise.all([
        api.get("/grupos-clase/catalogos"),
        api.get("/grupos-clase")
      ]);
      const catalogs = dataOf(catalogResponse);
      setCatalogos(catalogs);
      setGruposClase(dataOf(listResponse) || []);
      const activeYear = (catalogs?.anios || []).find((item: any) => item.Activo)
        || catalogs?.anios?.[0];
      setForm((current) => current.anioLectivoId
        ? current
        : { ...current, anioLectivoId: Number(activeYear?.AnioLectivoId || 0) });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo cargar la configuración");
    }
  }

  useEffect(() => {
    void loadBase();
  }, []);

  const periodos = useMemo(
    () => (catalogos?.periodos || []).filter(
      (item: any) => Number(item.AnioLectivoId) === Number(form.anioLectivoId)
    ),
    [catalogos, form.anioLectivoId]
  );

  const secciones = useMemo(
    () => (catalogos?.grupos || []).filter(
      (item: any) => Number(item.AnioLectivoId) === Number(form.anioLectivoId) && item.Activo
    ),
    [catalogos, form.anioLectivoId]
  );

  const materiasFiltradas = useMemo(() => {
    const q = normalizeSearch(materiaSearch);
    return (catalogos?.materias || []).filter((item: any) => {
      if (!item.Activa) return false;
      if (Number(item.MateriaId) === Number(form.materiaId)) return true;
      return !q || normalizeSearch(`${item.Codigo || ""} ${item.Nombre || ""}`).includes(q);
    });
  }, [catalogos, materiaSearch, form.materiaId]);

  const profesoresFiltrados = useMemo(() => {
    const q = normalizeSearch(profesorSearch);
    return (catalogos?.profesores || []).filter((item: any) => {
      if (form.usuarioIds.includes(Number(item.UsuarioId))) return true;
      return !q || normalizeSearch(
        `${item.PrimerApellido || ""} ${item.SegundoApellido || ""} ${item.Nombre || ""} ${item.Correo || ""}`
      ).includes(q);
    });
  }, [catalogos, profesorSearch, form.usuarioIds]);

  const candidatosFiltrados = useMemo(() => {
    const q = normalizeSearch(estudianteSearch);
    if (!q) return candidatos;
    return candidatos.filter((item: any) => normalizeSearch(
      `${item.Identificacion || ""} ${item.PrimerApellido || ""} ${item.SegundoApellido || ""} ${item.Nombre || ""} ${item.GrupoNombre || ""} ${item.Especialidad || ""}`
    ).includes(q));
  }, [candidatos, estudianteSearch]);

  const materiaSubIds = useMemo(() => idsFrom(
    (catalogos?.materiasSubEspecialidad || [])
      .filter((item: any) => Number(item.MateriaId) === Number(form.materiaId))
      .map((item: any) => item.SubEspecialidadId)
  ), [catalogos, form.materiaId]);

  function suggestedGroupName(sourceForm = form) {
    const sectionNames = secciones
      .filter((item: any) => sourceForm.grupoIds.includes(Number(item.GrupoId)))
      .map((item: any) => String(item.Nombre || "").trim())
      .filter(Boolean);
    const subject = (catalogos?.materias || []).find(
      (item: any) => Number(item.MateriaId) === Number(sourceForm.materiaId)
    );
    const subjectName = String(subject?.Nombre || "").trim();
    return [sectionNames.join("/"), subjectName].filter(Boolean).join(" - ").slice(0, 200);
  }

  async function loadHorarios(sourceForm = form) {
    const ready = sourceForm.anioLectivoId
      && sourceForm.periodoId
      && sourceForm.materiaId
      && sourceForm.grupoIds.length;
    if (!ready) {
      horarioRequestKeyRef.current = "";
      setHorarios([]);
      setLoadingHorarios(false);
      return;
    }

    const requestKey = [
      sourceForm.anioLectivoId,
      sourceForm.periodoId,
      sourceForm.materiaId,
      [...sourceForm.grupoIds].sort((a, b) => a - b).join(","),
      [...sourceForm.usuarioIds].sort((a, b) => a - b).join(",")
    ].join("|");
    horarioRequestKeyRef.current = requestKey;
    setLoadingHorarios(true);
    try {
      const response = await api.post("/grupos-clase/horarios-disponibles", {
        anioLectivoId: sourceForm.anioLectivoId,
        periodoId: sourceForm.periodoId,
        materiaId: sourceForm.materiaId,
        grupoIds: sourceForm.grupoIds,
        usuarioIds: sourceForm.usuarioIds
      });
      if (horarioRequestKeyRef.current === requestKey) {
        setHorarios(dataOf(response) || []);
      }
    } catch (requestError: any) {
      if (horarioRequestKeyRef.current === requestKey) {
        setHorarios([]);
        setError(requestError?.response?.data?.message || "No se pudieron cargar las lecciones");
      }
    } finally {
      if (horarioRequestKeyRef.current === requestKey) setLoadingHorarios(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHorarios(form);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    form.anioLectivoId,
    form.periodoId,
    form.materiaId,
    form.grupoIds.join(","),
    form.usuarioIds.join(",")
  ]);

  function resetForm() {
    const activeYear = (catalogos?.anios || []).find((item: any) => item.Activo)
      || catalogos?.anios?.[0];
    setEditingId(null);
    setCandidatos([]);
    setHorarios([]);
    setPerfilMatriculaId(null);
    setMateriaSearch("");
    setProfesorSearch("");
    setEstudianteSearch("");
    setForm({ ...initialForm, anioLectivoId: Number(activeYear?.AnioLectivoId || 0) });
  }

  async function loadCandidates(selectSuggested = true, sourceForm = form) {
    if (!sourceForm.anioLectivoId || !sourceForm.grupoIds.length) {
      setError("Seleccioná el año y al menos una sección");
      return;
    }
    setLoadingCandidates(true);
    setError("");
    try {
      const response = await api.post("/grupos-clase/candidatos", {
        anioLectivoId: sourceForm.anioLectivoId,
        grupoIds: sourceForm.grupoIds,
        subEspecialidadIds: sourceForm.subEspecialidadIds,
        reglaCoincidencia: sourceForm.reglaCoincidencia
      });
      const rows = dataOf(response) || [];
      setCandidatos(rows);
      if (selectSuggested) {
        const selected = sourceForm.subEspecialidadIds.length
          ? rows
            .filter((row: any) => Boolean(row.Sugerido))
            .map((row: any) => Number(row.MatriculaId))
          : [];
        setForm((current) => ({ ...current, matriculaIds: selected }));
      }
    } catch (requestError: any) {
      const status = requestError?.response?.status;
      const serverMessage = requestError?.response?.data?.message;
      setError(
        status === 504
          ? "No se pudieron cargar los estudiantes. La consulta tardó demasiado; probá con menos secciones o intentá de nuevo."
          : (serverMessage || "No se pudieron cargar los estudiantes")
      );
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function editGroup(id: number) {
    setLoading(true);
    setError("");
    try {
      const detail = dataOf(await api.get(`/grupos-clase/${id}`));
      const next = {
        nombre: detail.Nombre || "",
        descripcion: detail.Descripcion || "",
        anioLectivoId: Number(detail.AnioLectivoId),
        periodoId: Number(detail.PeriodoId),
        materiaId: Number(detail.MateriaId),
        grupoIdPrincipal: Number(detail.GrupoIdPrincipal),
        grupoIds: idsFrom(detail.grupoIds || []),
        subEspecialidadIds: idsFrom(detail.subEspecialidadIds || []),
        matriculaIds: idsFrom(detail.matriculaIds || []),
        usuarioIds: idsFrom(detail.usuarioIds || []),
        usuarioPrincipalId: Number(detail.usuarioPrincipalId || 0),
        horarioGrupoIds: idsFrom(detail.horarioGrupoIds || []),
        modoSeleccion: detail.ModoSeleccion || "MIXTO",
        reglaCoincidencia: detail.ReglaCoincidencia || "CUALQUIERA"
      };
      setEditingId(id);
      setForm(next);
      await loadCandidates(false, next);
      setForm(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo abrir el grupo");
    } finally {
      setLoading(false);
    }
  }

  async function saveGroup() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const nombre = String(form.nombre || "").trim() || suggestedGroupName(form);
      const payload = {
        ...form,
        nombre,
        grupoIds: idsFrom(form.grupoIds),
        matriculaIds: idsFrom(form.matriculaIds),
        usuarioIds: idsFrom(form.usuarioIds),
        subEspecialidadIds: idsFrom(form.subEspecialidadIds),
        horarioGrupoIds: idsFrom(form.horarioGrupoIds)
      };
      if (editingId) {
        await api.put(`/grupos-clase/${editingId}`, payload);
      } else {
        await api.post("/grupos-clase", payload);
      }
      setMessage(editingId ? "Grupo actualizado correctamente" : "Grupo creado correctamente");
      resetForm();
      await loadBase();
    } catch (requestError: any) {
      const responseData = requestError?.response?.data || {};
      const details = responseData.issues ?? responseData.errors;
      const detailMessage = Array.isArray(details)
        ? details.filter(Boolean).join(". ")
        : (typeof details === "string" ? details : "");
      setError(detailMessage || responseData.message || "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  async function deactivateGroup(id: number) {
    if (!window.confirm("¿Desactivar este grupo de clase? Los registros académicos se conservarán.")) return;
    setLoading(true);
    try {
      await api.delete(`/grupos-clase/${id}`);
      setMessage("Grupo desactivado. No se eliminó información académica.");
      await loadBase();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo desactivar");
    } finally {
      setLoading(false);
    }
  }

  async function duplicateGroup(id: number) {
    if (!window.confirm("¿Duplicar este grupo de clase? Se creará una copia activa para editarla.")) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const duplicated = dataOf(await api.post(`/grupos-clase/${id}/duplicar`));
      const newId = Number(duplicated?.grupoClaseId || 0);
      await loadBase();
      if (newId) {
        await editGroup(newId);
      }
      setMessage("Grupo duplicado. Se abrió la copia para editarla.");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo duplicar");
    } finally {
      setLoading(false);
    }
  }

  async function saveStudentProfile() {
    if (!perfilMatriculaId) return;
    try {
      await api.put(`/grupos-clase/matriculas/${perfilMatriculaId}/subespecialidades`, {
        subEspecialidadIds: perfilIds
      });
      setPerfilMatriculaId(null);
      await loadCandidates(false);
      setMessage("Perfil técnico actualizado");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo actualizar el perfil");
    }
  }

  async function saveSubjectProfile() {
    if (!form.materiaId) return;
    try {
      await api.put(`/grupos-clase/materias/${form.materiaId}/subespecialidades`, {
        subEspecialidadIds: form.subEspecialidadIds
      });
      setMessage("Relación de materia y subespecialidad actualizada");
      await loadBase();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo actualizar la materia");
    }
  }

  const panel: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 16,
    background: "#ffffff",
    color: "#0f172a"
  };
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
    gap: 12
  };
  const input: React.CSSProperties = {
    width: "100%",
    minHeight: 40,
    marginTop: 5,
    padding: "8px 10px",
    border: "1px solid #64748b",
    borderRadius: 6,
    background: "#fff",
    color: "#0f172a",
    fontWeight: 600
  };
  const checklist: React.CSSProperties = {
    display: "grid",
    gap: 0,
    maxHeight: 250,
    overflow: "auto",
    border: "1px solid #94a3b8",
    padding: 0,
    borderRadius: 6,
    background: "#ffffff",
    color: "#0f172a",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box"
  };
  const zebraRow = (index: number): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 10px",
    background: index % 2 === 0 ? "#ffffff" : "#eaf1f8",
    color: "#0f172a",
    borderBottom: "1px solid #d7e0ea",
    fontWeight: 600
  });
  const helpText: React.CSSProperties = {
    margin: "6px 0 10px",
    color: "#334155",
    lineHeight: 1.45
  };
  const sectionTitle: React.CSSProperties = {
    display: "block",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: "1rem"
  };
  const checkboxRightRow = (index: number): React.CSSProperties => ({
    ...zebraRow(index),
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    justifyContent: "normal"
  });
  const tableHeader: React.CSSProperties = {
    padding: "9px 8px",
    background: "#d8e2ee",
    color: "#0f172a",
    textAlign: "left",
    borderBottom: "1px solid #94a3b8"
  };

  if (schemaReady === false) {
    return (
      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Grupos de clase</h2>
        <p>La pantalla está lista, pero primero debés ejecutar el script SQL entregado.</p>
        <code>backend/sql/2026-07-25_grupos_clase_combinados.sql</code>
      </section>
    );
  }

  if (schemaReady === null || !catalogos) {
    return (
      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Grupos de clase</h2>
        <p style={{ marginBottom: 0, color: "#334155", fontWeight: 700 }}>Cargando catálogos...</p>
      </section>
    );
  }

  return (
    <div className="grupos-clase-page" style={{ display: "grid", gap: 14, color: "#0f172a" }}>
      <header className="grupos-clase-page-header">
        <h2 style={{ marginBottom: 4 }}>Grupos de clase</h2>
        <p style={{ margin: 0 }}>
          Agrupá estudiantes de varias secciones sin cambiar su matrícula oficial.
        </p>
      </header>

      {error ? <div style={{ ...panel, borderColor: "#ef4444", background: "#fef2f2", color: "#991b1b" }}>{error}</div> : null}
      {message ? <div style={{ ...panel, borderColor: "#22c55e", background: "#f0fdf4", color: "#166534" }}>{message}</div> : null}

      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>{editingId ? "Editar grupo" : "Nuevo grupo"}</h3>
            <p style={{ margin: "4px 0 14px", color: "#475569" }}>
              La lista marcada será la lista exacta que verá el profesor.
            </p>
          </div>
          {editingId ? <button type="button" onClick={resetForm}>Cancelar edición</button> : null}
        </div>

        <div style={grid}>
          <label>Nombre del grupo
            <input style={input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Se genera automáticamente si lo dejás vacío" />
            <small style={{ display: "block", marginTop: 4, color: "#334155" }}>
              Podés escribir un nombre propio o dejar que el sistema use secciones y materia.
            </small>
          </label>
          <label>Año lectivo
            <select style={input} value={form.anioLectivoId} onChange={(e) => setForm({ ...form, anioLectivoId: Number(e.target.value), periodoId: 0, grupoIds: [], matriculaIds: [], horarioGrupoIds: [] })}>
              <option value={0}>Seleccionar</option>
              {(catalogos?.anios || []).map((item: any) => <option key={item.AnioLectivoId} value={item.AnioLectivoId}>{item.Nombre}</option>)}
            </select>
          </label>
          <label>Período
            <select style={input} value={form.periodoId} onChange={(e) => setForm({ ...form, periodoId: Number(e.target.value), horarioGrupoIds: [] })}>
              <option value={0}>Seleccionar</option>
              {periodos.map((item: any) => <option key={item.PeriodoId} value={item.PeriodoId}>{item.Nombre}</option>)}
            </select>
          </label>
          <label>Materia
            <input
              style={input}
              type="search"
              value={materiaSearch}
              onChange={(e) => setMateriaSearch(e.target.value)}
              placeholder="Buscar por código o nombre"
            />
            <select style={input} value={form.materiaId} onChange={(e) => {
              const materiaId = Number(e.target.value);
              const suggested = idsFrom((catalogos?.materiasSubEspecialidad || []).filter((row: any) => Number(row.MateriaId) === materiaId).map((row: any) => row.SubEspecialidadId));
              setForm({ ...form, materiaId, subEspecialidadIds: suggested, horarioGrupoIds: [] });
            }}>
              <option value={0}>Seleccionar</option>
              {materiasFiltradas.map((item: any) => <option key={item.MateriaId} value={item.MateriaId}>{item.Codigo ? `${item.Codigo} - ` : ""}{item.Nombre}</option>)}
            </select>
          </label>
        </div>

        <div style={{ ...grid, marginTop: 14 }}>
          <div>
            <strong style={sectionTitle}>1. Secciones de origen</strong>
            <p style={helpText}>Son las secciones oficiales donde están matriculados los estudiantes. No se crearán secciones nuevas.</p>
            <div style={{ ...checklist, marginTop: 6 }}>
              {secciones.map((item: any, index: number) => (
                <label key={item.GrupoId} style={checkboxRightRow(index)}>
                  <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.Nombre}>{item.Nombre}</span>
                  <input type="checkbox" checked={form.grupoIds.includes(Number(item.GrupoId))} onChange={() => {
                    const grupoIds = toggleId(form.grupoIds, Number(item.GrupoId));
                    setForm({
                      ...form,
                      grupoIds,
                      grupoIdPrincipal: grupoIds.includes(form.grupoIdPrincipal) ? form.grupoIdPrincipal : (grupoIds[0] || 0),
                      matriculaIds: [],
                      horarioGrupoIds: []
                    });
                    setCandidatos([]);
                  }} />
                </label>
              ))}
            </div>
            <label style={{ display: "block", marginTop: 8 }}>Sección principal
              <select style={input} value={form.grupoIdPrincipal} onChange={(e) => setForm({ ...form, grupoIdPrincipal: Number(e.target.value) })}>
                <option value={0}>Seleccionar</option>
                {secciones.filter((item: any) => form.grupoIds.includes(Number(item.GrupoId))).map((item: any) => <option key={item.GrupoId} value={item.GrupoId}>{item.Nombre}</option>)}
              </select>
            </label>
          </div>

          <div>
            <strong style={sectionTitle}>2. Subespecialidades</strong>
            <p style={helpText}>
              Identifican el perfil técnico que comparte este grupo. Seleccioná una o varias y luego usá
              <strong> Guardar vínculo con la materia</strong>. En la lista de estudiantes, <strong>Editar perfil</strong>
              permite asignarlas a cada matrícula.
            </p>
            <div style={{ ...checklist, marginTop: 6 }}>
              {(catalogos?.subEspecialidades || []).filter((item: any) => item.Activo).map((item: any, index: number) => (
                <label key={item.SubEspecialidadId} style={zebraRow(index)}>
                  <input type="checkbox" checked={form.subEspecialidadIds.includes(Number(item.SubEspecialidadId))} onChange={() => setForm({ ...form, subEspecialidadIds: toggleId(form.subEspecialidadIds, Number(item.SubEspecialidadId)), matriculaIds: [] })} />
                  {" "}{item.Descripcion} <small>({item.EspecialidadNombre})</small>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <select style={{ ...input, width: "auto", marginTop: 0 }} value={form.reglaCoincidencia} onChange={(e) => setForm({ ...form, reglaCoincidencia: e.target.value })}>
                <option value="CUALQUIERA">Coincide con cualquiera</option>
                <option value="TODAS">Debe tener todas</option>
              </select>
              <button type="button" disabled={!form.materiaId} onClick={saveSubjectProfile}>
                Guardar vínculo con la materia
              </button>
            </div>
            {materiaSubIds.length ? <small>La materia ya tiene {materiaSubIds.length} vínculo(s).</small> : null}
          </div>

          <div>
            <strong style={sectionTitle}>3. Profesores</strong>
            <p style={helpText}>Seleccioná quién verá y trabajará con este grupo desde Gestión del Profe.</p>
            <input
              style={input}
              type="search"
              value={profesorSearch}
              onChange={(e) => setProfesorSearch(e.target.value)}
              placeholder="Buscar por nombre o correo"
            />
            <div style={{ ...checklist, marginTop: 6 }}>
              {profesoresFiltrados.map((item: any, index: number) => {
                const id = Number(item.UsuarioId);
                return (
                  <label key={id} style={checkboxRightRow(index)}>
                    <span>{item.PrimerApellido} {item.SegundoApellido} {item.Nombre}<br /><small>{item.Correo}</small></span>
                    <input type="checkbox" checked={form.usuarioIds.includes(id)} onChange={() => {
                      const usuarioIds = toggleId(form.usuarioIds, id);
                      setForm({ ...form, usuarioIds, usuarioPrincipalId: usuarioIds.includes(form.usuarioPrincipalId) ? form.usuarioPrincipalId : (usuarioIds[0] || 0) });
                    }} />
                  </label>
                );
              })}
            </div>
            <label style={{ display: "block", marginTop: 8 }}>Profesor principal
              <select style={input} value={form.usuarioPrincipalId} onChange={(e) => setForm({ ...form, usuarioPrincipalId: Number(e.target.value) })}>
                <option value={0}>Seleccionar</option>
                {(catalogos?.profesores || []).filter((item: any) => form.usuarioIds.includes(Number(item.UsuarioId))).map((item: any) => <option key={item.UsuarioId} value={item.UsuarioId}>{item.PrimerApellido} {item.SegundoApellido} {item.Nombre}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <strong style={sectionTitle}>4. Lecciones del grupo</strong>
          <p style={helpText}>
            Se muestran únicamente las lecciones activas del período, materia y secciones seleccionadas.
            Los días usan el mismo calendario que Gestión del Profe y Reportes.
          </p>
          {horarios.length ? (
            <label style={{ ...checkboxRightRow(0), marginBottom: 6, background: "#dbeafe", border: "1px solid #93c5fd", borderRadius: 6 }}>
              <span>Seleccionar todas las lecciones mostradas ({horarios.length})</span>
              <input
                type="checkbox"
                checked={horarios.every((item: any) => form.horarioGrupoIds.includes(Number(item.HorarioGrupoId)))}
                onChange={(event) => {
                  const idsVisibles = horarios.map((item: any) => Number(item.HorarioGrupoId));
                  const visibles = new Set(idsVisibles);
                  const otras = form.horarioGrupoIds.filter((id) => !visibles.has(id));
                  setForm({
                    ...form,
                    horarioGrupoIds: event.target.checked ? [...otras, ...idsVisibles] : otras
                  });
                }}
              />
            </label>
          ) : null}
          <div style={{ ...checklist, marginTop: 6, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {loadingHorarios ? <span style={zebraRow(0)}>Cargando lecciones...</span> : horarios.length ? horarios.map((item: any, index: number) => {
              const id = Number(item.HorarioGrupoId);
              return (
                <label key={id} style={zebraRow(index)}>
                  <input type="checkbox" checked={form.horarioGrupoIds.includes(id)} onChange={() => setForm({ ...form, horarioGrupoIds: toggleId(form.horarioGrupoIds, id) })} />
                  <span>
                    {dias[Number(item.DiaSemana)] || `Día ${item.DiaSemana}`} · {item.BloqueNombre} · {item.GrupoNombre}
                    {item.AsignadoProfesor ? <small style={{ display: "block", color: "#166534" }}>Asignada al profesor seleccionado</small> : null}
                  </span>
                </label>
              );
            }) : (
              <span style={zebraRow(0)}>
                {form.periodoId && form.materiaId && form.grupoIds.length
                  ? "No se encontraron lecciones activas con esta combinación. Revisá el horario del período."
                  : "Seleccioná período, materia y secciones para ver sus lecciones."}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={sectionTitle}>5. Lista exacta de estudiantes</strong>
            <button type="button" onClick={() => loadCandidates(true)} disabled={loadingCandidates}>
              {loadingCandidates ? "Cargando..." : "Cargar estudiantes"}
            </button>
            <span>{form.matriculaIds.length} seleccionado(s)</span>
          </div>
          <p style={helpText}>
            Se cargan las matrículas activas del año que pertenecen a las secciones de origen. Si seleccionaste
            subespecialidades, el sistema marca como sugeridos únicamente los estudiantes cuyo perfil coincide.
            La selección que confirmés será la lista exacta del profesor.
          </p>
          {candidatos.length ? (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  style={{ ...input, maxWidth: 380, marginTop: 0 }}
                  type="search"
                  value={estudianteSearch}
                  onChange={(e) => setEstudianteSearch(e.target.value)}
                  placeholder="Buscar estudiante o identificación"
                />
                <button type="button" onClick={() => setForm({
                  ...form,
                  matriculaIds: candidatos.filter((row: any) => Boolean(row.Sugerido)).map((row: any) => Number(row.MatriculaId))
                })} disabled={!form.subEspecialidadIds.length}>
                  Seleccionar sugeridos
                </button>
                <button type="button" onClick={() => setForm({ ...form, matriculaIds: [] })}>
                  Quitar selección
                </button>
              </div>
                <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={tableHeader}></th><th style={tableHeader}>Estudiante</th><th style={tableHeader}>Sección</th><th style={tableHeader}>Especialidad</th><th style={tableHeader}>Perfil técnico</th><th style={tableHeader}></th></tr></thead>
                <tbody>
                  {candidatosFiltrados.map((item: any, index: number) => {
                    const id = Number(item.MatriculaId);
                    return (
                      <tr
                        key={id}
                        className="adecuacion-student-row"
                        data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                        style={{ background: index % 2 === 0 ? "#ffffff" : "#eaf1f8", color: "#0f172a" }}
                      >
                        <td style={{ padding: 8 }}><input type="checkbox" checked={form.matriculaIds.includes(id)} onChange={() => setForm({ ...form, matriculaIds: toggleId(form.matriculaIds, id) })} /></td>
                        <td style={{ padding: 8 }}>
                          <span style={{ color: "#0f172a", fontWeight: 900 }}>
                            {item.PrimerApellido} {item.SegundoApellido} {item.Nombre}
                          </span>
                          <br />
                          <small style={{ color: "#334155", fontWeight: 700 }}>{item.Identificacion}</small>
                        </td>
                        <td style={{ padding: 8 }}>{item.GrupoNombre}</td>
                        <td style={{ padding: 8 }}>{item.Especialidad || "Sin especialidad"}</td>
                        <td style={{ padding: 8 }}>{item.SubEspecialidades || "Sin perfil asignado"}</td>
                        <td style={{ padding: 8 }}><button type="button" onClick={() => {
                          setPerfilMatriculaId(id);
                          setPerfilIds(idsFrom(String(item.SubEspecialidadIds || "").split(",")));
                        }}>Editar perfil</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {perfilMatriculaId ? (
          <div style={{ ...panel, marginTop: 12, background: "#f8fafc" }}>
            <strong>Perfil técnico del estudiante</strong>
            <div style={{ ...checklist, marginTop: 8 }}>
              {(catalogos?.subEspecialidades || []).filter((item: any) => item.Activo).map((item: any, index: number) => {
                const id = Number(item.SubEspecialidadId);
                return <label key={id} style={zebraRow(index)}><input type="checkbox" checked={perfilIds.includes(id)} onChange={() => setPerfilIds(toggleId(perfilIds, id))} /> {item.Descripcion}</label>;
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={saveStudentProfile}>Guardar perfil</button>
              <button type="button" onClick={() => setPerfilMatriculaId(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        <label style={{ display: "block", marginTop: 14 }}>Descripción opcional
          <textarea style={{ ...input, minHeight: 72 }} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="primary-btn" type="button" onClick={saveGroup} disabled={loading}>
            {loading ? "Guardando..." : editingId ? "Guardar cambios" : "Crear grupo"}
          </button>
          <button type="button" onClick={resetForm}>Limpiar</button>
        </div>
      </section>

      <section style={panel}>
        <h3 style={{ marginTop: 0 }}>Grupos configurados</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={tableHeader}>Grupo</th><th style={tableHeader}>Materia</th><th style={tableHeader}>Secciones</th><th style={tableHeader}>Profesor(es)</th><th style={tableHeader}>Estudiantes</th><th style={tableHeader}></th></tr></thead>
            <tbody>
              {gruposClase.map((item: any, index: number) => (
                <tr key={item.GrupoClaseId} style={{ background: index % 2 === 0 ? "#ffffff" : "#eaf1f8", color: "#0f172a" }}>
                  <td style={{ padding: 8 }}><strong>{item.Nombre}</strong><br /><small>{item.AnioNombre} · {item.PeriodoNombre}</small></td>
                  <td style={{ padding: 8 }}>{item.MateriaNombre}</td>
                  <td style={{ padding: 8 }}>{item.Secciones}</td>
                  <td style={{ padding: 8 }}>{item.Profesores}</td>
                  <td style={{ padding: 8 }}>{item.TotalEstudiantes}</td>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                    <button type="button" disabled={loading} onClick={() => editGroup(Number(item.GrupoClaseId))}>Editar</button>{" "}
                    <button type="button" disabled={loading} onClick={() => duplicateGroup(Number(item.GrupoClaseId))}>Duplicar</button>{" "}
                    <button type="button" disabled={loading} onClick={() => deactivateGroup(Number(item.GrupoClaseId))}>Desactivar</button>
                  </td>
                </tr>
              ))}
              {!gruposClase.length ? <tr><td colSpan={6}>No hay grupos de clase configurados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
