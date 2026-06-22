import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type GrupoAsignado = {
  InstitucionId?: number;
  InstitucionNombre?: string;
  GrupoId: number;
  MateriaId: number;
  AnioLectivoId: number;
  PeriodoId: number;
  GrupoNombre: string;
  MateriaNombre: string;
  AnioNombre: string;
  PeriodoNombre: string;
  ProfesorNombre?: string;
  ProfesorPrimerApellido?: string;
  ProfesorSegundoApellido?: string;
};

type InstitucionOption = {
  InstitucionId: number;
  InstitucionNombre: string;
};

type GradoOption = {
  Grado: string;
};

type SeccionOption = {
  GrupoId: number;
  GrupoNombre: string;
};

type ProfesorOption = {
  ProfesorId: number;
  ProfesorNombre: string;
};

type EstructuraEval360 = {
  estructura?: {
    EstructuraGrupoId: number;
    PlantillaBaseId?: number | null;
    PlantillaBaseNombre?: string | null;
  } | null;
};

type ActionResult = {
  message?: string;
  estructuraGrupoId?: number;
  actividadesBorradas?: number;
  seguimientosBorrados?: number;
  notasBorradas?: number;
  ajustesBorrados?: number;
  asistenciasBorradas?: number;
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)"
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "11px 12px",
  background: "#fff",
  color: "#0f172a"
};

function getData(response: any) {
  return response?.data?.data ?? response?.data ?? null;
}

function uniqueSectionKey(item: GrupoAsignado) {
  return [item.GrupoId, item.MateriaId, item.AnioLectivoId, item.PeriodoId].join("|");
}

export default function SuperAdminSeccionesPage() {
  const [grupos, setGrupos] = useState<GrupoAsignado[]>([]);
  const [instituciones, setInstituciones] = useState<InstitucionOption[]>([]);
  const [grados, setGrados] = useState<GradoOption[]>([]);
  const [secciones, setSecciones] = useState<SeccionOption[]>([]);
  const [profesores, setProfesores] = useState<ProfesorOption[]>([]);
  const [modoFiltro, setModoFiltro] = useState<"SECCION" | "PROFESOR">("SECCION");
  const [institucionId, setInstitucionId] = useState("");
  const [grado, setGrado] = useState("");
  const [grupoIdFiltro, setGrupoIdFiltro] = useState("");
  const [profesorIdFiltro, setProfesorIdFiltro] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [estructura, setEstructura] = useState<EstructuraEval360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(false);
  const [loadingEstructura, setLoadingEstructura] = useState(false);
  const [savingAction, setSavingAction] = useState<"calificaciones" | "plantilla" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => grupos.find((item) => uniqueSectionKey(item) === selectedKey) || null,
    [grupos, selectedKey]
  );

  async function loadFiltros(nextInstitucionId?: string, nextGrado?: string) {
    setLoadingFiltros(true);
    setError("");
    try {
      const response = await api.get("/eval360/super-admin/secciones-mantenimiento/filtros", {
        params: {
          institucionId: nextInstitucionId || undefined,
          grado: nextGrado || undefined
        }
      });
      const data = getData(response) || {};
      setInstituciones(Array.isArray(data.instituciones) ? data.instituciones : []);
      setGrados(Array.isArray(data.grados) ? data.grados : []);
      setSecciones(Array.isArray(data.secciones) ? data.secciones : []);
      setProfesores(Array.isArray(data.profesores) ? data.profesores : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron cargar los filtros");
    } finally {
      setLoadingFiltros(false);
    }
  }

  async function loadGrupos() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/eval360/super-admin/secciones-mantenimiento", {
        params: {
          institucionId: institucionId || undefined,
          grupoId: modoFiltro === "SECCION" ? (grupoIdFiltro || undefined) : undefined,
          profesorId: modoFiltro === "PROFESOR" ? (profesorIdFiltro || undefined) : undefined
        }
      });
      const data = getData(response);
      const raw = Array.isArray(data) ? data : [];
      const map = new Map<string, GrupoAsignado>();
      raw.forEach((item: any) => {
        const grupo: GrupoAsignado = {
          InstitucionId: Number(item.InstitucionId || 0),
          InstitucionNombre: String(item.InstitucionNombre || ""),
          GrupoId: Number(item.GrupoId || 0),
          MateriaId: Number(item.MateriaId || 0),
          AnioLectivoId: Number(item.AnioLectivoId || 0),
          PeriodoId: Number(item.PeriodoId || 0),
          GrupoNombre: String(item.GrupoNombre || ""),
          MateriaNombre: String(item.MateriaNombre || ""),
          AnioNombre: String(item.AnioNombre || ""),
          PeriodoNombre: String(item.PeriodoNombre || ""),
          ProfesorNombre: String(item.ProfesorNombre || ""),
          ProfesorPrimerApellido: String(item.ProfesorPrimerApellido || ""),
          ProfesorSegundoApellido: String(item.ProfesorSegundoApellido || "")
        };
        if (grupo.GrupoId && grupo.MateriaId && grupo.AnioLectivoId && grupo.PeriodoId) {
          map.set(uniqueSectionKey(grupo), grupo);
        }
      });
      const list = Array.from(map.values()).sort((a, b) => {
        const aKey = `${a.InstitucionNombre || ""}|${a.GrupoNombre}|${a.MateriaNombre}|${a.AnioNombre}|${a.PeriodoNombre}`;
        const bKey = `${b.InstitucionNombre || ""}|${b.GrupoNombre}|${b.MateriaNombre}|${b.AnioNombre}|${b.PeriodoNombre}`;
        return aKey.localeCompare(bKey);
      });
      setGrupos(list);
      setSelectedKey(list[0] ? uniqueSectionKey(list[0]) : "");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron cargar las secciones");
    } finally {
      setLoading(false);
    }
  }

  async function loadEstructura(section: GrupoAsignado | null) {
    if (!section) {
      setEstructura(null);
      return;
    }

    setLoadingEstructura(true);
    setError("");
    try {
      const response = await api.get("/eval360/estructuras/grupo", {
        params: {
          grupoId: section.GrupoId,
          materiaId: section.MateriaId,
          anioLectivoId: section.AnioLectivoId,
          periodoId: section.PeriodoId
        }
      });
      setEstructura(getData(response));
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cargar la estructura de la seccion");
      setEstructura(null);
    } finally {
      setLoadingEstructura(false);
    }
  }

  useEffect(() => {
    void loadFiltros();
  }, []);

  useEffect(() => {
    void loadEstructura(selected);
  }, [selectedKey]);

  async function handleBuscar() {
    setMessage("");
    setSelectedKey("");
    setEstructura(null);

    if (!institucionId) {
      setError("Selecciona un colegio antes de buscar.");
      return;
    }

    if (modoFiltro === "SECCION" && !grupoIdFiltro) {
      setError("Selecciona el grado y la seccion a consultar.");
      return;
    }

    if (modoFiltro === "PROFESOR" && !profesorIdFiltro) {
      setError("Selecciona el profesor a consultar.");
      return;
    }

    await loadGrupos();
  }

  async function runAction(kind: "calificaciones" | "plantilla") {
    if (!estructura?.estructura?.EstructuraGrupoId) {
      setError("Primero selecciona una seccion con estructura");
      return;
    }

    const confirmMessage =
      kind === "calificaciones"
        ? "Esta accion eliminara calificaciones, asistencias, seguimientos y ajustes manuales de esta seccion. Deseas continuar?"
        : "Esta accion quitara la plantilla asignada de esta seccion. Deseas continuar?";

    if (!window.confirm(confirmMessage)) return;

    setSavingAction(kind);
    setMessage("");
    setError("");

    try {
      const url = kind === "calificaciones"
        ? `/eval360/estructuras/${estructura.estructura.EstructuraGrupoId}/calificaciones`
        : `/eval360/estructuras/${estructura.estructura.EstructuraGrupoId}/plantilla-asignada`;
      const response = await api.delete(url, {
        params: {
          institucionId: selected?.InstitucionId || undefined
        }
      });
      const data: ActionResult = getData(response) || {};
      const responseMessage = response?.data?.message || data.message;
      setMessage(responseMessage || (kind === "calificaciones" ? "Calificaciones eliminadas" : "Plantilla asignada eliminada"));
      await loadEstructura(selected);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo ejecutar la accion");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div>
        <h2 style={{ margin: 0, color: "#0f172a" }}>Mantenimiento de secciones</h2>
        <p style={{ margin: "6px 0 0", color: "#475569" }}>
          Elige primero el colegio y luego filtra por grado y seccion o por profesor para cargar solo lo necesario.
        </p>
      </div>

      {message ? (
        <div style={{ ...cardStyle, borderColor: "#86efac", background: "#f0fdf4", color: "#166534" }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: "grid", gap: "12px", marginBottom: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
            Colegio
            <select
              style={fieldStyle}
              value={institucionId}
              disabled={loadingFiltros}
              onChange={(event) => {
                const value = event.target.value;
                setInstitucionId(value);
                setGrado("");
                setGrupoIdFiltro("");
                setProfesorIdFiltro("");
                setGrupos([]);
                setSelectedKey("");
                setEstructura(null);
                void loadFiltros(value, "");
              }}
            >
              <option value="">{loadingFiltros ? "Cargando..." : "Selecciona un colegio"}</option>
              {instituciones.map((item) => (
                <option key={item.InstitucionId} value={item.InstitucionId}>{item.InstitucionNombre}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
            Modo de carga
            <select
              style={fieldStyle}
              value={modoFiltro}
              onChange={(event) => {
                const value = event.target.value as "SECCION" | "PROFESOR";
                setModoFiltro(value);
                setGrupoIdFiltro("");
                setProfesorIdFiltro("");
                setGrupos([]);
                setSelectedKey("");
                setEstructura(null);
              }}
            >
              <option value="SECCION">Colegio + grado + seccion</option>
              <option value="PROFESOR">Colegio + profesor</option>
            </select>
          </label>
        </div>

        {modoFiltro === "SECCION" ? (
          <div style={{ display: "grid", gap: "12px", marginBottom: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
              Grado
              <select
                style={fieldStyle}
                value={grado}
                disabled={!institucionId || loadingFiltros}
                onChange={(event) => {
                  const value = event.target.value;
                  setGrado(value);
                  setGrupoIdFiltro("");
                  setGrupos([]);
                  setSelectedKey("");
                  setEstructura(null);
                  void loadFiltros(institucionId, value);
                }}
              >
                <option value="">{loadingFiltros ? "Cargando..." : "Selecciona un grado"}</option>
                {grados.map((item) => (
                  <option key={item.Grado} value={item.Grado}>{item.Grado}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
              Seccion
              <select
                style={fieldStyle}
                value={grupoIdFiltro}
                disabled={!institucionId || !grado || loadingFiltros}
                onChange={(event) => {
                  setGrupoIdFiltro(event.target.value);
                  setGrupos([]);
                  setSelectedKey("");
                  setEstructura(null);
                }}
              >
                <option value="">{loadingFiltros ? "Cargando..." : "Selecciona una seccion"}</option>
                {secciones.map((item) => (
                  <option key={item.GrupoId} value={item.GrupoId}>{item.GrupoNombre}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px", marginBottom: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
              Profesor
              <select
                style={fieldStyle}
                value={profesorIdFiltro}
                disabled={!institucionId || loadingFiltros}
                onChange={(event) => {
                  setProfesorIdFiltro(event.target.value);
                  setGrupos([]);
                  setSelectedKey("");
                  setEstructura(null);
                }}
              >
                <option value="">{loadingFiltros ? "Cargando..." : "Selecciona un profesor"}</option>
                {profesores.map((item) => (
                  <option key={item.ProfesorId} value={item.ProfesorId}>{item.ProfesorNombre}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button type="button" className="primary-btn" onClick={() => void handleBuscar()} disabled={loading}>
            {loading ? "Cargando..." : "Cargar secciones"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setModoFiltro("SECCION");
              setInstitucionId("");
              setGrado("");
              setGrupoIdFiltro("");
              setProfesorIdFiltro("");
              setGrupos([]);
              setSelectedKey("");
              setEstructura(null);
              setMessage("");
              setError("");
              void loadFiltros();
            }}
          >
            Limpiar filtros
          </button>
        </div>

        <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
          Seccion
          <select
            style={fieldStyle}
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            disabled={loading || !grupos.length}
          >
            <option value="">{loading ? "Cargando..." : (grupos.length ? "Selecciona una seccion" : "Primero aplica los filtros")}</option>
            {grupos.map((item) => {
              const profesor = [item.ProfesorNombre, item.ProfesorPrimerApellido, item.ProfesorSegundoApellido]
                .filter(Boolean)
                .join(" ")
                .trim();
              return (
                <option key={uniqueSectionKey(item)} value={uniqueSectionKey(item)}>
                  {item.InstitucionNombre ? `${item.InstitucionNombre} - ` : ""}
                  {item.GrupoNombre} - {item.MateriaNombre} - {item.AnioNombre} - {item.PeriodoNombre}
                  {profesor ? ` - ${profesor}` : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Datos de la seccion</h3>
          {selected ? (
            <div style={{ display: "grid", gap: "8px", color: "#334155" }}>
              <div><strong>Grupo:</strong> {selected.GrupoNombre}</div>
              <div><strong>Institucion:</strong> {selected.InstitucionNombre || "-"}</div>
              <div><strong>Materia:</strong> {selected.MateriaNombre}</div>
              <div><strong>Ano lectivo:</strong> {selected.AnioNombre}</div>
              <div><strong>Periodo:</strong> {selected.PeriodoNombre}</div>
              <div><strong>Profesor:</strong> {[selected.ProfesorNombre, selected.ProfesorPrimerApellido, selected.ProfesorSegundoApellido].filter(Boolean).join(" ").trim() || "-"}</div>
              <div><strong>Estructura:</strong> {loadingEstructura ? "Cargando..." : (estructura?.estructura?.EstructuraGrupoId ? `#${estructura.estructura.EstructuraGrupoId}` : "Sin estructura")}</div>
              <div><strong>Plantilla asignada:</strong> {estructura?.estructura?.PlantillaBaseNombre || "-"}</div>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Selecciona una seccion para ver su estado.</p>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Acciones</h3>
          <div style={{ display: "grid", gap: "12px" }}>
            <button
              type="button"
              className="primary-btn"
              disabled={!estructura?.estructura?.EstructuraGrupoId || savingAction === "calificaciones"}
              onClick={() => void runAction("calificaciones")}
              style={{ background: "#b91c1c", borderColor: "#991b1b" }}
            >
              {savingAction === "calificaciones" ? "Eliminando calificaciones..." : "Eliminar calificaciones"}
            </button>

            <button
              type="button"
              className="primary-btn"
              disabled={!estructura?.estructura?.EstructuraGrupoId || savingAction === "plantilla"}
              onClick={() => void runAction("plantilla")}
            >
              {savingAction === "plantilla" ? "Eliminando plantilla..." : "Eliminar plantilla asignada"}
            </button>

            <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>
              La primera accion borra los registros de evaluacion de la estructura seleccionada.
              La segunda accion solo quita la plantilla base de la seccion.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
