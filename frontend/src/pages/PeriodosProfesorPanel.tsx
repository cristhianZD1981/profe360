import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

function dataOf(response: any) {
  return response?.data?.data ?? response?.data ?? null;
}

function fullName(item: any) {
  return [item?.PrimerApellido, item?.SegundoApellido, item?.Nombre]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function PeriodosProfesorPanel() {
  const [data, setData] = useState<any>({ anioLectivo: null, periodos: [], profesores: [], estados: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(dataOf(await api.get("/periodos-profesor")) || {});
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudieron cargar los periodos por profesor");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stateMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of data?.estados || []) {
      map.set(`${item.UsuarioId}:${item.PeriodoId}`, Boolean(item.Habilitado));
    }
    return map;
  }, [data]);

  const profesores = useMemo(() => {
    const q = normalize(search);
    return (data?.profesores || []).filter((item: any) => !q || normalize(
      `${fullName(item)} ${item.Correo || ""} ${item.Roles || ""}`
    ).includes(q));
  }, [data, search]);

  function isEnabled(usuarioId: number, periodoId: number) {
    return stateMap.get(`${usuarioId}:${periodoId}`) !== false;
  }

  function enabledCount(usuarioId: number) {
    return (data?.periodos || []).filter((periodo: any) => isEnabled(usuarioId, Number(periodo.PeriodoId))).length;
  }

  async function toggle(usuarioId: number, periodoId: number) {
    const next = !isEnabled(usuarioId, periodoId);
    if (!next && enabledCount(usuarioId) <= 1) {
      setError("El profesor debe conservar al menos un periodo habilitado");
      return;
    }

    const key = `${usuarioId}:${periodoId}`;
    setSavingKey(key);
    setError("");
    setMessage("");
    try {
      await api.put(`/periodos-profesor/${usuarioId}/periodos/${periodoId}`, { habilitado: next });
      setData((current: any) => {
        const estados = (current?.estados || []).filter(
          (item: any) => !(Number(item.UsuarioId) === usuarioId && Number(item.PeriodoId) === periodoId)
        );
        estados.push({ UsuarioId: usuarioId, PeriodoId: periodoId, Habilitado: next });
        return { ...current, estados };
      });
      setMessage(next ? "Periodo habilitado para el profesor" : "Periodo inhabilitado para el profesor");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "No se pudo actualizar el periodo del profesor");
    } finally {
      setSavingKey("");
    }
  }

  if (loading) return <p>Cargando periodos por profesor...</p>;

  return (
    <div className="stack">
      {message ? <div style={{ padding: "10px 12px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8 }}>{message}</div> : null}
      {error ? <div style={{ padding: "10px 12px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8 }}>{error}</div> : null}

      <section>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>Periodos por Profesor</h3>
            <strong>{data?.anioLectivo?.Nombre || "Sin año lectivo vigente"}</strong>
          </div>
          <label style={{ minWidth: 280 }}>
            Buscar profesor
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre o correo"
              style={{ width: "100%", marginTop: 5 }}
            />
          </label>
        </div>
      </section>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Profesor</th>
              {(data?.periodos || []).map((periodo: any) => <th key={periodo.PeriodoId}>{periodo.Nombre}</th>)}
              <th>Habilitados</th>
            </tr>
          </thead>
          <tbody>
            {profesores.map((profesor: any) => {
              const usuarioId = Number(profesor.UsuarioId);
              const total = enabledCount(usuarioId);
              return (
                <tr key={usuarioId}>
                  <td>
                    <strong>{fullName(profesor)}</strong><br />
                    <small>{profesor.Correo}</small>
                  </td>
                  {(data?.periodos || []).map((periodo: any) => {
                    const periodoId = Number(periodo.PeriodoId);
                    const enabled = isEnabled(usuarioId, periodoId);
                    const key = `${usuarioId}:${periodoId}`;
                    return (
                      <td key={periodoId} style={{ textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={savingKey === key || (enabled && total <= 1)}
                            onChange={() => void toggle(usuarioId, periodoId)}
                          />
                          {enabled ? "Activo" : "Inactivo"}
                        </label>
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", fontWeight: 800 }}>{total}</td>
                </tr>
              );
            })}
            {!profesores.length ? (
              <tr><td colSpan={(data?.periodos || []).length + 2} style={{ textAlign: "center", padding: 16 }}>No hay profesores para mostrar</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
