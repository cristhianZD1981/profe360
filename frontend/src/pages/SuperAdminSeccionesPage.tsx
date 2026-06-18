import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type GrupoAsignado = {
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
  const [selectedKey, setSelectedKey] = useState("");
  const [estructura, setEstructura] = useState<EstructuraEval360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEstructura, setLoadingEstructura] = useState(false);
  const [savingAction, setSavingAction] = useState<"calificaciones" | "plantilla" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => grupos.find((item) => uniqueSectionKey(item) === selectedKey) || null,
    [grupos, selectedKey]
  );

  async function loadGrupos() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/gestion-profe/mis-grupos");
      const data = getData(response);
      const raw = Array.isArray(data) ? data : [];
      const map = new Map<string, GrupoAsignado>();
      raw.forEach((item: any) => {
        const grupo: GrupoAsignado = {
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
        const aKey = `${a.AnioNombre}|${a.PeriodoNombre}|${a.GrupoNombre}|${a.MateriaNombre}`;
        const bKey = `${b.AnioNombre}|${b.PeriodoNombre}|${b.GrupoNombre}|${b.MateriaNombre}`;
        return aKey.localeCompare(bKey);
      });
      setGrupos(list);
      if (!selectedKey && list[0]) {
        setSelectedKey(uniqueSectionKey(list[0]));
      }
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
      setError(err?.response?.data?.message || "No se pudo cargar la estructura de la sección");
      setEstructura(null);
    } finally {
      setLoadingEstructura(false);
    }
  }

  useEffect(() => {
    void loadGrupos();
  }, []);

  useEffect(() => {
    void loadEstructura(selected);
  }, [selectedKey]);

  async function runAction(kind: "calificaciones" | "plantilla") {
    if (!estructura?.estructura?.EstructuraGrupoId) {
      setError("Primero seleccioná una sección con estructura");
      return;
    }

    const confirmMessage =
      kind === "calificaciones"
        ? "Esta acción eliminará calificaciones, asistencias, seguimientos y ajustes manuales de esta sección. ¿Deseás continuar?"
        : "Esta acción quitará la plantilla asignada de esta sección. ¿Deseás continuar?";

    if (!window.confirm(confirmMessage)) return;

    setSavingAction(kind);
    setMessage("");
    setError("");

    try {
      const url = kind === "calificaciones"
        ? `/eval360/estructuras/${estructura.estructura.EstructuraGrupoId}/calificaciones`
        : `/eval360/estructuras/${estructura.estructura.EstructuraGrupoId}/plantilla-asignada`;
      const response = await api.delete(url);
      const data: ActionResult = getData(response) || {};
      const responseMessage = response?.data?.message || data.message;
      setMessage(responseMessage || (kind === "calificaciones" ? "Calificaciones eliminadas" : "Plantilla asignada eliminada"));
      await loadEstructura(selected);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo ejecutar la acción");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div>
        <h2 style={{ margin: 0, color: "#0f172a" }}>Mantenimiento de secciones</h2>
        <p style={{ margin: "6px 0 0", color: "#475569" }}>
          Elegí una sección y luego definí si querés borrar sus calificaciones o quitar la plantilla asignada.
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
        <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
          Sección
          <select
            style={fieldStyle}
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            disabled={loading}
          >
            <option value="">{loading ? "Cargando..." : "Seleccioná una sección"}</option>
            {grupos.map((item) => {
              const profesor = [item.ProfesorNombre, item.ProfesorPrimerApellido, item.ProfesorSegundoApellido]
                .filter(Boolean)
                .join(" ")
                .trim();
              return (
                <option key={uniqueSectionKey(item)} value={uniqueSectionKey(item)}>
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
          <h3 style={{ marginTop: 0 }}>Datos de la sección</h3>
          {selected ? (
            <div style={{ display: "grid", gap: "8px", color: "#334155" }}>
              <div><strong>Grupo:</strong> {selected.GrupoNombre}</div>
              <div><strong>Materia:</strong> {selected.MateriaNombre}</div>
              <div><strong>Año lectivo:</strong> {selected.AnioNombre}</div>
              <div><strong>Periodo:</strong> {selected.PeriodoNombre}</div>
              <div><strong>Profesor:</strong> {[selected.ProfesorNombre, selected.ProfesorPrimerApellido, selected.ProfesorSegundoApellido].filter(Boolean).join(" ").trim() || "-"}</div>
              <div><strong>Estructura:</strong> {loadingEstructura ? "Cargando..." : (estructura?.estructura?.EstructuraGrupoId ? `#${estructura.estructura.EstructuraGrupoId}` : "Sin estructura")}</div>
              <div><strong>Plantilla asignada:</strong> {estructura?.estructura?.PlantillaBaseNombre || "-"}</div>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Seleccioná una sección para ver su estado.</p>
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
              La primera acción borra los registros de evaluación de la estructura seleccionada.
              La segunda acción solo quita la plantilla base de la sección.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
