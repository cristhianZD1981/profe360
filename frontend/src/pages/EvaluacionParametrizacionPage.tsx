import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type CatalogoItem = {
  AnioLectivoId?: number;
  PeriodoId?: number;
  MateriaId?: number;
  Nombre: string;
  Activo?: boolean;
  AnioLectivoIdRelacionado?: number;
  AnioNombre?: string | null;
};

type InstitucionOption = {
  InstitucionId: number;
  Nombre: string;
  NombreComercial?: string | null;
};

type NivelDesempeno = {
  NivelDesempenoId: number;
  Descripcion: string;
  Valor: number;
  Activo: boolean;
};

type EvaluacionActividad = {
  EvaluacionActividadId: number;
  EvaluacionComponenteId: number;
  Descripcion: string;
  Porcentaje: number;
  UsaIndicadoresPlaneamiento?: boolean | number;
  usaIndicadoresPlaneamiento?: boolean | number;
  VinculadoPlaneamiento?: boolean | number;
  Fecha?: string | null;
  Orden: number;
  Activo: boolean;
};

type EvaluacionComponente = {
  EvaluacionComponenteId: number;
  EvaluacionPlantillaId: number;
  Descripcion: string;
  Porcentaje: number;
  Orden: number;
  Activo: boolean;
  PermitePlaneamiento?: boolean | number;
  TipoSeguimiento?: string | null;
  Actividades?: EvaluacionActividad[];
};

type EvaluacionPlantilla = {
  EvaluacionPlantillaId: number;
  InstitucionId: number;
  InstitucionNombre?: string | null;
  AnioLectivoId: number;
  AnioNombre?: string | null;
  PeriodoId: number;
  PeriodoNombre?: string | null;
  MateriaId: number;
  MateriaNombre?: string | null;
  Nombre: string;
  PermitirProfesorEditar: boolean;
  DecimalesNota: number;
  UsuarioCreadorId?: number | null;
  EsPublica?: boolean;
  Estado: string;
  Activo: boolean;
  TotalComponentes?: number;
  Componentes?: EvaluacionComponente[];
};

const initialPlantillaForm = {
  nombre: "",
  anioLectivoId: "",
  periodoId: "",
  materiaId: "",
  decimalesNota: "2",
  permitirProfesorEditar: false,
  esPublica: false
};

const initialNivelForm = {
  descripcion: "",
  valor: ""
};

const initialComponenteForm = {
  descripcion: "",
  porcentaje: "",
  orden: "1",
  permitePlaneamiento: false,
  tipoSeguimiento: ""
};

const initialActividadForm = {
  componenteId: "",
  descripcion: "",
  porcentaje: "",
  fecha: "",
  orden: "1",
  usaIndicadoresPlaneamiento: false
};

const initialCopiaForm = {
  nombre: "",
  anioLectivoId: "",
  periodoId: "",
  materiaId: "",
  esPublica: false
};

const CICLOS_EVALUACION = [
  { codigo: "PRIMER_CICLO", nombre: "Primer Ciclo" },
  { codigo: "SEGUNDO_CICLO", nombre: "Segundo Ciclo" },
  { codigo: "TERCER_CICLO", nombre: "Tercer Ciclo" },
  { codigo: "CUARTO_CICLO", nombre: "Cuarto Ciclo" }
];

function normalizeForCompare(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isTruthyDbFlag(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = normalizeForCompare(value);
  return normalized === "1" || normalized === "TRUE" || normalized === "SI" || normalized === "S";
}

function actividadUsaPlaneamiento(item?: EvaluacionActividad | null) {
  if (!item) return false;
  return isTruthyDbFlag(
    item.UsaIndicadoresPlaneamiento
      ?? item.usaIndicadoresPlaneamiento
      ?? item.VinculadoPlaneamiento
  );
}

function getCicloNombre(value: any) {
  const nombre = String(value ?? "").trim();
  return CICLOS_EVALUACION.some((ciclo) => normalizeForCompare(ciclo.nombre) === normalizeForCompare(nombre)) ? nombre : "";
}


function formatDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

function numberOrZero(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EvaluacionParametrizacionPage() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const currentUserId = Number(user?.userId || 0);
  const isSuperAdminRole = roles.some((role) => role === "SUPER_ADMIN");
  const isAdminRole = roles.some((role) => ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"].includes(role));

  const [view, setView] = useState<"plantillas" | "niveles">("plantillas");

  const [instituciones, setInstituciones] = useState<InstitucionOption[]>([]);
  const [selectedInstitucionId, setSelectedInstitucionId] = useState("");
  const [aniosLectivos, setAniosLectivos] = useState<CatalogoItem[]>([]);
  const [periodos, setPeriodos] = useState<CatalogoItem[]>([]);
  const [materias, setMaterias] = useState<CatalogoItem[]>([]);
  const [niveles, setNiveles] = useState<NivelDesempeno[]>([]);

  const [plantillas, setPlantillas] = useState<EvaluacionPlantilla[]>([]);
  const [selectedPlantilla, setSelectedPlantilla] = useState<EvaluacionPlantilla | null>(null);

  const [plantillaForm, setPlantillaForm] = useState(initialPlantillaForm);
  const [nivelForm, setNivelForm] = useState(initialNivelForm);
  const [componenteForm, setComponenteForm] = useState(initialComponenteForm);
  const [actividadForm, setActividadForm] = useState(initialActividadForm);
  const [copiaForm, setCopiaForm] = useState(initialCopiaForm);

  const [editingPlantillaId, setEditingPlantillaId] = useState<number | null>(null);
  const [editingNivelId, setEditingNivelId] = useState<number | null>(null);
  const [editingComponenteId, setEditingComponenteId] = useState<number | null>(null);
  const [editingActividadId, setEditingActividadId] = useState<number | null>(null);

  const [showPlantillaForm, setShowPlantillaForm] = useState(false);
  const [showNivelForm, setShowNivelForm] = useState(false);
  const [showComponenteForm, setShowComponenteForm] = useState(false);
  const [showActividadForm, setShowActividadForm] = useState(false);
  const [showCopiarForm, setShowCopiarForm] = useState(false);

  const [search, setSearch] = useState("");
  const [nivelSearch, setNivelSearch] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [incluirNivelesInactivos, setIncluirNivelesInactivos] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("");
  const [filtroMateria, setFiltroMateria] = useState("");

  const [loading, setLoading] = useState(false);
  const [copyProgress, setCopyProgress] = useState(0);
  const copyProgressTimerRef = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const institutionQueryValue = useMemo(() => {
    if (isSuperAdminRole) return selectedInstitucionId;
    return String(user?.institucionId || "");
  }, [isSuperAdminRole, selectedInstitucionId, user?.institucionId]);

  const periodosFiltrados = useMemo(() => {
    if (!plantillaForm.anioLectivoId) return periodos;
    return periodos.filter((item: any) => String(item.AnioLectivoId) === String(plantillaForm.anioLectivoId));
  }, [periodos, plantillaForm.anioLectivoId]);

  const periodosFiltro = useMemo(() => {
    if (!filtroAnio) return periodos;
    return periodos.filter((item: any) => String(item.AnioLectivoId) === String(filtroAnio));
  }, [periodos, filtroAnio]);

  const cicloMateriaOptions = useMemo(() => {
    return CICLOS_EVALUACION.map((ciclo) => {
      const materia = materias.find((item: any) => normalizeForCompare(item.Nombre) === normalizeForCompare(ciclo.nombre));
      return {
        ...ciclo,
        materiaId: materia?.MateriaId ? String(materia.MateriaId) : "",
        disponible: !!materia?.MateriaId
      };
    });
  }, [materias]);

  const totalComponentes = useMemo(() => {
    return (selectedPlantilla?.Componentes || [])
      .filter((item) => item.Activo)
      .reduce((total, item) => total + numberOrZero(item.Porcentaje), 0);
  }, [selectedPlantilla]);

  const canManageSelectedPlantilla = useMemo(() => {
    if (!selectedPlantilla) return false;
    if (isSuperAdminRole) return true;
    return currentUserId > 0 && Number(selectedPlantilla.UsuarioCreadorId || 0) === currentUserId;
  }, [selectedPlantilla, isSuperAdminRole, currentUserId]);

  const isSelectedPlantillaActiva = useMemo(() => {
    if (!selectedPlantilla) return false;
    const estado = String(selectedPlantilla.Estado || "").trim().toUpperCase();
    return estado === "ACTIVA";
  }, [selectedPlantilla]);

  const canActivateSelectedPlantilla = useMemo(() => {
    if (!selectedPlantilla) return false;
    if (!canManageSelectedPlantilla) return false;
    return !isSelectedPlantillaActiva;
  }, [selectedPlantilla, canManageSelectedPlantilla, isSelectedPlantillaActiva]);

  function canEditPlantilla(item: EvaluacionPlantilla) {
    if (isSuperAdminRole) return true;
    return currentUserId > 0 && Number(item.UsuarioCreadorId || 0) === currentUserId;
  }

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function loadCatalogos() {
    const response = await api.get("/evaluacion/catalogos", {
      params: isSuperAdminRole && selectedInstitucionId
        ? { institucionId: selectedInstitucionId }
        : undefined
    });
    const data = response.data?.data || {};
    setAniosLectivos(data.aniosLectivos || []);
    setPeriodos(data.periodos || []);
    setMaterias(data.materias || []);
    setNiveles(data.nivelesDesempeno || []);
  }

  async function loadPlantillas() {
    const response = await api.get("/evaluacion/plantillas", {
      params: {
        q: search,
        incluirInactivas,
        institucionId: isSuperAdminRole ? selectedInstitucionId || undefined : undefined,
        anioLectivoId: filtroAnio || undefined,
        periodoId: filtroPeriodo || undefined,
        materiaId: filtroMateria || undefined
      }
    });
    setPlantillas(response.data?.data || []);
  }

  async function loadNiveles() {
    const response = await api.get("/evaluacion/niveles-desempeno", {
      params: {
        q: nivelSearch,
        incluirInactivos: incluirNivelesInactivos,
        institucionId: isSuperAdminRole ? selectedInstitucionId || undefined : undefined
      }
    });
    setNiveles(response.data?.data || []);
  }

  async function loadDetallePlantilla(id: number) {
    const response = await api.get(`/evaluacion/plantillas/${id}`);
    setSelectedPlantilla(response.data?.data || null);
  }

  function patchActividadEnPlantilla(actividadId: number, changes: Partial<EvaluacionActividad>) {
    setSelectedPlantilla((current) => {
      if (!current) return current;
      return {
        ...current,
        Componentes: (current.Componentes || []).map((componente) => ({
          ...componente,
          Actividades: (componente.Actividades || []).map((actividad) =>
            Number(actividad.EvaluacionActividadId) === Number(actividadId)
              ? { ...actividad, ...changes }
              : actividad
          )
        }))
      };
    });
  }

  async function refreshAll() {
    if (isSuperAdminRole && !selectedInstitucionId) {
      setAniosLectivos([]);
      setPeriodos([]);
      setMaterias([]);
      setNiveles([]);
      setPlantillas([]);
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      await Promise.all([loadCatalogos(), loadPlantillas(), loadNiveles()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo cargar la parametrizacion de evaluacion"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdminRole) {
      void loadInstituciones();
      return;
    }
    refreshAll();
  }, []);

  useEffect(() => {
    if (!isSuperAdminRole) return;
    if (!selectedInstitucionId) return;
    refreshAll();
  }, [selectedInstitucionId]);

  async function loadInstituciones() {
    try {
      const response = await api.get("/instituciones");
      const data = response.data?.data || [];
      setInstituciones(Array.isArray(data) ? data : []);
      if (!selectedInstitucionId) {
        const first = Array.isArray(data) ? data[0] : null;
        if (first?.InstitucionId) {
          setSelectedInstitucionId(String(first.InstitucionId));
        }
      }
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los colegios"));
    }
  }

  async function handleBuscarPlantillas(e?: FormEvent) {
    e?.preventDefault();
    clearMessages();
    try {
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar las plantillas"));
    }
  }

  async function handleBuscarNiveles(e?: FormEvent) {
    e?.preventDefault();
    clearMessages();
    try {
      await loadNiveles();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los niveles de desempeno"));
    }
  }

  function resetPlantillaForm() {
    setPlantillaForm(initialPlantillaForm);
    setEditingPlantillaId(null);
    setShowPlantillaForm(false);
  }

  function resetNivelForm() {
    setNivelForm(initialNivelForm);
    setEditingNivelId(null);
    setShowNivelForm(false);
  }

  function resetComponenteForm() {
    setComponenteForm(initialComponenteForm);
    setEditingComponenteId(null);
    setShowComponenteForm(false);
  }

  function resetActividadForm() {
    setActividadForm(initialActividadForm);
    setEditingActividadId(null);
    setShowActividadForm(false);
  }

  function resetCopiaForm() {
    if (copyProgressTimerRef.current !== null) {
      window.clearInterval(copyProgressTimerRef.current);
      copyProgressTimerRef.current = null;
    }
    setCopyProgress(0);
    setCopiaForm(initialCopiaForm);
    setShowCopiarForm(false);
  }

  function handleNuevaPlantilla() {
    clearMessages();
    setSelectedPlantilla(null);
    setPlantillaForm({ ...initialPlantillaForm, esPublica: isAdminRole });
    setEditingPlantillaId(null);
    setShowPlantillaForm(true);
  }

  async function handleEditPlantilla(item: EvaluacionPlantilla) {
    if (!canEditPlantilla(item)) {
      setErrorMessage("Solo podes editar plantillas creadas por vos");
      return;
    }
    clearMessages();
    setPlantillaForm({
      nombre: item.Nombre || "",
      anioLectivoId: String(item.AnioLectivoId || ""),
      periodoId: String(item.PeriodoId || ""),
      materiaId: getCicloNombre(item.MateriaNombre || ""),
      decimalesNota: String(item.DecimalesNota ?? 2),
      permitirProfesorEditar: !!item.PermitirProfesorEditar,
      esPublica: !!item.EsPublica
    });
    setEditingPlantillaId(item.EvaluacionPlantillaId);
    setShowPlantillaForm(true);
    setLoading(true);
    try {
      await loadDetallePlantilla(item.EvaluacionPlantillaId);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo cargar el detalle de la plantilla"));
    } finally {
      setLoading(false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSelectPlantilla(item: EvaluacionPlantilla) {
    clearMessages();

    if (selectedPlantilla?.EvaluacionPlantillaId === item.EvaluacionPlantillaId) {
      setSelectedPlantilla(null);
      resetComponenteForm();
      resetActividadForm();
      return;
    }

    await loadDetallePlantilla(item.EvaluacionPlantillaId);
    resetComponenteForm();
    resetActividadForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePlantillaSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearMessages();

    if (isSuperAdminRole && !selectedInstitucionId) {
      setErrorMessage("Seleccioná un colegio antes de guardar la plantilla");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        institucionId: isSuperAdminRole ? Number(selectedInstitucionId) : undefined,
        nombre: plantillaForm.nombre,
        anioLectivoId: Number(plantillaForm.anioLectivoId),
        periodoId: Number(plantillaForm.periodoId),
        materiaId: null,
        cicloEvaluacion: getCicloNombre(plantillaForm.materiaId),
        decimalesNota: Number(plantillaForm.decimalesNota || 2),
        permitirProfesorEditar: plantillaForm.permitirProfesorEditar,
        esPublica: plantillaForm.esPublica
      };

      let response;
      if (editingPlantillaId !== null) {
        response = await api.put(`/evaluacion/plantillas/${editingPlantillaId}`, payload);
        setMessage(response.data?.message || "Plantilla actualizada correctamente");
        await loadDetallePlantilla(editingPlantillaId);
      } else {
        response = await api.post("/evaluacion/plantillas", payload);
        setMessage(response.data?.message || "Plantilla creada correctamente");
        const nueva = response.data?.data;
        if (nueva?.EvaluacionPlantillaId) await loadDetallePlantilla(nueva.EvaluacionPlantillaId);
      }

      resetPlantillaForm();
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar la plantilla"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEliminarPlantilla(id: number) {
    const plantilla = plantillas.find((item) => Number(item.EvaluacionPlantillaId) === Number(id));
    if (plantilla && !canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes eliminar plantillas creadas por vos");
      return;
    }
    if (!window.confirm("Deseas eliminar esta plantilla de evaluacion?")) return;
    setLoading(true);
    clearMessages();
    try {
      const response = await api.delete(`/evaluacion/plantillas/${id}`);
      setMessage(response.data?.message || "Plantilla eliminada correctamente");
      if (selectedPlantilla?.EvaluacionPlantillaId === id) setSelectedPlantilla(null);
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo eliminar la plantilla"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDesactivarPlantilla(id: number) {
    await handleEliminarPlantilla(id);
  }

  async function handleInactivarPlantilla(id: number) {
    const plantilla = plantillas.find((item) => Number(item.EvaluacionPlantillaId) === Number(id))
      || (selectedPlantilla && Number(selectedPlantilla.EvaluacionPlantillaId) === Number(id) ? selectedPlantilla : null);
    if (plantilla && !canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes inactivar plantillas creadas por vos");
      return;
    }
    if (!window.confirm("Deseas inactivar esta plantilla de evaluacion?")) return;
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/plantillas/${id}/inactivar`);
      setMessage(response.data?.message || "Plantilla inactivada correctamente");
      await Promise.all([loadPlantillas(), loadDetallePlantilla(id)]);
      resetPlantillaForm();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo inactivar la plantilla"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivarPlantilla(id: number) {
    const plantilla = plantillas.find((item) => Number(item.EvaluacionPlantillaId) === Number(id));
    if (plantilla && !canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes reactivar plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/plantillas/${id}/reactivar`);
      setMessage(response.data?.message || "Plantilla reactivada correctamente");
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar la plantilla"));
    } finally {
      setLoading(false);
    }
  }

  async function handleActivarPlantilla(id: number) {
    const plantilla = plantillas.find((item) => Number(item.EvaluacionPlantillaId) === Number(id))
      || (selectedPlantilla && Number(selectedPlantilla.EvaluacionPlantillaId) === Number(id) ? selectedPlantilla : null);
    if (plantilla && !canEditPlantilla(plantilla)) {
      setErrorMessage("Solo podes activar plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/plantillas/${id}/activar`);
      setMessage(response.data?.message || "Plantilla activada correctamente");
      await Promise.all([loadPlantillas(), loadDetallePlantilla(id)]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo activar la plantilla"));
    } finally {
      setLoading(false);
    }
  }

  function handleCopiarPlantilla(item: EvaluacionPlantilla) {
    clearMessages();
    setSelectedPlantilla(item);
    setCopiaForm({
      nombre: `${item.Nombre} - copia`,
      anioLectivoId: String(item.AnioLectivoId || ""),
      periodoId: String(item.PeriodoId || ""),
      materiaId: getCicloNombre(item.MateriaNombre || ""),
      esPublica: isAdminRole ? !!item.EsPublica : false
    });
    setShowCopiarForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCopiarSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlantilla) return;
    setLoading(true);
    setCopyProgress(5);
    if (copyProgressTimerRef.current !== null) {
      window.clearInterval(copyProgressTimerRef.current);
      copyProgressTimerRef.current = null;
    }
    copyProgressTimerRef.current = window.setInterval(() => {
      setCopyProgress((prev) => (prev >= 90 ? 90 : prev + 5));
    }, 650);
    clearMessages();
    try {
      const response = await api.post(`/evaluacion/plantillas/${selectedPlantilla.EvaluacionPlantillaId}/copiar`, {
        institucionId: isSuperAdminRole ? Number(selectedInstitucionId || selectedPlantilla.InstitucionId) : undefined,
        nombre: copiaForm.nombre,
        anioLectivoId: Number(copiaForm.anioLectivoId),
        periodoId: Number(copiaForm.periodoId),
        materiaId: null,
        cicloEvaluacion: getCicloNombre(copiaForm.materiaId),
        esPublica: copiaForm.esPublica
      });
      setCopyProgress(100);
      setMessage(response.data?.message || "Plantilla copiada correctamente");
      resetCopiaForm();
      const nueva = response.data?.data;
      await loadPlantillas();
      if (nueva?.EvaluacionPlantillaId) await loadDetallePlantilla(nueva.EvaluacionPlantillaId);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo copiar la plantilla"));
    } finally {
      if (copyProgressTimerRef.current !== null) {
        window.clearInterval(copyProgressTimerRef.current);
        copyProgressTimerRef.current = null;
      }
      setLoading(false);
    }
  }

  function handleNuevoNivel() {
    clearMessages();
    setNivelForm(initialNivelForm);
    setEditingNivelId(null);
    setShowNivelForm(true);
  }

  function handleEditNivel(item: NivelDesempeno) {
    clearMessages();
    setNivelForm({ descripcion: item.Descripcion, valor: String(item.Valor) });
    setEditingNivelId(item.NivelDesempenoId);
    setShowNivelForm(true);
  }

  async function handleNivelSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const payload = { descripcion: nivelForm.descripcion, valor: Number(nivelForm.valor) };
      const response = editingNivelId !== null
        ? await api.put(`/evaluacion/niveles-desempeno/${editingNivelId}`, payload)
        : await api.post("/evaluacion/niveles-desempeno", payload);
      setMessage(response.data?.message || "Nivel de desempeno guardado correctamente");
      resetNivelForm();
      await Promise.all([loadNiveles(), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar el nivel de desempeno"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDesactivarNivel(id: number) {
    if (!window.confirm("Deseas desactivar este nivel de desempeno?")) return;
    setLoading(true);
    clearMessages();
    try {
      const response = await api.delete(`/evaluacion/niveles-desempeno/${id}`);
      setMessage(response.data?.message || "Nivel desactivado correctamente");
      await loadNiveles();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo desactivar el nivel"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivarNivel(id: number) {
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/niveles-desempeno/${id}/reactivar`);
      setMessage(response.data?.message || "Nivel reactivado correctamente");
      await loadNiveles();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar el nivel"));
    } finally {
      setLoading(false);
    }
  }

  function handleNuevoComponente() {
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes agregar componentes en plantillas creadas por vos");
      return;
    }
    if (isSelectedPlantillaActiva) {
      setErrorMessage("No se pueden agregar rubros cuando la plantilla esta activa");
      return;
    }
    clearMessages();
    setComponenteForm(initialComponenteForm);
    setEditingComponenteId(null);
    setShowComponenteForm(true);
  }

  function handleEditComponente(item: EvaluacionComponente) {
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes editar componentes en plantillas creadas por vos");
      return;
    }
    clearMessages();
    setComponenteForm({
      descripcion: item.Descripcion,
      porcentaje: String(item.Porcentaje),
      orden: String(item.Orden || 1),
      permitePlaneamiento: Boolean(item.PermitePlaneamiento),
      tipoSeguimiento: item.TipoSeguimiento || ""
    });
    setEditingComponenteId(item.EvaluacionComponenteId);
    setShowComponenteForm(true);
  }

  async function handleComponenteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar componentes de plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const payload = {
        descripcion: componenteForm.descripcion,
        porcentaje: Number(componenteForm.porcentaje),
        orden: Number(componenteForm.orden || 1),
        permitePlaneamiento: componenteForm.permitePlaneamiento,
        tipoSeguimiento: componenteForm.permitePlaneamiento ? componenteForm.tipoSeguimiento : null
      };
      const response = editingComponenteId !== null
        ? await api.put(`/evaluacion/componentes/${editingComponenteId}`, payload)
        : await api.post(`/evaluacion/plantillas/${selectedPlantilla.EvaluacionPlantillaId}/componentes`, payload);
      setMessage(response.data?.message || "Componente guardado correctamente");
      resetComponenteForm();
      await Promise.all([loadDetallePlantilla(selectedPlantilla.EvaluacionPlantillaId), loadPlantillas()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar el componente"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDesactivarComponente(id: number) {
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar componentes de plantillas creadas por vos");
      return;
    }
    if (!window.confirm("Deseas eliminar este rubro de calificacion?")) return;
    setLoading(true);
    clearMessages();
    try {
      const response = await api.delete(`/evaluacion/componentes/${id}`);
      setMessage(response.data?.message || "Rubro de calificacion eliminado correctamente");
      await Promise.all([loadDetallePlantilla(selectedPlantilla.EvaluacionPlantillaId), loadPlantillas()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo eliminar el rubro de calificacion"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivarComponente(id: number) {
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar componentes de plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/componentes/${id}/reactivar`);
      setMessage(response.data?.message || "Componente reactivado correctamente");
      await Promise.all([loadDetallePlantilla(selectedPlantilla.EvaluacionPlantillaId), loadPlantillas()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar el componente"));
    } finally {
      setLoading(false);
    }
  }

  function handleNuevaActividad(componente: EvaluacionComponente) {
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes agregar actividades en plantillas creadas por vos");
      return;
    }
    if (Boolean(componente.PermitePlaneamiento)) {
      setErrorMessage("Este componente usa planeamiento a nivel componente. No permite actividades.");
      return;
    }
    clearMessages();
    setActividadForm({ ...initialActividadForm, componenteId: String(componente.EvaluacionComponenteId) });
    setEditingActividadId(null);
    setShowActividadForm(true);
  }

  function handleEditActividad(item: EvaluacionActividad) {
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes editar actividades en plantillas creadas por vos");
      return;
    }
    clearMessages();
    setActividadForm({
      componenteId: String(item.EvaluacionComponenteId),
      descripcion: item.Descripcion,
      porcentaje: String(item.Porcentaje),
      fecha: formatDate(item.Fecha),
      orden: String(item.Orden || 1),
      usaIndicadoresPlaneamiento: actividadUsaPlaneamiento(item)
    });
    setEditingActividadId(item.EvaluacionActividadId);
    setShowActividadForm(true);
  }

  async function handleActividadSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar actividades de plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const payload = {
        descripcion: actividadForm.descripcion,
        porcentaje: Number(actividadForm.porcentaje),
        fecha: actividadForm.fecha || null,
        orden: Number(actividadForm.orden || 1),
        usaIndicadoresPlaneamiento: Boolean(actividadForm.usaIndicadoresPlaneamiento)
      };
      const response = editingActividadId !== null
        ? await api.put(`/evaluacion/actividades/${editingActividadId}`, payload)
        : await api.post(`/evaluacion/componentes/${actividadForm.componenteId}/actividades`, payload);
      setMessage(response.data?.message || "Actividad evaluativa guardada correctamente");
      if (editingActividadId !== null) {
        patchActividadEnPlantilla(editingActividadId, {
          Descripcion: payload.descripcion,
          Porcentaje: payload.porcentaje,
          Fecha: payload.fecha,
          Orden: payload.orden,
          UsaIndicadoresPlaneamiento: payload.usaIndicadoresPlaneamiento
        });
      } else if (response.data?.data) {
        const nuevaActividad = response.data.data;
        setSelectedPlantilla((current) => {
          if (!current) return current;
          return {
            ...current,
            Componentes: (current.Componentes || []).map((componente) =>
              Number(componente.EvaluacionComponenteId) === Number(actividadForm.componenteId)
                ? {
                    ...componente,
                    Actividades: [...(componente.Actividades || []), nuevaActividad]
                      .sort((a, b) => Number(a.Orden || 0) - Number(b.Orden || 0))
                  }
                : componente
            )
          };
        });
      }
      resetActividadForm();
      await loadPlantillas();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar la actividad evaluativa"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDesactivarActividad(id: number) {
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar actividades de plantillas creadas por vos");
      return;
    }
    if (!window.confirm("Deseas eliminar esta actividad evaluativa?")) return;
    setLoading(true);
    clearMessages();
    try {
      const response = await api.delete(`/evaluacion/actividades/${id}`);
      setMessage(response.data?.message || "Actividad eliminada correctamente");
      await loadDetallePlantilla(selectedPlantilla.EvaluacionPlantillaId);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo eliminar la actividad"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivarActividad(id: number) {
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar actividades de plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const response = await api.patch(`/evaluacion/actividades/${id}/reactivar`);
      setMessage(response.data?.message || "Actividad reactivada correctamente");
      await loadDetallePlantilla(selectedPlantilla.EvaluacionPlantillaId);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar la actividad"));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActividadIndicadores(item: EvaluacionActividad, usar: boolean) {
    if (!selectedPlantilla) return;
    if (!canManageSelectedPlantilla) {
      setErrorMessage("Solo podes modificar actividades de plantillas creadas por vos");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const payload = {
        descripcion: item.Descripcion,
        porcentaje: Number(item.Porcentaje),
        fecha: item.Fecha || null,
        orden: Number(item.Orden || 1),
        usaIndicadoresPlaneamiento: usar
      };
      const response = await api.put(`/evaluacion/actividades/${item.EvaluacionActividadId}`, payload);
      setMessage(response.data?.message || "Actividad actualizada correctamente");
      patchActividadEnPlantilla(item.EvaluacionActividadId, {
        Descripcion: payload.descripcion,
        Porcentaje: payload.porcentaje,
        Fecha: payload.fecha,
        Orden: payload.orden,
        UsaIndicadoresPlaneamiento: usar
      });
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo actualizar la actividad"));
    } finally {
      setLoading(false);
    }
  }

  function renderEstadoBadge(estado: string, activo: boolean) {
    const background = !activo ? "#f3f4f6" : estado === "ACTIVA" ? "#dcfce7" : "#fef3c7";
    const color = !activo ? "#374151" : estado === "ACTIVA" ? "#166534" : "#92400e";
    return (
      <span style={{ background, color, borderRadius: "999px", padding: "4px 8px", fontSize: "12px", fontWeight: 700 }}>
        {!activo ? "Inactiva" : estado}
      </span>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Parametrizacion de evaluacion</h3>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Defini plantillas por ano, periodo y ciclo. La suma valida se calcula con el porcentaje de los componentes hasta completar el 100%. Las actividades son opcionales.
        </p>
        <div style={{ background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: "12px", padding: "10px 12px", color: "#0f172a", marginBottom: "10px" }}>
          <strong>Paso a paso (Evaluaciones)</strong>
          <ol style={{ margin: "8px 0 0 18px", padding: 0 }}>
            <li>Creá o seleccioná una plantilla.</li>
            <li>Definí los rubros y validá que sumen 100%.</li>
            <li>Agregá actividades por rubro con su porcentaje.</li>
            <li>Activá la plantilla cuando esté lista para usar en Gestión del Profe.</li>
          </ol>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="primary-btn" onClick={handleNuevaPlantilla}>
            Agregar plantilla
          </button>
          <button type="button" onClick={refreshAll} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
            Actualizar
          </button>
        </div>
      </section>

      {message && (
        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
          {message}
        </div>
      )}

      {errorMessage && (
        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {errorMessage}
        </div>
      )}

      {isSuperAdminRole ? (
        <section className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ marginTop: 0 }}>Colegio</h3>
          <div className="form">
            <label>
              Seleccioná el colegio para cargar sus plantillas y catálogos
              <select
                value={selectedInstitucionId}
                onChange={(e) => setSelectedInstitucionId(e.target.value)}
                required
              >
                <option value="">Seleccione</option>
                {instituciones.map((item) => (
                  <option key={item.InstitucionId} value={item.InstitucionId}>
                    {item.NombreComercial || item.Nombre}
                  </option>
                ))}
              </select>
            </label>
            {!selectedInstitucionId && (
              <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}>
                Elegí un colegio para ver año lectivo, período y materias disponibles.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {loading && <div style={{ opacity: 0.8 }}>Procesando...</div>}

      {view === "niveles" && (
        <div className={showNivelForm ? "two-col" : "stack"}>
          <section className="card" style={{ marginBottom: 0 }}>
            {showNivelForm ? (
              <>
                <h3>{editingNivelId !== null ? "Editar nivel de desempeno" : "Crear nivel de desempeno"}</h3>
                <form className="form" onSubmit={handleNivelSubmit}>
                  <label>
                    Descripcion
                    <input value={nivelForm.descripcion} onChange={(e) => setNivelForm({ ...nivelForm, descripcion: e.target.value })} placeholder="Ejemplo: Inicial" required />
                  </label>
                  <label>
                    Valor
                    <input type="number" step="0.01" value={nivelForm.valor} onChange={(e) => setNivelForm({ ...nivelForm, valor: e.target.value })} placeholder="Ejemplo: 1" required />
                  </label>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button className="primary-btn" disabled={loading}>{editingNivelId !== null ? "Actualizar" : "Guardar"}</button>
                    <button type="button" onClick={resetNivelForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Minimizar</button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3>Niveles de desempeno</h3>
                <button type="button" className="primary-btn" onClick={handleNuevoNivel}>Agregar nivel</button>
              </>
            )}
          </section>

          <section className="card" style={{ marginBottom: 0 }}>
            <h3>Listado de niveles</h3>
            <form onSubmit={handleBuscarNiveles} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
              <input placeholder="Buscar nivel" value={nivelSearch} onChange={(e) => setNivelSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
              <button className="primary-btn" type="submit">Buscar</button>
              <button type="button" onClick={() => { setNivelSearch(""); loadNiveles(); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Limpiar</button>
            </form>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <input type="checkbox" checked={incluirNivelesInactivos} onChange={(e) => setIncluirNivelesInactivos(e.target.checked)} />
              Incluir niveles inactivos
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Descripcion</th><th>Valor</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {niveles.map((item) => (
                    <tr key={item.NivelDesempenoId}>
                      <td>{item.NivelDesempenoId}</td>
                      <td>{item.Descripcion}</td>
                      <td>{item.Valor}</td>
                      <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button type="button" onClick={() => handleEditNivel(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                          {item.Activo ? (
                            <button type="button" onClick={() => handleDesactivarNivel(item.NivelDesempenoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                          ) : (
                            <button type="button" onClick={() => handleReactivarNivel(item.NivelDesempenoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!niveles.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>No hay niveles registrados</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {(
        <>
          <div className={showPlantillaForm || showCopiarForm ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {showPlantillaForm ? (
                <>
                  <h3>{editingPlantillaId !== null ? "Editar plantilla" : "Crear plantilla"}</h3>
                  <form className="form" onSubmit={handlePlantillaSubmit}>
                    <label>
                      Nombre de plantilla
                      <input value={plantillaForm.nombre} onChange={(e) => setPlantillaForm({ ...plantillaForm, nombre: e.target.value })} placeholder="Ejemplo: Tercer ciclo - I Trimestre 2026" required />
                    </label>
                    <label>
                      Ano lectivo
                      <select value={plantillaForm.anioLectivoId} onChange={(e) => setPlantillaForm({ ...plantillaForm, anioLectivoId: e.target.value, periodoId: "" })} required>
                        <option value="">Seleccione</option>
                        {aniosLectivos.map((item: any) => <option key={item.AnioLectivoId} value={item.AnioLectivoId}>{item.Nombre}</option>)}
                      </select>
                    </label>
                    <label>
                      Periodo
                      <select value={plantillaForm.periodoId} onChange={(e) => setPlantillaForm({ ...plantillaForm, periodoId: e.target.value })} required>
                        <option value="">Seleccione</option>
                        {periodosFiltrados.map((item: any) => <option key={item.PeriodoId} value={item.PeriodoId}>{item.AnioNombre ? `${item.AnioNombre} - ` : ""}{item.Nombre}</option>)}
                      </select>
                    </label>
                    <label>
                      Ciclo
                      <select value={plantillaForm.materiaId} onChange={(e) => setPlantillaForm({ ...plantillaForm, materiaId: e.target.value })} required>
                        <option value="">Seleccione</option>
                        {CICLOS_EVALUACION.map((item) => (
                          <option key={item.codigo} value={item.nombre}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Decimales permitidos para notas
                      <select value={plantillaForm.decimalesNota} onChange={(e) => setPlantillaForm({ ...plantillaForm, decimalesNota: e.target.value })}>
                        <option value="0">0 decimales</option>
                        <option value="1">1 decimal</option>
                        <option value="2">2 decimales</option>
                        <option value="3">3 decimales</option>
                        <option value="4">4 decimales</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="checkbox" checked={plantillaForm.permitirProfesorEditar} onChange={(e) => setPlantillaForm({ ...plantillaForm, permitirProfesorEditar: e.target.checked })} />
                      Permitir que el profesor cambie los valores de componentes y actividades
                    </label>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="checkbox" checked={plantillaForm.esPublica} onChange={(e) => setPlantillaForm({ ...plantillaForm, esPublica: e.target.checked })} />
                      Plantilla Privada (si se marca, quedara Publica)
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loading}>{editingPlantillaId !== null ? "Actualizar plantilla" : "Guardar plantilla"}</button>
                      <button type="button" onClick={resetPlantillaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
                    </div>
                  </form>
                </>
              ) : showCopiarForm && selectedPlantilla ? (
                <>
                  <h3>Copiar plantilla</h3>
                  <form className="form" onSubmit={handleCopiarSubmit}>
                    <label>
                      Nuevo nombre
                      <input value={copiaForm.nombre} onChange={(e) => setCopiaForm({ ...copiaForm, nombre: e.target.value })} required />
                    </label>
                    <label>
                      Ano lectivo destino
                      <select value={copiaForm.anioLectivoId} onChange={(e) => setCopiaForm({ ...copiaForm, anioLectivoId: e.target.value, periodoId: "" })} required>
                        <option value="">Seleccione</option>
                        {aniosLectivos.map((item: any) => <option key={item.AnioLectivoId} value={item.AnioLectivoId}>{item.Nombre}</option>)}
                      </select>
                    </label>
                    <label>
                      Periodo destino
                      <select value={copiaForm.periodoId} onChange={(e) => setCopiaForm({ ...copiaForm, periodoId: e.target.value })} required>
                        <option value="">Seleccione</option>
                        {periodos.filter((item: any) => !copiaForm.anioLectivoId || String(item.AnioLectivoId) === String(copiaForm.anioLectivoId)).map((item: any) => <option key={item.PeriodoId} value={item.PeriodoId}>{item.AnioNombre ? `${item.AnioNombre} - ` : ""}{item.Nombre}</option>)}
                      </select>
                    </label>
                    <label>
                      Ciclo destino
                      <select value={copiaForm.materiaId} onChange={(e) => setCopiaForm({ ...copiaForm, materiaId: e.target.value })} required>
                        <option value="">Seleccione</option>
                        {CICLOS_EVALUACION.map((item) => (
                          <option key={item.codigo} value={item.nombre}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="checkbox" checked={copiaForm.esPublica} onChange={(e) => setCopiaForm({ ...copiaForm, esPublica: e.target.checked })} />
                      Hacer publica la copia
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loading}>{loading ? "Copiando plantilla..." : "Copiar plantilla"}</button>
                      <button type="button" onClick={resetCopiaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
                    </div>
                    {loading ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                          <div style={{ width: `${copyProgress}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)", transition: "width 280ms ease" }} />
                        </div>
                        <small style={{ color: "#475569" }}>{copyProgress}% completado</small>
                      </div>
                    ) : null}
                  </form>
                </>
              ) : (
                <>
                  <h3>Plantillas de evaluacion</h3>
                  <p style={{ margin: 0, opacity: 0.75 }}>El formulario esta minimizado. Usa el boton Agregar plantilla para abrirlo.</p>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Buscar plantillas</h3>
              <form onSubmit={handleBuscarPlantillas} className="form">
                <input placeholder="Buscar por nombre, ciclo o periodo" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  <select value={filtroAnio} onChange={(e) => { setFiltroAnio(e.target.value); setFiltroPeriodo(""); }}>
                    <option value="">Todos los anos</option>
                    {aniosLectivos.map((item: any) => <option key={item.AnioLectivoId} value={item.AnioLectivoId}>{item.Nombre}</option>)}
                  </select>
                  <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
                    <option value="">Todos los periodos</option>
                    {periodosFiltro.map((item: any) => <option key={item.PeriodoId} value={item.PeriodoId}>{item.AnioNombre ? `${item.AnioNombre} - ` : ""}{item.Nombre}</option>)}
                  </select>
                  <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)}>
                    <option value="">Todos los ciclos</option>
                    {cicloMateriaOptions.map((item) => (
                      <option key={item.codigo} value={item.materiaId} disabled={!item.disponible}>
                        {item.nombre}{!item.disponible ? " - debe crearse en Materias" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
                  Incluir plantillas inactivas
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" type="submit">Buscar</button>
                  <button type="button" onClick={() => { setSearch(""); setFiltroAnio(""); setFiltroPeriodo(""); setFiltroMateria(""); loadPlantillas(); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Limpiar</button>
                </div>
              </form>
            </section>
          </div>

          <section className="card">
            <h3>Listado de plantillas</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Nombre</th><th>Ano</th><th>Periodo</th><th>Ciclo</th><th>Visibilidad</th><th>Total</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {plantillas.map((item) => {
                    const canEdit = canEditPlantilla(item);
                    return (
                      <tr key={item.EvaluacionPlantillaId}>
                        <td>{item.EvaluacionPlantillaId}</td>
                        <td style={{ fontWeight: 600, color: "#e5e7eb" }}>{item.Nombre || ""}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{item.PeriodoNombre || ""}</td>
                        <td>{item.MateriaNombre || ""}</td>
                        <td>{item.EsPublica ? "Publica" : "Privada"}</td>
                        <td>{Number(item.TotalComponentes || 0).toFixed(2)}%</td>
                        <td>{renderEstadoBadge(item.Estado, item.Activo)}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleSelectPlantilla(item)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>{selectedPlantilla?.EvaluacionPlantillaId === item.EvaluacionPlantillaId ? "Minimizar" : "Ver"}</button>
                            <button type="button" onClick={() => handleEditPlantilla(item)} disabled={!canEdit} title={!canEdit ? "Solo podes editar plantillas creadas por vos" : undefined} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit ? 1 : 0.45 }}>Editar</button>
                            <button type="button" onClick={() => handleCopiarPlantilla(item)} style={{ border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#6d28d9", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Copiar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleEliminarPlantilla(item.EvaluacionPlantillaId)} disabled={!canEdit} title={!canEdit ? "Solo podes eliminar plantillas creadas por vos" : undefined} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit ? 1 : 0.45 }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivarPlantilla(item.EvaluacionPlantillaId)} disabled={!canEdit} title={!canEdit ? "Solo podes reactivar plantillas creadas por vos" : undefined} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit ? 1 : 0.45 }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!plantillas.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>No hay plantillas registradas</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {selectedPlantilla && (
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <h3 style={{ marginBottom: "4px" }}>{selectedPlantilla.Nombre}</h3>
                  <div style={{ opacity: 0.8 }}>
                    {selectedPlantilla.AnioNombre} | {selectedPlantilla.PeriodoNombre} | {selectedPlantilla.MateriaNombre}
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    Total componentes: <strong>{totalComponentes.toFixed(2)}%</strong>
                    {Number(totalComponentes.toFixed(2)) !== 100 && (
                      <span style={{ marginLeft: "8px", color: "#92400e" }}>Debe sumar 100% para activar</span>
                    )}
                  </div>
                  <div style={{ marginTop: "8px", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", background: "#f8fafc", fontSize: "13px", color: "#475569" }}>
                    Cotidiano y tareas se califican con niveles Inicial = 1, Intermedio = 2 y Avanzado = 3. La nota del componente se calcula como puntos obtenidos entre puntos maximos y luego se aplica el porcentaje del componente. Asistencia se calcula desde la toma diaria usando la escala del Articulo 37.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {renderEstadoBadge(selectedPlantilla.Estado, selectedPlantilla.Activo)}
                  <button type="button" onClick={() => { setSelectedPlantilla(null); resetComponenteForm(); resetActividadForm(); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Minimizar</button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleActivarPlantilla(selectedPlantilla.EvaluacionPlantillaId)}
                    disabled={!canActivateSelectedPlantilla}
                    style={!canActivateSelectedPlantilla ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                    title={
                      !canManageSelectedPlantilla
                        ? "Solo podes activar plantillas creadas por vos"
                        : (!canActivateSelectedPlantilla ? "La plantilla ya esta activa" : undefined)
                    }
                  >
                    Activar plantilla
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInactivarPlantilla(selectedPlantilla.EvaluacionPlantillaId)}
                    disabled={!canManageSelectedPlantilla || !Boolean(selectedPlantilla.Activo)}
                    title={
                      !canManageSelectedPlantilla
                        ? "Solo podes inactivar plantillas creadas por vos"
                        : (!selectedPlantilla.Activo ? "La plantilla ya está inactiva" : undefined)
                    }
                    style={{
                      border: "1px solid #fca5a5",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      background: "#fff1f2",
                      color: "#9f1239",
                      cursor: canManageSelectedPlantilla && Boolean(selectedPlantilla.Activo) ? "pointer" : "not-allowed",
                      opacity: canManageSelectedPlantilla && Boolean(selectedPlantilla.Activo) ? 1 : 0.45
                    }}
                  >
                    Inactivar plantilla
                  </button>
                  <button type="button" onClick={handleNuevoComponente} disabled={!canManageSelectedPlantilla || isSelectedPlantillaActiva} title={!canManageSelectedPlantilla ? "Solo podes agregar rubros de calificacion en plantillas creadas por vos" : (isSelectedPlantillaActiva ? "La plantilla activa no permite agregar rubros" : undefined)} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: canManageSelectedPlantilla && !isSelectedPlantillaActiva ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla && !isSelectedPlantillaActiva ? 1 : 0.45 }}>Agregar Rubro de Calificacion</button>
                </div>
              </div>

              {showComponenteForm && (
                <form className="form" onSubmit={handleComponenteSubmit} style={{ marginTop: "16px", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                  <h4 style={{ marginTop: 0 }}>{editingComponenteId !== null ? "Editar Rubro de Calificacion" : "Crear Rubro de Calificacion"}</h4>
                  <label>
                    Rubro de Calificacion
                    <input value={componenteForm.descripcion} onChange={(e) => setComponenteForm({ ...componenteForm, descripcion: e.target.value })} placeholder="Ejemplo: Examenes" required />
                  </label>
                  <label>
                    Porcentaje dentro de la nota final
                    <input type="number" min="0" max="100" step="0.01" value={componenteForm.porcentaje} onChange={(e) => setComponenteForm({ ...componenteForm, porcentaje: e.target.value })} required />
                  </label>
                  <label>
                    Orden
                    <input type="number" min="1" value={componenteForm.orden} onChange={(e) => setComponenteForm({ ...componenteForm, orden: e.target.value })} />
                  </label>
                  <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={componenteForm.permitePlaneamiento}
                      onChange={(e) => setComponenteForm({
                        ...componenteForm,
                        permitePlaneamiento: e.target.checked,
                        tipoSeguimiento: e.target.checked ? componenteForm.tipoSeguimiento : ""
                      })}
                    />
                    Permitir calculo automatico desde seguimiento
                  </label>
                  {componenteForm.permitePlaneamiento && (
                    <label>
                      Seguimiento relacionado
                      <select
                        value={componenteForm.tipoSeguimiento}
                        onChange={(e) => setComponenteForm({ ...componenteForm, tipoSeguimiento: e.target.value })}
                        required
                      >
                        <option value="">Seleccione</option>
                        <option value="Cotidiano">Trabajo cotidiano</option>
                        <option value="Tareas">Tareas</option>
                        <option value="Asistencia">Asistencia diaria</option>
                      </select>
                    </label>
                  )}
                  <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e5e7eb", fontSize: "13px", color: "#475569" }}>
                    Si esta opcion queda activa, el componente se calculara desde el seguimiento seleccionado: Trabajo cotidiano, Tareas o Asistencia diaria. Si no esta activa, solo se evaluara con los componentes y actividades configurados manualmente.
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button className="primary-btn" disabled={loading}>{editingComponenteId !== null ? "Actualizar Rubro de Calificacion" : "Guardar Rubro de Calificacion"}</button>
                    <button type="button" onClick={resetComponenteForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
                  </div>
                </form>
              )}

              {showActividadForm && (
                <form className="form" onSubmit={handleActividadSubmit} style={{ marginTop: "16px", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                  <h4 style={{ marginTop: 0 }}>{editingActividadId !== null ? "Editar actividad evaluativa" : "Crear actividad evaluativa"}</h4>
                  <label>
                    Componente
                    <select value={actividadForm.componenteId} onChange={(e) => setActividadForm({ ...actividadForm, componenteId: e.target.value })} required>
                      <option value="">Seleccione</option>
                      {(selectedPlantilla.Componentes || []).map((item) => <option key={item.EvaluacionComponenteId} value={item.EvaluacionComponenteId}>{item.Descripcion}</option>)}
                    </select>
                  </label>
                  <label>
                    Descripcion
                    <input value={actividadForm.descripcion} onChange={(e) => setActividadForm({ ...actividadForm, descripcion: e.target.value })} placeholder="Ejemplo: Examen 1" required />
                  </label>
                  <label>
                    Porcentaje dentro del componente
                    <input type="number" min="0" max="100" step="0.01" value={actividadForm.porcentaje} onChange={(e) => setActividadForm({ ...actividadForm, porcentaje: e.target.value })} required />
                  </label>
                  <label>
                    Fecha
                    <input type="date" value={actividadForm.fecha} onChange={(e) => setActividadForm({ ...actividadForm, fecha: e.target.value })} />
                  </label>
                  <label>
                    Orden
                    <input type="number" min="1" value={actividadForm.orden} onChange={(e) => setActividadForm({ ...actividadForm, orden: e.target.value })} />
                  </label>
                  <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(actividadForm.usaIndicadoresPlaneamiento)}
                      onChange={(e) => setActividadForm({ ...actividadForm, usaIndicadoresPlaneamiento: e.target.checked })}
                    />
                    Agregar indicadores desde planeamiento para esta actividad
                  </label>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button className="primary-btn" disabled={loading}>{editingActividadId !== null ? "Actualizar actividad" : "Guardar actividad"}</button>
                    <button type="button" onClick={resetActividadForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
                  </div>
                </form>
              )}

              <div className="stack" style={{ marginTop: "16px" }}>
                {(selectedPlantilla.Componentes || []).map((componente) => {
                  const totalActividades = (componente.Actividades || [])
                    .filter((actividad) => actividad.Activo)
                    .reduce((total, actividad) => total + numberOrZero(actividad.Porcentaje), 0);
                  const pesoReal = numberOrZero(componente.Porcentaje);

                  return (
                    <div key={componente.EvaluacionComponenteId} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                        <div>
                          <h4 style={{ margin: "0 0 4px" }}>{componente.Descripcion}</h4>
                          <div style={{ opacity: 0.8 }}>
                            Peso en nota final: <strong>{Number(componente.Porcentaje).toFixed(2)}%</strong> | Actividades: <strong>{totalActividades.toFixed(2)}%</strong>
                            {componente.PermitePlaneamiento && <span style={{ color: "#166534" }}> | {componente.TipoSeguimiento === "Asistencia" ? "Calcula desde asistencia diaria" : `Usa indicadores de ${componente.TipoSeguimiento === "Tareas" ? "tareas" : "trabajo cotidiano"}`}</span>}
                            {!componente.PermitePlaneamiento && Number(totalActividades.toFixed(2)) > 100 && <span style={{ color: "#b91c1c", fontWeight: 700 }}> | Excede 100% (ajustá actividades)</span>}
                            {!componente.PermitePlaneamiento && Number(totalActividades.toFixed(2)) !== 100 && <span style={{ color: "#64748b" }}> | Actividades opcionales</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleNuevaActividad(componente)}
                            disabled={!canManageSelectedPlantilla || Boolean(componente.PermitePlaneamiento)}
                            title={
                              !canManageSelectedPlantilla
                                ? "Solo podes agregar actividades en plantillas creadas por vos"
                                : (Boolean(componente.PermitePlaneamiento) ? "Este componente usa planeamiento a nivel componente y no permite actividades" : undefined)
                            }
                            style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla && !Boolean(componente.PermitePlaneamiento) ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla && !Boolean(componente.PermitePlaneamiento) ? 1 : 0.45 }}
                          >
                            Agregar actividad
                          </button>
                          <button type="button" onClick={() => handleEditComponente(componente)} disabled={!canManageSelectedPlantilla} title={!canManageSelectedPlantilla ? "Solo podes editar componentes en plantillas creadas por vos" : undefined} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla ? 1 : 0.45 }}>Editar</button>
                          <button type="button" onClick={() => handleDesactivarComponente(componente.EvaluacionComponenteId)} disabled={!canManageSelectedPlantilla} title={!canManageSelectedPlantilla ? "Solo podes eliminar rubros de calificacion en plantillas creadas por vos" : undefined} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla ? 1 : 0.45 }}>Eliminar</button>
                        </div>
                      </div>

                      <div className="table-wrap" style={{ marginTop: "10px" }}>
                        <table>
                          <thead>
                            <tr><th>Actividad</th><th>% del Rubro de Calificacion</th><th>% real de nota</th><th>Indicadores</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>
                          </thead>
                          <tbody>
                            {(componente.Actividades || []).map((actividad) => {
                              const porcentajeReal = pesoReal * numberOrZero(actividad.Porcentaje) / 100;
                              const estaVinculadaPlaneamiento = actividadUsaPlaneamiento(actividad);
                              return (
                                <tr key={actividad.EvaluacionActividadId}>
                                  <td>{actividad.Descripcion}</td>
                                  <td>{Number(actividad.Porcentaje).toFixed(2)}%</td>
                                  <td>{porcentajeReal.toFixed(2)}%</td>
                                  <td>{estaVinculadaPlaneamiento ? "Vinculado a Planeamiento" : "Manual"}</td>
                                  <td>{formatDate(actividad.Fecha)}</td>
                                  <td>{actividad.Activo ? "Activo" : "Inactivo"}</td>
                                  <td>
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      {estaVinculadaPlaneamiento ? (
                                        <button
                                          type="button"
                                          disabled
                                          style={{ border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#475569", borderRadius: "8px", padding: "6px 10px", cursor: "not-allowed", opacity: 0.75 }}
                                        >
                                          Vinculado a Planeamiento
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleActividadIndicadores(actividad, true)}
                                          disabled={!canManageSelectedPlantilla}
                                          title={!canManageSelectedPlantilla ? "Solo podes modificar actividades en plantillas creadas por vos" : undefined}
                                          style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla ? 1 : 0.45 }}
                                        >
                                          Vincular a Planeamiento
                                        </button>
                                      )}
                                      <button type="button" onClick={() => handleEditActividad(actividad)} disabled={!canManageSelectedPlantilla} title={!canManageSelectedPlantilla ? "Solo podes editar actividades en plantillas creadas por vos" : undefined} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla ? 1 : 0.45 }}>Editar</button>
                                      <button type="button" onClick={() => handleDesactivarActividad(actividad.EvaluacionActividadId)} disabled={!canManageSelectedPlantilla} title={!canManageSelectedPlantilla ? "Solo podes eliminar actividades en plantillas creadas por vos" : undefined} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: canManageSelectedPlantilla ? "pointer" : "not-allowed", opacity: canManageSelectedPlantilla ? 1 : 0.45 }}>Eliminar</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!componente.Actividades?.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>Este Rubro de Calificacion no tiene actividades</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {!selectedPlantilla.Componentes?.length && <div style={{ opacity: 0.8 }}>Esta plantilla todavia no tiene componentes.</div>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}













