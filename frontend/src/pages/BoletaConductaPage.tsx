import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import api from "../lib/http";

export default function BoletaConductaPage() {
  const { boletaConductaId } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [message, setMessage] = useState("");
  const isReprintMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("modo") === "reimprimir";
  }, [location.search]);

  async function loadBoleta() {
    setLoading(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await api.get(`/boletas/conducta/${boletaConductaId}`);
      const data = response.data?.data;
      setHtml(data?.html || "");
    } catch (error: any) {
      console.error("Error cargando boleta de conducta:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la boleta de conducta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (boletaConductaId) loadBoleta();
  }, [boletaConductaId]);

  async function handleImprimir() {
    if (!boletaConductaId) return;
    if (isReprintMode) {
      window.print();
      return;
    }
    setSendingEmail(true);
    setErrorMessage("");
    setMessage("");
    try {
      await api.post(`/boletas/conducta/${boletaConductaId}/enviar-correo`);
      setMessage("Boleta enviada por correo correctamente");
      window.print();
    } catch (error: any) {
      console.error("Error enviando boleta por correo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo enviar la boleta por correo");
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <style>{`@media print { .boleta-actions { display: none !important; } }`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
          <h3 style={{ margin: 0 }}>Boleta de reporte de conducta</h3>
          <div className="boleta-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="primary-btn" onClick={handleImprimir} disabled={loading || !!errorMessage || sendingEmail}>
              {sendingEmail ? "Enviando..." : (isReprintMode ? "Imprimir" : "Imprimir y enviar")}
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
            >
              Regresar
            </button>
          </div>
        </div>

        {loading && <div>Cargando boleta...</div>}

        {message && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
            {message}
          </div>
        )}
        {errorMessage && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {errorMessage}
          </div>
        )}
        {!loading && !errorMessage && html && (
          <div style={{ background: "#ffffff", borderRadius: "12px", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </section>
    </div>
  );
}
