import { useEffect, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type Institution = {
  InstitucionId: number;
  Nombre: string;
  NombreComercial?: string | null;
};

const SCOPE_KEY = "profe360_institution_scope";

export default function SuperAdminInstitutionScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.roles?.some((role) => role.trim().toUpperCase() === "SUPER_ADMIN") ?? false;
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem(SCOPE_KEY) || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    api.get("/instituciones", { params: { incluirInactivas: false } })
      .then((response) => {
        const payload = response.data?.data ?? response.data;
        const rows = Array.isArray(payload) ? payload : payload?.instituciones;
        if (!active) return;
        const available = Array.isArray(rows) ? rows.filter((row) => row.Activo !== false) : [];
        setInstitutions(available);
        const saved = sessionStorage.getItem(SCOPE_KEY) || "";
        if (!available.some((item) => String(item.InstitucionId) === saved)) {
          sessionStorage.removeItem(SCOPE_KEY);
          setSelectedId("");
        }
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || "No se pudieron cargar las instituciones.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isSuperAdmin]);

  function selectInstitution(value: string) {
    setSelectedId(value);
    if (value) sessionStorage.setItem(SCOPE_KEY, value);
    else sessionStorage.removeItem(SCOPE_KEY);
  }

  if (!isSuperAdmin) return <>{children}</>;

  return <div style={{ display: "grid", gap: 12 }}>
    <section style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", border: "1px solid #bfdbfe", borderRadius: 10, background: "#eff6ff" }}>
      <label htmlFor="super-admin-institution" style={{ fontWeight: 700, color: "#1e3a8a" }}>Institución (colegio)</label>
      <select id="super-admin-institution" value={selectedId} onChange={(event) => selectInstitution(event.target.value)} disabled={loading} style={{ minWidth: 280, maxWidth: "100%", padding: "8px 10px", border: "1px solid #93c5fd", borderRadius: 7, background: "#fff", color: "#0f172a" }}>
        <option value="">{loading ? "Cargando instituciones…" : "Seleccione una institución"}</option>
        {institutions.map((item) => <option key={item.InstitucionId} value={item.InstitucionId}>{item.NombreComercial || item.Nombre}</option>)}
      </select>
      {selectedId && <span style={{ color: "#1d4ed8", fontSize: 13 }}>Los datos y acciones se limitarán a este colegio.</span>}
    </section>
    {error ? <div role="alert" style={{ color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12 }}>{error}</div> : null}
    {selectedId ? children : !loading && !error ? <p style={{ color: "#475569", margin: "4px 0" }}>Seleccioná una institución para acceder a sus estudiantes y matrículas.</p> : null}
  </div>;
}
