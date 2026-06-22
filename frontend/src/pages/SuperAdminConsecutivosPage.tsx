import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type InstitucionOption = {
  InstitucionId: number;
  Nombre: string;
};

type TipoOption = {
  value: "BOLETAS_CONDUCTA" | "CERTIFICACIONES";
  label: string;
};

type ConsecutivoRow = {
  RegistroId: number;
  Consecutivo: number;
  FechaTexto: string;
  Tipo: string;
  Alumno: string;
  Cedula: string;
  Seccion: string;
  Codigo: string;
  Detalle: string;
  CorreoEnviado: string;
  WhatsAppEnviado: string;
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #10273a 0%, #0f2132 100%)",
  border: "1px solid rgba(96, 165, 250, 0.22)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 16px 32px rgba(2, 8, 23, 0.28)"
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: "12px",
  padding: "11px 12px",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#e2e8f0"
};

const tableWrapStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: "16px",
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.42)"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "rgba(15, 23, 42, 0.55)",
  cursor: "pointer",
  color: "#e2e8f0"
};

function getData(response: any) {
  return response?.data?.data ?? response?.data ?? null;
}

export default function SuperAdminConsecutivosPage() {
  const [instituciones, setInstituciones] = useState<InstitucionOption[]>([]);
  const [tipos, setTipos] = useState<TipoOption[]>([]);
  const [institucionId, setInstitucionId] = useState("");
  const [tipo, setTipo] = useState<"BOLETAS_CONDUCTA" | "CERTIFICACIONES" | "">("");
  const [rows, setRows] = useState<ConsecutivoRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loadingFiltros, setLoadingFiltros] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((row) => selectedIds.includes(row.RegistroId)),
    [rows, selectedIds]
  );

  async function loadFiltros() {
    setLoadingFiltros(true);
    setError("");
    try {
      const response = await api.get("/reportes/admin/consecutivos/filtros");
      const data = getData(response) || {};
      setInstituciones(Array.isArray(data.instituciones) ? data.instituciones : []);
      setTipos(Array.isArray(data.tipos) ? data.tipos : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron cargar los filtros.");
    } finally {
      setLoadingFiltros(false);
    }
  }

  useEffect(() => {
    void loadFiltros();
  }, []);

  async function handleBuscar() {
    setMessage("");
    setError("");

    if (!institucionId) {
      setError("Seleccioná el colegio antes de buscar.");
      return;
    }
    if (!tipo) {
      setError("Seleccioná el tipo de consecutivo a consultar.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.get("/reportes/admin/consecutivos", {
        params: {
          institucionId,
          tipo
        }
      });
      const data = getData(response);
      setRows(Array.isArray(data) ? data : []);
      setSelectedIds([]);
    } catch (err: any) {
      setRows([]);
      setSelectedIds([]);
      setError(err?.response?.data?.message || "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEliminar(row: ConsecutivoRow) {
    if (!institucionId || !tipo || !row.RegistroId) return;

    const confirmed = window.confirm(
      "Los registros serán eliminados de forma permanente. ¿Deseás continuar?"
    );
    if (!confirmed) return;

    setDeletingId(row.RegistroId);
    setMessage("");
    setError("");
    try {
      const response = await api.delete(`/reportes/admin/consecutivos/${tipo}/${row.RegistroId}`, {
        params: {
          institucionId
        }
      });
      setMessage(response?.data?.message || "Registro eliminado permanentemente.");
      setRows((prev) => prev.filter((item) => item.RegistroId !== row.RegistroId));
      setSelectedIds((prev) => prev.filter((item) => item !== row.RegistroId));
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo eliminar el registro.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleEliminarSeleccionados() {
    if (!institucionId || !tipo || !selectedIds.length) return;

    const confirmed = window.confirm(
      "Los registros seleccionados serán eliminados de forma permanente. ¿Deseás continuar?"
    );
    if (!confirmed) return;

    setDeletingBulk(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/reportes/admin/consecutivos/eliminar-lote", {
        institucionId,
        tipo,
        registroIds: selectedIds
      });
      setMessage(response?.data?.message || "Los registros seleccionados fueron eliminados permanentemente.");
      setRows((prev) => prev.filter((item) => !selectedIds.includes(item.RegistroId)));
      setSelectedIds([]);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron eliminar los registros seleccionados.");
    } finally {
      setDeletingBulk(false);
    }
  }

  function toggleRowSelection(registroId: number) {
    setSelectedIds((prev) =>
      prev.includes(registroId)
        ? prev.filter((item) => item !== registroId)
        : [...prev, registroId]
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(rows.map((row) => row.RegistroId));
  }

  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div>
        <h2 style={{ margin: 0, color: "#ffffff", fontWeight: 700 }}>Eliminar consecutivos</h2>
        <p style={{ margin: "6px 0 0", color: "#ffffff", fontWeight: 700 }}>
          Escogé el colegio y el tipo de registro para revisar el listado actual y eliminar únicamente lo necesario.
        </p>
      </div>

      {message ? (
        <div style={{ ...cardStyle, borderColor: "rgba(74, 222, 128, 0.45)", background: "linear-gradient(180deg, rgba(20, 83, 45, 0.96) 0%, rgba(22, 101, 52, 0.9) 100%)", color: "#dcfce7" }}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div style={{ ...cardStyle, borderColor: "rgba(248, 113, 113, 0.45)", background: "linear-gradient(180deg, rgba(127, 29, 29, 0.96) 0%, rgba(153, 27, 27, 0.9) 100%)", color: "#fee2e2" }}>
          {error}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: "grid", gap: "12px", marginBottom: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#ffffff" }}>
            Colegio
            <select
              style={fieldStyle}
              value={institucionId}
              disabled={loadingFiltros}
              onChange={(event) => {
                setInstitucionId(event.target.value);
                setRows([]);
                setSelectedIds([]);
                setMessage("");
                setError("");
              }}
            >
              <option value="">{loadingFiltros ? "Cargando..." : "Seleccioná un colegio"}</option>
              {instituciones.map((item) => (
                <option key={item.InstitucionId} value={item.InstitucionId}>{item.Nombre}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#ffffff" }}>
            Tipo
            <select
              style={fieldStyle}
              value={tipo}
              onChange={(event) => {
                setTipo(event.target.value as "BOLETAS_CONDUCTA" | "CERTIFICACIONES" | "");
                setRows([]);
                setSelectedIds([]);
                setMessage("");
                setError("");
              }}
            >
              <option value="">Seleccioná un tipo</option>
              {tipos.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="primary-btn" disabled={loading} onClick={() => void handleBuscar()}>
            {loading ? "Cargando..." : "Buscar registros"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            style={secondaryButtonStyle}
            onClick={() => {
              setInstitucionId("");
              setTipo("");
              setRows([]);
              setSelectedIds([]);
              setMessage("");
              setError("");
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ marginBottom: "12px" }}>
          <h3 style={{ margin: 0, color: "#ffffff" }}>Listado actual</h3>
          <p style={{ margin: "6px 0 0", color: "#e2e8f0", fontWeight: 700 }}>
            Al eliminar, el registro se borra definitivamente del sistema.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
          <label style={{ display: "inline-flex", gap: "8px", alignItems: "center", color: "#ffffff", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!rows.length || deletingBulk}
              onChange={toggleSelectAll}
            />
            Escoger todos
          </label>
          <button
            type="button"
            className="ghost-btn"
            style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }}
            disabled={!selectedIds.length || deletingBulk}
            onClick={() => void handleEliminarSeleccionados()}
          >
            {deletingBulk ? "Eliminando seleccionados..." : `Eliminar seleccionados (${selectedIds.length})`}
          </button>
        </div>

        <div className="table-wrap" style={tableWrapStyle}>
          <table>
            <thead>
              <tr>
                <th>Sel.</th>
                <th>Consecutivo</th>
                <th>Fecha</th>
                <th>Alumno</th>
                <th>Cédula</th>
                <th>Sección</th>
                <th>Detalle</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "12px", color: "#cbd5e1" }}>
                    {loading ? "Cargando registros..." : "No hay registros para mostrar con esos filtros."}
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={`${tipo}-${row.RegistroId}`} style={{ color: "#e2e8f0" }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.RegistroId)}
                      disabled={deletingBulk}
                      onChange={() => toggleRowSelection(row.RegistroId)}
                    />
                  </td>
                  <td>{row.Codigo || String(Number(row.Consecutivo || 0)).padStart(4, "0")}</td>
                  <td>{row.FechaTexto || "-"}</td>
                  <td>{row.Alumno || "-"}</td>
                  <td>{row.Cedula || "-"}</td>
                  <td>{row.Seccion || "-"}</td>
                  <td>{row.Detalle || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }}
                      disabled={deletingId === row.RegistroId}
                      onClick={() => void handleEliminar(row)}
                    >
                      {deletingId === row.RegistroId ? "Eliminando..." : "Eliminar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
