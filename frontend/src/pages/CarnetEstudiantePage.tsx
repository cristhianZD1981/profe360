import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/http";

type CarnetData = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  FotoUrl: string | null;
  CodigoCarnet: string | null;
  QrContenido: string | null;
  InstitucionNombre: string | null;
  InstitucionNombreComercial: string | null;
  InstitucionLogoUrl: string | null;
  GrupoSeccion: string | null;
};

export default function CarnetEstudiantePage() {
  const { id } = useParams();
  const [item, setItem] = useState<CarnetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const qrUrl = useMemo(() => {
    const value = item?.QrContenido || item?.CodigoCarnet || "";
    if (!value) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}`;
  }, [item]);

  useEffect(() => {
    async function load() {
      try {
        const response = await api.get(`/estudiantes/${id}/carnet`);
        setItem(response.data.data ?? null);
      } catch (error: any) {
        console.error("Error cargando carnet:", error);
        const backendMessage =
          error?.response?.data?.message ||
          "No se pudo cargar el carnet";
        setErrorMessage(backendMessage);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
        Cargando carnet...
      </div>
    );
  }

  if (errorMessage || !item) {
    return (
      <div style={{ padding: "24px", fontFamily: "Arial, sans-serif", color: "#991b1b" }}>
        {errorMessage || "No se encontró el carnet"}
      </div>
    );
  }

  const nombreCompleto = [
    item.Nombre,
    item.PrimerApellido || "",
    item.SegundoApellido || ""
  ].join(" ").replace(/\s+/g, " ").trim();

  const nombreInstitucion =
    item.InstitucionNombreComercial ||
    item.InstitucionNombre ||
    "Institución";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <style>
        {`
          @media print {
            body {
              background: #ffffff !important;
            }
            .print-hidden {
              display: none !important;
            }
            .print-wrap {
              padding: 0 !important;
              background: #ffffff !important;
            }
            .carnet-card {
              box-shadow: none !important;
              border: 1px solid #d1d5db !important;
            }
          }
        `}
      </style>

      <div className="print-hidden" style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => window.print()}
          style={{
            border: "none",
            borderRadius: "10px",
            padding: "10px 16px",
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Imprimir carnet
        </button>

        <button
          onClick={() => window.close()}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            padding: "10px 16px",
            background: "#fff",
            cursor: "pointer"
          }}
        >
          Cerrar
        </button>
      </div>

      <div className="print-wrap" style={{ display: "flex", justifyContent: "center" }}>
        <div
          className="carnet-card"
          style={{
            width: "920px",
            minHeight: "320px",
            borderRadius: "22px",
            overflow: "hidden",
            background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
            border: "1px solid #e2e8f0",
            display: "grid",
            gridTemplateColumns: "260px 1fr 220px"
          }}
        >
          <div
            style={{
              padding: "24px",
              background: "linear-gradient(160deg, #eff6ff 0%, #e0f2fe 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px"
            }}
          >
            {item.InstitucionLogoUrl ? (
              <img
                src={item.InstitucionLogoUrl}
                alt="Logo institución"
                style={{
                  width: "96px",
                  height: "96px",
                  objectFit: "contain",
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "8px"
                }}
              />
            ) : (
              <div
                style={{
                  width: "96px",
                  height: "96px",
                  borderRadius: "16px",
                  background: "#dbeafe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1d4ed8",
                  fontWeight: 700
                }}
              >
                LOGO
              </div>
            )}

            {item.FotoUrl ? (
              <img
                src={item.FotoUrl}
                alt={nombreCompleto}
                style={{
                  width: "140px",
                  height: "170px",
                  objectFit: "cover",
                  borderRadius: "18px",
                  border: "3px solid #fff",
                  boxShadow: "0 8px 20px rgba(15,23,42,0.12)"
                }}
              />
            ) : (
              <div
                style={{
                  width: "140px",
                  height: "170px",
                  borderRadius: "18px",
                  border: "2px dashed #93c5fd",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  textAlign: "center",
                  padding: "12px"
                }}
              >
                Sin foto
              </div>
            )}
          </div>

          <div
            style={{
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "16px"
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#475569",
                  marginBottom: "8px"
                }}
              >
                Carnet estudiantil
              </div>

              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: "#0f172a"
                }}
              >
                {nombreCompleto}
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>
                  Identificación
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                  {item.Identificacion}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>
                  Grupo / Sección
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                  {item.GrupoSeccion || "No asignado"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>
                  Institución
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                  {nombreInstitucion}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>
                  Código carnet
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1d4ed8" }}>
                  {item.CodigoCarnet || ""}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "24px",
              borderLeft: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px"
            }}
          >
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="QR carnet"
                style={{
                  width: "170px",
                  height: "170px",
                  objectFit: "contain",
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "10px",
                  border: "1px solid #e5e7eb"
                }}
              />
            ) : (
              <div
                style={{
                  width: "170px",
                  height: "170px",
                  background: "#f1f5f9",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b"
                }}
              >
                Sin QR
              </div>
            )}

            <div
              style={{
                textAlign: "center",
                fontSize: "13px",
                color: "#475569",
                lineHeight: 1.4
              }}
            >
              Presentá este carnet para identificación y validaciones futuras
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



