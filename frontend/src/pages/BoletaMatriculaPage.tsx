import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/http";

export default function BoletaMatriculaPage() {
  const { matriculaId } = useParams();
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadBoleta() {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await api.get(`/boletas/matricula/${matriculaId}`);
      const data = response.data?.data;
      setHtml(data?.html || "");
    } catch (error: any) {
      console.error("Error cargando boleta:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar la boleta"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (matriculaId) {
      loadBoleta();
    }
  }, [matriculaId]);

  return (
    <div className="stack">
      <section className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "12px"
          }}
        >
          <h3 style={{ margin: 0 }}>Boleta de matrícula</h3>

          <button
            type="button"
            className="primary-btn"
            onClick={() => window.print()}
            disabled={loading || !!errorMessage}
          >
            Imprimir
          </button>
        </div>

        {loading && <div>Cargando boleta...</div>}

        {errorMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca"
            }}
          >
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && html && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              overflow: "auto"
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </section>
    </div>
  );
}