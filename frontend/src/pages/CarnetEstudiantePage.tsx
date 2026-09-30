import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import api from "../lib/http";

type CarnetData = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  FechaNacimiento: string | null;
  Telefono: string | null;
  FotoUrl: string | null;
  CodigoCarnet: string | null;
  QrContenido: string | null;
  InstitucionNombre: string | null;
  InstitucionNombreComercial: string | null;
  InstitucionLogoUrl: string | null;
  GrupoSeccion: string | null;
  EncargadoNombre: string | null;
  EncargadoParentesco: string | null;
  EncargadoTelefono: string | null;
};

function fechaLegible(value?: string | null) {
  if (!value) return "No registrada";
  const iso = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function MepMark() {
  return <img className="mep-mark" src="/mep-logo.png" alt="Ministerio de Educación Pública" />;
}

export default function CarnetEstudiantePage() {
  const { id } = useParams();
  const [item, setItem] = useState<CarnetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await api.get(`/estudiantes/${id}/carnet`);
        if (!cancelled) setItem(response.data.data ?? null);
      } catch (error: any) {
        console.error("Error cargando carnet:", error);
        if (!cancelled) {
          setErrorMessage(error?.response?.data?.message || "No se pudo cargar el carnet");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id]);

  const nombreCompleto = useMemo(() => [
    item?.Nombre || "",
    item?.PrimerApellido || "",
    item?.SegundoApellido || ""
  ].join(" ").replace(/\s+/g, " ").trim(), [item]);

  const qrPayload = useMemo(() => {
    if (!item) return "";
    return JSON.stringify({
      nombre: nombreCompleto,
      cedula: item.Identificacion || "",
      seccion: item.GrupoSeccion || "",
      fechaNacimiento: fechaLegible(item.FechaNacimiento),
      telefono: item.Telefono || "",
      encargado: {
        nombre: item.EncargadoNombre || "",
        parentesco: item.EncargadoParentesco || "",
        telefono: item.EncargadoTelefono || ""
      }
    });
  }, [item, nombreCompleto]);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    setQrError(false);
    if (!qrPayload) return () => { cancelled = true; };
    void QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 480,
      color: { dark: "#102b51", light: "#ffffff" }
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch((error) => {
      console.error("Error generando QR del carnet:", error);
      if (!cancelled) setQrError(true);
    });
    return () => { cancelled = true; };
  }, [qrPayload]);

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Cargando carnet...</div>;
  }

  if (errorMessage || !item) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#991b1b" }}>
        {errorMessage || "No se encontró el carnet"}
      </div>
    );
  }

  const nombreInstitucion = item.InstitucionNombreComercial || item.InstitucionNombre || "Institución";

  return (
    <main className="carnet-page">
      <style>{`
        .carnet-page{min-height:100vh;background:#edf2f8;padding:24px;font-family:Arial,"Segoe UI",sans-serif;color:#102b51}
        .carnet-toolbar{display:flex;justify-content:center;align-items:center;gap:12px;margin:0 auto 18px;max-width:560px}
        .carnet-toolbar button{border:0;border-radius:9px;padding:10px 16px;background:#1769aa;color:white;font-weight:700;cursor:pointer}
        .carnet-toolbar .close{background:#fff;color:#243b53;border:1px solid #ccd6e2}
        .carnet-card{width:380px;height:604px;margin:0 auto;overflow:hidden;border:1px solid #d4deeb;border-radius:22px;background:#fff;box-shadow:0 18px 48px rgba(15,38,66,.16);display:flex;flex-direction:column;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .carnet-header{height:72px;flex:0 0 72px;display:flex;align-items:center;gap:13px;padding:8px 18px;background:#174579;color:#fff}
        .carnet-school-logo{width:54px;height:58px;flex:0 0 54px;object-fit:contain;border-radius:5px;background:#fff;padding:2px}
        .carnet-school-fallback{width:54px;height:58px;flex:0 0 54px;display:grid;place-items:center;border:1px solid #ffffff80;border-radius:8px;color:#fff;font-size:10px;font-weight:800;text-align:center}
        .carnet-school-name{font-size:16px;line-height:1.13;font-weight:800}
        .carnet-photo-wrap{height:284px;flex:0 0 284px;padding:4px 0 0;display:flex;justify-content:center}
        .carnet-photo{width:246px;height:278px;display:grid;place-items:center;overflow:hidden;border-radius:13px;background:#d7e8f8;border:1px solid #c6d9ee;color:#59728e;font-size:14px}
        .carnet-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 35%}
        .carnet-identity{flex:1;min-height:0;text-align:center;padding:2px 12px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center}
        .carnet-student-name{font-size:21px;line-height:1.02;font-weight:900;color:#112f53;max-width:100%;overflow-wrap:anywhere}
        .carnet-id{margin-top:5px;font-size:13px;font-weight:800;color:#1d3551}
        .carnet-dob{margin-top:6px;font-size:10px;line-height:1.15;color:#527194}
        .carnet-dob strong{display:block;margin-top:2px;font-size:11px;font-weight:600}
        .carnet-footer{height:132px;flex:0 0 132px;display:grid;grid-template-columns:1fr 90px;align-items:center;gap:6px;padding:7px 2px 9px 10px;border-top:1px solid #dce5ee;background:#f9fafb}
        .mep-mark{display:block;align-self:center;width:100%;height:100%;object-fit:contain;object-position:left center}
        .carnet-qr-block{justify-self:end;width:80px;display:flex;flex-direction:column;align-items:center;gap:3px;color:#19395d;font-size:7px;font-weight:800;letter-spacing:.08em}
        .carnet-qr-frame{position:relative;width:80px;height:80px;padding:4px;border:1px solid #d5dfe9;border-radius:6px;background:#fff}
        .carnet-qr{display:block;width:100%;height:100%;image-rendering:pixelated}
        .carnet-qr-logo{position:absolute;left:50%;top:50%;width:21%;height:21%;transform:translate(-50%,-50%);display:grid;place-items:center;padding:2px;border:1px solid #dce5ee;border-radius:4px;background:#fff}
        .carnet-qr-logo img{display:block;width:100%;height:100%;object-fit:contain}
        .qr-fallback{width:80px;height:80px;display:grid;place-items:center;border:1px dashed #94a3b8;border-radius:6px;color:#64748b;font-size:11px;text-align:center}
        @media(max-width:520px){.carnet-page{padding:14px 8px}.carnet-card{width:min(380px,100%);height:auto;min-height:604px;aspect-ratio:54/86}}
        @media print{
          @page{size:54mm 86mm;margin:0}
          html,body,#root{width:54mm!important;height:86mm!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important;overflow:hidden!important}
          .carnet-page{width:54mm!important;height:86mm!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important}
          .carnet-toolbar{display:none!important}
          .carnet-card{position:absolute;left:0;top:0;width:54mm!important;height:86mm!important;min-height:0!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}
          .carnet-header{height:9.5mm;flex-basis:9.5mm;padding:.7mm 2.2mm;gap:1.8mm}
          .carnet-school-logo,.carnet-school-fallback{width:8.7mm;height:9.3mm;flex-basis:8.7mm}
          .carnet-school-name{font-size:2.8mm}
          .carnet-photo-wrap{height:40.5mm;flex-basis:40.5mm;padding:.5mm 0 0}
          .carnet-photo{width:35mm;height:40mm;border-radius:1.8mm;font-size:2mm}
          .carnet-identity{padding:.4mm 1.5mm .7mm}
          .carnet-student-name{font-size:3mm;line-height:1.02}
          .carnet-id{margin-top:.7mm;font-size:2.1mm}
          .carnet-dob{margin-top:1mm;font-size:1.65mm}
          .carnet-dob strong{margin-top:.25mm;font-size:1.8mm}
          .carnet-footer{height:17.2mm;flex-basis:17.2mm;grid-template-columns:1fr 12.4mm;gap:.7mm;padding:.5mm .5mm .7mm 1mm}
          .carnet-qr-block{justify-self:end;width:11.6mm}
          .carnet-qr-block{gap:.4mm;font-size:1.1mm}
          .carnet-qr-frame,.qr-fallback{width:11.6mm;height:11.6mm;padding:.5mm;border-radius:.7mm}
          .carnet-qr-logo{padding:.35mm;border-radius:.5mm}
        }
      `}</style>

      <div className="carnet-toolbar print-hidden">
        <button type="button" onClick={() => window.print()}>Imprimir carnet</button>
        <button type="button" className="close" onClick={() => window.close()}>Cerrar</button>
      </div>

      <article className="carnet-card" aria-label={`Carnet de ${nombreCompleto}`}>
        <header className="carnet-header">
          {item.InstitucionLogoUrl ? (
            <img className="carnet-school-logo" src={item.InstitucionLogoUrl} alt={`Logo de ${nombreInstitucion}`} />
          ) : (
            <div className="carnet-school-fallback" aria-label="Logo institucional no disponible">LOGO<br />COLEGIO</div>
          )}
          <div className="carnet-school-name">{nombreInstitucion}</div>
        </header>

        <div className="carnet-photo-wrap">
          <div className="carnet-photo">
            {item.FotoUrl ? <img src={item.FotoUrl} alt={`Foto de ${nombreCompleto}`} /> : <span>Foto no registrada</span>}
          </div>
        </div>

        <section className="carnet-identity">
          <div className="carnet-student-name">{nombreCompleto}</div>
          <div className="carnet-id">Cédula&nbsp; {item.Identificacion}</div>
          <div className="carnet-dob">Fecha de nacimiento<strong>{fechaLegible(item.FechaNacimiento)}</strong></div>
        </section>

        <footer className="carnet-footer">
          <MepMark />
          <div className="carnet-qr-block">
            {qrDataUrl ? (
              <div className="carnet-qr-frame">
                <img className="carnet-qr" src={qrDataUrl} alt="QR con los datos del estudiante y encargado" />
                {item.InstitucionLogoUrl ? <span className="carnet-qr-logo"><img src={item.InstitucionLogoUrl} alt="" /></span> : null}
              </div>
            ) : (
              <div className="qr-fallback">{qrError ? "QR no disponible" : "Generando QR"}</div>
            )}
            <span>DATOS DEL ALUMNO</span>
          </div>
        </footer>
      </article>
    </main>
  );
}
