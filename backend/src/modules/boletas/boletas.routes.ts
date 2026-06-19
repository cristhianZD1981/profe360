import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { env } from "../../config/env";
import { ok, badRequest } from "../../utils/http";
import { sendEmail } from "../../services/email.service";
import { getCostaRicaIsoDate } from "../../utils/date.utils";
import { normalizeWhatsAppPhone, resolveWhatsAppPhonesForNotification } from "../../utils/whatsapp.utils";

const router = Router();
const MAIL_FROM_NOTIFICACIONES = "info@profe360cr.com";

router.use(requireAuth);
router.use(
  requireRoles(
    "SUPER_ADMIN",
    "ADMIN_INSTITUCIONAL",
    "ADMINISTRATIVO",
    "PROFESOR_GUIA",
    "PROFESOR"
  )
);

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value?: any) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function getInstitutionId(req: any, res: any) {
  const institucionId = req.auth?.institucionId ?? null;

  if (!institucionId) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }

  return Number(institucionId);
}

async function sendBoletaConductaEmail(input: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{
    filename: string;
    content: string;
    type?: string;
    disposition?: "attachment" | "inline";
  }>;
}) {
  try {
    return await sendEmail({
      from: MAIL_FROM_NOTIFICACIONES,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments
    });
  } catch (primaryError: any) {
    const fallbackFrom = String(env.mail.fromEmail || "").trim();
    if (!fallbackFrom || fallbackFrom.toLowerCase() === MAIL_FROM_NOTIFICACIONES.toLowerCase()) {
      throw primaryError;
    }
    return await sendEmail({
      from: fallbackFrom,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments
    });
  }
}

async function sendBoletaConductaWhatsApp(params: { telefono?: string | null; mensaje: string }) {
  const telefono = normalizeWhatsAppPhone(params.telefono);
  if (!telefono) return { enviado: false, modo: "omitido", motivo: "Sin telefono valido para WhatsApp" };

  const mode = String(process.env.WHATSAPP_MODE || "simulado").trim().toLowerCase();
  const provider = String(process.env.WHATSAPP_PROVIDER || "generic").trim().toLowerCase();
  const webhookUrl = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  const webhookToken = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const webhookAuthHeader = String(process.env.WHATSAPP_WEBHOOK_AUTH_HEADER || "Authorization").trim() || "Authorization";
  const fromNumber = normalizeWhatsAppPhone(process.env.WHATSAPP_FROM_NUMBER || "");

  if (mode !== "webhook" || !webhookUrl) {
    console.log("WhatsApp boleta simulado:", { telefono, mensaje: params.mensaje });
    return { enviado: false, modo: "simulado", telefono, motivo: webhookUrl ? "WHATSAPP_MODE no es webhook" : "WHATSAPP_WEBHOOK_URL no configurado" };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let payload: Record<string, any> = {
      telefono,
      mensaje: String(params.mensaje || ""),
      canal: "whatsapp",
      origen: "profe360-boleta-conducta"
    };

    if (provider === "2chat") {
      if (!webhookToken) return { enviado: false, modo: "webhook", telefono, motivo: "WHATSAPP_WEBHOOK_TOKEN no configurado para 2Chat" };
      if (!fromNumber) return { enviado: false, modo: "webhook", telefono, motivo: "WHATSAPP_FROM_NUMBER no configurado para 2Chat" };
      headers["X-User-API-Key"] = webhookToken;
      payload = {
        from_number: fromNumber,
        to_number: telefono,
        text: String(params.mensaje || "")
      };
    } else if (webhookToken) {
      headers[webhookAuthHeader] = webhookToken.toLowerCase().startsWith("bearer ")
        ? webhookToken
        : `Bearer ${webhookToken}`;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    if (!response.ok) {
      const snippet = rawBody.slice(0, 200);
      console.error("Error enviando WhatsApp de boleta:", response.status, snippet);
      return { enviado: false, modo: "webhook", telefono, status: response.status, error: snippet || "Respuesta no OK del proveedor" };
    }

    return { enviado: true, modo: "webhook", telefono, status: response.status };
  } catch (error: any) {
    const readable = String(error?.message || error || "Error desconocido");
    console.error("Excepcion enviando WhatsApp de boleta:", readable);
    return { enviado: false, modo: "webhook", telefono, error: readable };
  }
}

function fullName(item: any) {
  return [item?.Nombre, item?.PrimerApellido, item?.SegundoApellido]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildBoletaConductaWhatsAppText(params: {
  consecutivo: string;
  fecha: string;
  estudianteNombre: string;
  seccion: string;
  detalle: string;
  lugar: string;
  funcionario: string;
  colegio: string;
}) {
  return [
    "BOLETA DE REPORTE DE CONDUCTA",
    `Numero: ${params.consecutivo}`,
    `Fecha: ${params.fecha}`,
    `Colegio: ${params.colegio}`,
    `Estudiante: ${params.estudianteNombre}`,
    `Seccion: ${params.seccion}`,
    `Lugar del acontecimiento: ${params.lugar}`,
    `Persona funcionaria: ${params.funcionario}`,
    "Detalle de los hechos:",
    params.detalle
  ].filter(Boolean).join("\n");
}

function calcularEdadAlPrimeroFeb(fechaNacimiento?: any, anioLectivo?: string | null) {
  if (!fechaNacimiento) return "";

  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return "";

  const year = Number(
    String(anioLectivo || "").match(/\d{4}/)?.[0] || new Date().getFullYear()
  );
  const corte = new Date(`${year}-02-01T00:00:00`);

  let edad = corte.getFullYear() - nacimiento.getFullYear();
  const m = corte.getMonth() - nacimiento.getMonth();

  if (m < 0 || (m === 0 && corte.getDate() < nacimiento.getDate())) {
    edad--;
  }

  return String(edad);
}

function mapEncargado(encargado: any) {
  return {
    tipo: encargado?.TipoEncargado || "",
    nombre: fullName(encargado),
    identificacion: encargado?.Identificacion || "",
    correo: encargado?.Correo || "",
    telefono: encargado?.Telefono || "",
    direccion: encargado?.DireccionExacta || "",
    parentesco: encargado?.Parentesco || "",
    principal: !!encargado?.EsPrincipal,
    notificaciones: !!encargado?.RecibeNotificaciones,
    viveConEstudiante: !!encargado?.ViveConEstudiante
  };
}

function getAuthUserId(req: any) {
  return Number((req.auth as any)?.usuarioId || (req.auth as any)?.userId || (req.auth as any)?.id || 0) || null;
}

function resolveNotificationCc(req: any, ...candidates: any[]) {
  const values = [req.auth?.correo, ...candidates]
    .map((value) => String(value || "").trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
  return values[0] || "";
}

function formatDateCR(value?: any) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

async function ensureBoletaConductaTables(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.BoletaConductaConfig', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BoletaConductaConfig (
        InstitucionId INT NOT NULL PRIMARY KEY,
        SiguienteNumero INT NOT NULL CONSTRAINT DF_BoletaConductaConfig_SiguienteNumero DEFAULT(1),
        UpdatedAt DATETIME2 NULL
      );
    END;

    IF OBJECT_ID('dbo.BoletaConducta', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BoletaConducta (
        BoletaConductaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        Consecutivo INT NOT NULL,
        Fecha DATE NOT NULL,
        EstudianteId INT NOT NULL,
        GrupoId INT NULL,
        MatriculaId INT NULL,
        Seccion NVARCHAR(100) NULL,
        DetalleHechos NVARCHAR(MAX) NOT NULL,
        LugarAcontecimiento NVARCHAR(300) NULL,
        UsuarioReportaId INT NULL,
        NombreFuncionario NVARCHAR(200) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BoletaConducta_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_BoletaConducta_InstitucionConsecutivo
        ON dbo.BoletaConducta (InstitucionId, Consecutivo);
      CREATE INDEX IX_BoletaConducta_Estudiante
        ON dbo.BoletaConducta (InstitucionId, EstudianteId, CreatedAt DESC);
    END;

    IF OBJECT_ID('dbo.BoletaConductaEnvio', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BoletaConductaEnvio (
        BoletaConductaEnvioId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BoletaConductaId INT NOT NULL,
        InstitucionId INT NOT NULL,
        EstudianteId INT NOT NULL,
        CorreoDestino NVARCHAR(320) NULL,
        CorreoCC NVARCHAR(320) NULL,
        Asunto NVARCHAR(300) NULL,
        Enviado BIT NOT NULL CONSTRAINT DF_BoletaConductaEnvio_Enviado DEFAULT(0),
        Error NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BoletaConductaEnvio_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE INDEX IX_BoletaConductaEnvio_Boleta
        ON dbo.BoletaConductaEnvio (BoletaConductaId, CreatedAt DESC);
    END;
  `);
}

function buildBoletaConductaHtml(params: {
  institucion: any;
  boleta: any;
  estudianteNombre: string;
}) {
  const { institucion, boleta, estudianteNombre } = params;
  const nombreInstitucionCabecera =
    institucion?.NombreOficialBoleta ||
    institucion?.NombreComercial ||
    institucion?.Nombre ||
    "";
  const consecutivo = String(Number(boleta?.Consecutivo || 0)).padStart(4, "0");
  const fechaTexto = formatDateCR(boleta?.Fecha || new Date());
  const lugarCompleto = [String(boleta?.LugarAcontecimiento || "").trim(), String(nombreInstitucionCabecera || "").trim()].filter(Boolean).join(" - ");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Boleta de Reporte de Conducta N. ${escapeHtml(consecutivo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #f3f4f6; color: #111827; }
    .page { width: 900px; margin: 18px auto; background: #fff; padding: 10px 14px 18px 14px; border: 1px solid #cfcfcf; }
    .top-header { display: grid; grid-template-columns: 420px 1fr 82px; align-items: center; gap: 0; padding: 4px 0 4px 0; border-bottom: 1px solid #444; min-height: 78px; }
    .top-left { display: flex; align-items: center; justify-content: flex-start; min-height: 72px; overflow: hidden; }
    .top-left img { width: 100%; max-height: 72px; object-fit: contain; display: block; }
    .top-center { min-height: 72px; display: flex; flex-direction: column; justify-content: center; padding: 0 8px; text-align: left; line-height: 1.15; }
    .top-center .line { font-size: 11px; font-weight: 700; margin-bottom: 1px; }
    .top-right { display: flex; align-items: center; justify-content: center; min-height: 72px; padding-left: 4px; }
    .top-right img { width: 68px; height: 68px; object-fit: contain; display: block; }
    .titulo { text-align: center; font-size: 30px; font-weight: 800; margin: 8px 0 10px 0; letter-spacing: 0.5px; }
    .row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 18px; }
    .grow-line { border-bottom: 1px solid #111; min-height: 22px; flex: 1; }
    .texto { font-size: 18px; line-height: 1.4; margin: 10px 0; }
    .detalle-box { border: 1px solid #111; min-height: 130px; padding: 8px; margin-bottom: 10px; white-space: pre-wrap; font-size: 17px; }
    .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
    .firma-box { border: 1px solid #111; min-height: 84px; display: flex; align-items: center; justify-content: center; padding: 6px; font-size: 14px; text-align: center; white-space: pre-wrap; }
    .firma-label { border: 1px solid #111; border-top: 0; text-align: center; font-weight: 700; font-size: 14px; padding: 6px 4px; background: #e8f2ff; }
    @media print { body { background: #fff; } .page { margin: 0; width: 100%; border: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-header">
      <div class="top-left">
        ${institucion?.MembreteUrl ? `<img src="${escapeHtml(institucion.MembreteUrl)}" alt="Membrete institucional" />` : ""}
      </div>
      <div class="top-center">
        <div class="line">${escapeHtml(institucion?.RegionalEducativa || "")}</div>
        <div class="line">${institucion?.CircuitoEducativo ? `Supervisión de Centros Educativos, ${escapeHtml(institucion.CircuitoEducativo)}` : ""}</div>
        <div class="line">${escapeHtml(nombreInstitucionCabecera)}</div>
      </div>
      <div class="top-right">${institucion?.LogoUrl ? `<img src="${escapeHtml(institucion.LogoUrl)}" alt="Escudo institucional" />` : ""}</div>
    </div>

    <div class="titulo">BOLETA DE REPORTE DE CONDUCTA</div>

    <div class="row"><strong>Fecha:</strong> <div class="grow-line">${escapeHtml(fechaTexto)}</div> <strong>N°</strong> <div class="grow-line" style="max-width:140px;">${escapeHtml(consecutivo)}</div></div>
    <div class="texto">Por medio de la presente, se notifica a la persona estudiante:</div>
    <div class="row"><div class="grow-line">${escapeHtml(estudianteNombre)}</div></div>
    <div class="texto">Sección:</div>
    <div class="row"><div class="grow-line">${escapeHtml(boleta?.Seccion || "")}</div></div>
    <div class="texto">que ha presentado conductas contrarias a lo establecido en la Normativa Interna de la Institución y el Reglamento de Evaluación de los Aprendizajes y Conducta.</div>
    <div class="texto"><strong>DETALLE DE LOS HECHOS:</strong></div>
    <div class="detalle-box">${escapeHtml(boleta?.DetalleHechos || "")}</div>
    <div class="row"><strong>Lugar del acontecimiento:</strong><div class="grow-line">${escapeHtml(lugarCompleto)}</div></div>

    <div class="firmas">
      <div>
        <div class="firma-box">${escapeHtml(boleta?.NombreFuncionario || "")}</div>
        <div class="firma-label">NOMBRE DE LA PERSONA FUNCIONARIA</div>
        <div class="firma-box"></div>
        <div class="firma-label">FIRMA</div>
      </div>
      <div>
        <div class="firma-box"></div>
        <div class="firma-label">FIRMA DE LA PERSONA ESTUDIANTE</div>
      </div>
      <div>
        <div class="firma-box"></div>
        <div class="firma-label">FIRMA DE LA PERSONA ENCARGADA LEGAL</div>
        <div class="firma-box">___ / ___ / ______</div>
        <div class="firma-label">FECHA DE RECIBIDO</div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function escapePdfText(value: string) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toPdfSafeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ");
}

function buildBoletaConductaPdfBuffer(input: {
  consecutivo: string;
  fecha: string;
  estudiante: string;
  seccion: string;
  detalle: string;
  lugar: string;
  funcionario: string;
  colegio: string;
  regional?: string;
  circuito?: string;
}) {
  const lines: string[] = [];
  const pageW = 595;
  const pageH = 842;

  function t(text: string, x: number, y: number, size = 11) {
    const safe = escapePdfText(toPdfSafeText(text));
    lines.push("BT");
    lines.push(`/F1 ${size} Tf`);
    lines.push(`${x} ${y} Td`);
    lines.push(`(${safe}) Tj`);
    lines.push("ET");
  }

  function box(x: number, y: number, w: number, h: number) {
    lines.push(`${x} ${y} ${w} ${h} re S`);
  }

  function hline(x1: number, x2: number, y: number) {
    lines.push(`${x1} ${y} m ${x2} ${y} l S`);
  }

  lines.push("0.75 w");
  box(18, 18, pageW - 36, pageH - 36);
  t("MINISTERIO DE EDUCACION PUBLICA", 30, 800, 10);
  t(toPdfSafeText(input.regional || ""), 300, 800, 10);
  t(toPdfSafeText(input.circuito || ""), 300, 786, 10);
  t(toPdfSafeText(input.colegio || ""), 300, 772, 10);
  t("BOLETA DE REPORTE DE CONDUCTA", 150, 744, 17);

  t("Fecha:", 30, 716, 12);
  hline(70, 250, 712);
  t(toPdfSafeText(input.fecha), 74, 716, 11);
  t("N°", 380, 716, 12);
  hline(402, 540, 712);
  t(toPdfSafeText(input.consecutivo), 408, 716, 12);

  t("Por medio de la presente, se notifica a la persona estudiante:", 30, 688, 12);
  hline(30, 560, 674);
  t(toPdfSafeText(input.estudiante), 34, 678, 11);
  t("Seccion:", 30, 654, 12);
  hline(84, 560, 650);
  t(toPdfSafeText(input.seccion), 88, 654, 11);
  t("que ha presentado conductas contrarias a lo establecido en la Normativa Interna de la Institucion", 30, 634, 11);
  t("y el Reglamento de Evaluacion de los Aprendizajes y Conducta.", 30, 620, 11);

  t("DETALLE DE LOS HECHOS:", 30, 596, 13);
  box(30, 474, 530, 112);
  const detalleLines = toPdfSafeText(input.detalle || "").split(/\r?\n/).flatMap((l) => {
    const chunks: string[] = [];
    let s = l;
    while (s.length > 90) {
      chunks.push(s.slice(0, 90));
      s = s.slice(90);
    }
    chunks.push(s);
    return chunks;
  }).slice(0, 6);
  detalleLines.forEach((l, idx) => t(l, 36, 568 - idx * 16, 11));

  t("Lugar del acontecimiento:", 30, 452, 12);
  hline(170, 560, 448);
  t(toPdfSafeText(`${input.lugar} - ${input.colegio}`), 174, 452, 11);

  box(30, 360, 165, 70);
  box(215, 360, 165, 70);
  box(400, 360, 160, 70);
  box(30, 338, 165, 22);
  box(215, 338, 165, 22);
  box(400, 338, 160, 22);
  t(toPdfSafeText(input.funcionario), 36, 390, 11);
  t("NOMBRE DE LA PERSONA", 44, 352, 10);
  t("FUNCIONARIA", 74, 342, 10);
  t("FIRMA DE LA PERSONA ESTUDIANTE", 224, 346, 10);
  t("FIRMA DE LA PERSONA ENCARGADA LEGAL", 405, 346, 9);

  box(30, 260, 165, 70);
  box(400, 260, 160, 70);
  box(30, 238, 165, 22);
  box(400, 238, 160, 22);
  t("FIRMA", 95, 246, 11);
  t("__ / __ / ____", 446, 286, 12);
  t("FECHA DE RECIBIDO", 430, 246, 10);

  const content = lines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj");
  objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildBoletaHtml(params: {
  institucion: any;
  matricula: any;
  estudiante: any;
  encargados: any[];
}) {
  const { institucion, matricula, estudiante, encargados } = params;

  const madre = encargados.find((x) => x.tipo === "MADRE") || null;
  const padre = encargados.find((x) => x.tipo === "PADRE") || null;
  const encargado = encargados.find((x) => x.tipo === "ENCARGADO") || null;

  const bloqueMadreOEncargada = madre || encargado;
  const bloquePadreOEncargado = padre || (madre ? encargado : null);

  const anioBoleta =
    String(matricula?.AnioNombre || "").match(/\d{4}/)?.[0] ||
    new Date().getFullYear().toString();

  const edadAlPrimeroFeb = calcularEdadAlPrimeroFeb(
    estudiante?.FechaNacimiento,
    matricula?.AnioNombre
  );

  const nombreInstitucionCabecera =
    institucion?.NombreOficialBoleta ||
    institucion?.NombreComercial ||
    institucion?.Nombre ||
    "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Boleta Matrícula ${escapeHtml(anioBoleta)}</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #f3f4f6;
      color: #111827;
    }

    .page {
      width: 900px;
      margin: 18px auto;
      background: #fff;
      padding: 0 10px 14px 10px;
      border: 1px solid #cfcfcf;
    }

    .top-header {
      display: grid;
      grid-template-columns: 420px 1fr 82px;
      align-items: center;
      gap: 0;
      padding: 4px 0 2px 0;
      border-bottom: 1px solid #444;
      min-height: 78px;
    }

    .top-left {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 72px;
      overflow: hidden;
    }

    .top-left img {
      width: 100%;
      max-height: 72px;
      object-fit: contain;
      display: block;
    }

    .top-center {
      min-height: 72px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 8px;
      text-align: left;
      line-height: 1.15;
    }

    .top-center .line-1,
    .top-center .line-2,
    .top-center .line-3,
    .top-center .line-4 {
      font-size: 11px;
      font-weight: 700;
    }

    .top-center .line-1 {
      margin-bottom: 1px;
    }

    .top-center .line-2,
    .top-center .line-3,
    .top-center .line-4 {
      margin-bottom: 1px;
    }

    .top-right {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 72px;
      padding-left: 4px;
    }

    .top-right img {
      width: 68px;
      height: 68px;
      object-fit: contain;
      display: block;
    }

    .titulo {
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      margin: 8px 0 8px 0;
      border-top: 1px solid #444;
      border-bottom: 1px solid #444;
      padding: 4px 0;
      letter-spacing: 0.3px;
    }

    .box {
      border: 1px solid #444;
      margin-bottom: 7px;
      padding: 3px;
    }

    .box-title {
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 2px 6px;
      margin-bottom: 4px;
      background: #f5f5f5;
    }

    table.form-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }

    .form-table td {
      border: 1px solid #777;
      padding: 3px 5px;
      vertical-align: top;
      word-wrap: break-word;
    }

    .label {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10.5px;
      line-height: 1.1;
    }

    .value {
      margin-top: 2px;
      min-height: 14px;
      font-size: 12px;
      line-height: 1.15;
    }

    .firma-wrap {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22px;
      margin-top: 28px;
      margin-bottom: 12px;
    }

    .firma-box {
      height: 70px;
      position: relative;
    }

    .firma-linea {
      border-bottom: 1px solid #444;
      height: 45px;
      margin-bottom: 4px;
    }

    .firma-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .observaciones-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
      align-items: start;
    }

    .observaciones-box {
      border: 1px solid #777;
      min-height: 56px;
      padding: 6px;
      background: #fafafa;
      font-size: 12px;
    }

    .footer {
      margin-top: 6px;
      font-size: 9px;
      text-align: center;
      color: #111827;
      border-top: 1px solid #444;
      padding-top: 4px;
    }

    @media print {
      body {
        background: #fff;
      }

      .page {
        width: auto;
        margin: 0;
        border: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="page">

    <div class="top-header">
      <div class="top-left">
        ${
          institucion?.MembreteUrl
            ? `<img src="${escapeHtml(institucion.MembreteUrl)}" alt="Membrete institucional" />`
            : ``
        }
      </div>

      <div class="top-center">
        <div class="line-1">${escapeHtml(institucion?.RegionalEducativa || "")}</div>
        <div class="line-2">
          ${
            institucion?.CircuitoEducativo
              ? `Supervisión de Centros Educativos, ${escapeHtml(institucion.CircuitoEducativo)}`
              : ""
          }
        </div>
        <div class="line-3">${escapeHtml(nombreInstitucionCabecera)}</div>
        <div class="line-4"></div>
      </div>

      <div class="top-right">
        ${
          institucion?.LogoUrl
            ? `<img src="${escapeHtml(institucion.LogoUrl)}" alt="Logo de la institución" />`
            : ``
        }
      </div>
    </div>

    <div class="titulo">BOLETA MATRÍCULA ${escapeHtml(anioBoleta)}</div>

    <div class="box">
      <table class="form-table">
        <tr>
          <td style="width: 20%;">
            <div class="label">TIPO DE MATRÍCULA:</div>
          </td>
          <td style="width: 30%;">
            <div class="value">${escapeHtml(matricula?.TipoMatricula || "")}</div>
          </td>
          <td style="width: 20%;">
            <div class="label">NIVEL:</div>
          </td>
          <td style="width: 30%;">
            <div class="value">${escapeHtml(matricula?.NivelAcademico || matricula?.GrupoNivelAcademico || "")}</div>
          </td>
        </tr>
        <tr>
          <td><div class="label">ESPECIALIDAD:</div></td>
          <td><div class="value">${escapeHtml(matricula?.Especialidad || matricula?.GrupoEspecialidad || "")}</div></td>
          <td><div class="label">SECCIÓN:</div></td>
          <td><div class="value">${escapeHtml(matricula?.SeccionTexto || matricula?.GrupoNombre || "")}</div></td>
        </tr>
        <tr>
          <td><div class="label">RUTA DE TRANSPORTE:</div></td>
          <td colspan="3"><div class="value">${escapeHtml(matricula?.RutaTransporte || estudiante?.RutaTransporteHabitual || "")}</div></td>
        </tr>
      </table>
    </div>

    <div class="box">
      <div class="box-title">DATOS DEL ESTUDIANTE</div>
      <table class="form-table">
        <tr>
          <td><div class="label">PRIMER APELLIDO:</div><div class="value">${escapeHtml(estudiante?.PrimerApellido || "")}</div></td>
          <td><div class="label">SEGUNDO APELLIDO:</div><div class="value">${escapeHtml(estudiante?.SegundoApellido || "")}</div></td>
          <td><div class="label">NOMBRE:</div><div class="value">${escapeHtml(estudiante?.Nombre || "")}</div></td>
          <td><div class="label">N° CÉDULA:</div><div class="value">${escapeHtml(estudiante?.Identificacion || "")}</div></td>
          <td><div class="label">IDENTIFICACIÓN:</div><div class="value">${escapeHtml(estudiante?.Identificacion || "")}</div></td>
        </tr>
        <tr>
          <td><div class="label">NACIONALIDAD:</div><div class="value">${escapeHtml(estudiante?.Nacionalidad || "")}</div></td>
          <td><div class="label">ADECUACIÓN:</div><div class="value">${escapeHtml(estudiante?.Adecuacion || "")}</div></td>
          <td><div class="label">FECHA NACIMIENTO:</div><div class="value">${escapeHtml(formatDate(estudiante?.FechaNacimiento))}</div></td>
          <td><div class="label">¿ES REPITENTE?</div><div class="value">${matricula?.EsRepitente ? "Sí" : "No"}</div></td>
          <td><div class="label">RUTA DE TRANSPORTE:</div><div class="value">${escapeHtml(matricula?.RutaTransporte || estudiante?.RutaTransporteHabitual || "")}</div></td>
        </tr>
        <tr>
          <td><div class="label">DISCAPACIDAD:</div><div class="value">${escapeHtml(estudiante?.Discapacidad || "")}</div></td>
          <td><div class="label">ENFERMEDAD:</div><div class="value">${escapeHtml(estudiante?.Enfermedad || "")}</div></td>
          <td><div class="label">N° TELÉFONO:</div><div class="value">${escapeHtml(estudiante?.Telefono || "")}</div></td>
          <td><div class="label">EDAD AL 01 DE FEBRERO DE ${escapeHtml(anioBoleta)}:</div><div class="value">${escapeHtml(edadAlPrimeroFeb)}</div></td>
          <td><div class="label">CORREO:</div><div class="value">${escapeHtml(estudiante?.Correo || "")}</div></td>
        </tr>
      </table>
    </div>

    <div class="box">
      <div class="box-title">DATOS DE LA MADRE O ENCARGADA</div>
      <table class="form-table">
        <tr>
          <td style="width: 55%;"><div class="label">NOMBRE:</div><div class="value">${escapeHtml(bloqueMadreOEncargada?.nombre || "")}</div></td>
          <td style="width: 22%;"><div class="label">N° TELÉFONO:</div><div class="value">${escapeHtml(bloqueMadreOEncargada?.telefono || "")}</div></td>
          <td style="width: 23%;"><div class="label">N° DE CÉDULA:</div><div class="value">${escapeHtml(bloqueMadreOEncargada?.identificacion || "")}</div></td>
        </tr>
        <tr>
          <td><div class="label">DIRECCIÓN EXACTA:</div><div class="value">${escapeHtml(bloqueMadreOEncargada?.direccion || "")}</div></td>
          <td><div class="label">PARENTESCO:</div><div class="value">${escapeHtml(bloqueMadreOEncargada?.parentesco || "")}</div></td>
          <td><div class="label">VIVE CON ESTUDIANTE:</div><div class="value">${bloqueMadreOEncargada?.viveConEstudiante ? "Sí" : "No"}</div></td>
        </tr>
      </table>
    </div>

    <div class="box">
      <div class="box-title">DATOS DEL PADRE O ENCARGADO</div>
      <table class="form-table">
        <tr>
          <td style="width: 55%;"><div class="label">NOMBRE:</div><div class="value">${escapeHtml(bloquePadreOEncargado?.nombre || "")}</div></td>
          <td style="width: 22%;"><div class="label">N° TELÉFONO:</div><div class="value">${escapeHtml(bloquePadreOEncargado?.telefono || "")}</div></td>
          <td style="width: 23%;"><div class="label">N° DE CÉDULA:</div><div class="value">${escapeHtml(bloquePadreOEncargado?.identificacion || "")}</div></td>
        </tr>
        <tr>
          <td><div class="label">DIRECCIÓN:</div><div class="value">${escapeHtml(bloquePadreOEncargado?.direccion || "")}</div></td>
          <td><div class="label">PARENTESCO:</div><div class="value">${escapeHtml(bloquePadreOEncargado?.parentesco || "")}</div></td>
          <td><div class="label">VIVE CON ESTUDIANTE:</div><div class="value">${bloquePadreOEncargado?.viveConEstudiante ? "Sí" : "No"}</div></td>
        </tr>
      </table>
    </div>

    <div class="box">
      <div class="box-title">DECLARACIÓN Y FIRMAS</div>
      <table class="form-table">
        <tr>
          <td style="text-align:center; font-weight:700;">
            Declaro que la información proporcionada es verídica y completa.
          </td>
        </tr>
      </table>

      <div class="firma-wrap">
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-label">FIRMA DE LA ENCARGADA:</div>
        </div>
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-label">FIRMA DEL ENCARGADO:</div>
        </div>
      </div>

      <div class="observaciones-grid">
        <div>
          <div class="label" style="margin-bottom:4px;">OBSERVACIONES ADICIONALES:</div>
          <div class="observaciones-box">${escapeHtml(matricula?.ObservacionesDetalle || matricula?.Observacion || "")}</div>
        </div>

        <div>
          <div class="label" style="margin-bottom:4px;">FECHA DE MATRÍCULA:</div>
          <div class="observaciones-box">${escapeHtml(formatDate(matricula?.FechaMatricula))}</div>
        </div>
      </div>
    </div>

    <div class="footer">
      ${escapeHtml(institucion?.Nombre || "")}
      ${institucion?.RegionalEducativa ? " | " + escapeHtml(institucion.RegionalEducativa) : ""}
      ${institucion?.CircuitoEducativo ? " | " + escapeHtml(institucion.CircuitoEducativo) : ""}
    </div>
  </div>
</body>
</html>
  `;
}

router.get("/matricula/:matriculaId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const matriculaId = Number(req.params.matriculaId);
    if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
      return badRequest(res, "MatriculaId inválido");
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("matriculaId", sql.Int, matriculaId)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.EstudianteId,
          m.GrupoId,
          m.AnioLectivoId,
          m.Estado,
          m.FechaMatricula,
          m.Observacion,
          md.MatriculaDetalleId,
          md.TipoMatricula,
          md.NivelAcademico,
          md.Especialidad,
          md.SeccionTexto,
          md.RutaTransporte,
          md.EsRepitente,
          md.PermiteExcepcionProgresion,
          md.JustificacionExcepcion,
          md.CorreoEnvioBoleta,
          md.Observaciones AS ObservacionesDetalle,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.FechaNacimiento,
          e.Sexo,
          e.Correo,
          e.Telefono,
          e.FotoUrl,
          e.CodigoCarnet,
          e.QrContenido,
          e.Nacionalidad,
          e.Adecuacion,
          e.Discapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.ObservacionMedica,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.LogoUrl,
          i.MembreteUrl,
          i.NombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.NivelAcademico AS GrupoNivelAcademico,
          g.Especialidad AS GrupoEspecialidad,
          a.Nombre AS AnioNombre
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Institucion i
          ON i.InstitucionId = e.InstitucionId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = m.AnioLectivoId
        LEFT JOIN dbo.MatriculaDetalle md
          ON md.MatriculaId = m.MatriculaId
        WHERE m.MatriculaId = @matriculaId
          AND e.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "No se encontró la matrícula indicada"
      });
    }

    const row = result.recordset[0];

    const encargadosResult = await pool
      .request()
      .input("estudianteId", sql.Int, row.EstudianteId)
      .query(`
        SELECT
          ee.EstudianteEncargadoId,
          ee.Parentesco,
          ee.EsPrincipal,
          ee.RecibeNotificaciones,
          ee.ViveConEstudiante,
          e.EncargadoId,
          e.TipoEncargado,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Correo,
          e.Telefono,
          e.DireccionExacta
        FROM dbo.EstudianteEncargado ee
        INNER JOIN dbo.Encargado e
          ON e.EncargadoId = ee.EncargadoId
        WHERE ee.EstudianteId = @estudianteId
          AND ee.Activo = 1
        ORDER BY
          CASE e.TipoEncargado
            WHEN 'MADRE' THEN 1
            WHEN 'PADRE' THEN 2
            ELSE 3
          END,
          ee.EstudianteEncargadoId DESC
      `);

    const institucion = {
      Nombre: row.InstitucionNombre,
      NombreComercial: row.InstitucionNombreComercial,
      LogoUrl: row.LogoUrl,
      MembreteUrl: row.MembreteUrl,
      NombreOficialBoleta: row.NombreOficialBoleta,
      RegionalEducativa: row.RegionalEducativa,
      CircuitoEducativo: row.CircuitoEducativo
    };

    const estudiante = {
      EstudianteId: row.EstudianteId,
      Identificacion: row.Identificacion,
      Nombre: row.Nombre,
      PrimerApellido: row.PrimerApellido,
      SegundoApellido: row.SegundoApellido,
      FechaNacimiento: row.FechaNacimiento,
      Sexo: row.Sexo,
      Correo: row.Correo,
      Telefono: row.Telefono,
      FotoUrl: row.FotoUrl,
      CodigoCarnet: row.CodigoCarnet,
      QrContenido: row.QrContenido,
      Nacionalidad: row.Nacionalidad,
      Adecuacion: row.Adecuacion,
      Discapacidad: row.Discapacidad,
      Enfermedad: row.Enfermedad,
      RutaTransporteHabitual: row.RutaTransporteHabitual,
      ObservacionMedica: row.ObservacionMedica
    };

    const matricula = {
      MatriculaId: row.MatriculaId,
      Estado: row.Estado,
      FechaMatricula: row.FechaMatricula,
      Observacion: row.Observacion,
      TipoMatricula: row.TipoMatricula,
      NivelAcademico: row.NivelAcademico,
      Especialidad: row.Especialidad,
      SeccionTexto: row.SeccionTexto,
      RutaTransporte: row.RutaTransporte,
      EsRepitente: row.EsRepitente,
      PermiteExcepcionProgresion: row.PermiteExcepcionProgresion,
      JustificacionExcepcion: row.JustificacionExcepcion,
      CorreoEnvioBoleta: row.CorreoEnvioBoleta,
      ObservacionesDetalle: row.ObservacionesDetalle,
      GrupoNombre: row.GrupoNombre,
      GrupoNivel: row.GrupoNivel,
      GrupoNivelAcademico: row.GrupoNivelAcademico,
      GrupoEspecialidad: row.GrupoEspecialidad,
      AnioNombre: row.AnioNombre
    };

    const encargados = encargadosResult.recordset.map(mapEncargado);
    const html = buildBoletaHtml({
      institucion,
      matricula,
      estudiante,
      encargados
    });

    return ok(
      res,
      {
        institucion,
        estudiante,
        matricula,
        encargados,
        html
      },
      "Boleta generada correctamente"
    );
  } catch (error) {
    console.error("Error generando boleta de matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo generar la boleta de matrícula"
    });
  }
});

router.get("/conducta/contexto/:estudianteId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (!institucionId) return;
    const estudianteId = Number(req.params.estudianteId);
    if (!Number.isFinite(estudianteId)) return badRequest(res, "Estudiante inválido");

    const pool = await getPool();
    await ensureBoletaConductaTables(pool);

    const rowResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        SELECT TOP 1
          e.EstudianteId,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.NombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          i.LogoUrl,
          i.MembreteUrl,
          m.MatriculaId,
          m.GrupoId,
          g.Nombre AS Seccion
        FROM dbo.Estudiante e
        INNER JOIN dbo.Institucion i ON i.InstitucionId = e.InstitucionId
        LEFT JOIN dbo.Matricula m ON m.EstudianteId = e.EstudianteId
        LEFT JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
        WHERE e.InstitucionId = @institucionId
          AND e.EstudianteId = @estudianteId
        ORDER BY CASE WHEN m.Estado = N'Activa' THEN 0 ELSE 1 END, m.CreatedAt DESC, m.MatriculaId DESC
      `);
    const row = rowResult.recordset[0];
    if (!row) return res.status(404).json({ ok: false, message: "No se encontró el estudiante" });

    const configResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
        BEGIN
          INSERT INTO dbo.BoletaConductaConfig (InstitucionId, SiguienteNumero)
          VALUES (@institucionId, 1)
        END
        SELECT TOP 1 SiguienteNumero FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId
      `);
    const siguienteNumero = Number(configResult.recordset[0]?.SiguienteNumero || 1);
    const usuarioNombreResult = await pool.request()
      .input("usuarioId", sql.Int, getAuthUserId(req))
      .query(`
        SELECT TOP 1 Nombre, PrimerApellido, SegundoApellido
        FROM dbo.Usuario
        WHERE UsuarioId = @usuarioId
      `);

    return ok(res, {
      fecha: getCostaRicaIsoDate(),
      estudianteId: Number(row.EstudianteId),
      estudianteNombre: fullName(row),
      seccion: String(row.Seccion || ""),
      matriculaId: row.MatriculaId ? Number(row.MatriculaId) : null,
      grupoId: row.GrupoId ? Number(row.GrupoId) : null,
      siguienteNumero,
      institucion: {
        Nombre: row.InstitucionNombre,
        NombreComercial: row.InstitucionNombreComercial,
        NombreOficialBoleta: row.NombreOficialBoleta,
        RegionalEducativa: row.RegionalEducativa,
        CircuitoEducativo: row.CircuitoEducativo,
        LogoUrl: row.LogoUrl,
        MembreteUrl: row.MembreteUrl
      },
      funcionarioNombre: fullName(usuarioNombreResult.recordset[0] || req.auth || {})
    });
  } catch (error) {
    console.error("Error cargando contexto de boleta de conducta:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el contexto de la boleta" });
  }
});

router.post("/conducta", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (!institucionId) return;
    await ensureBoletaConductaTables(pool);

    const estudianteId = Number(req.body.estudianteId || 0);
    const detalleHechos = String(req.body.detalleHechos || "").trim();
    const lugarAcontecimiento = String(req.body.lugarAcontecimiento || "").trim();
    if (!Number.isFinite(estudianteId) || estudianteId <= 0) return badRequest(res, "Estudiante inválido");
    if (!detalleHechos) return badRequest(res, "Debés indicar el detalle de los hechos");
    if (!lugarAcontecimiento) return badRequest(res, "Debés indicar el lugar del acontecimiento");

    await transaction.begin();

    const studentResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        SELECT TOP 1
          e.EstudianteId,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.NombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          i.LogoUrl,
          i.MembreteUrl,
          m.MatriculaId,
          m.GrupoId,
          g.Nombre AS Seccion
        FROM dbo.Estudiante e
        INNER JOIN dbo.Institucion i ON i.InstitucionId = e.InstitucionId
        LEFT JOIN dbo.Matricula m ON m.EstudianteId = e.EstudianteId
        LEFT JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
        WHERE e.InstitucionId = @institucionId
          AND e.EstudianteId = @estudianteId
        ORDER BY CASE WHEN m.Estado = N'Activa' THEN 0 ELSE 1 END, m.CreatedAt DESC, m.MatriculaId DESC
      `);
    const row = studentResult.recordset[0];
    if (!row) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: "No se encontró el estudiante" });
    }

    const nextResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
        BEGIN
          INSERT INTO dbo.BoletaConductaConfig (InstitucionId, SiguienteNumero)
          VALUES (@institucionId, 1)
        END
        SELECT TOP 1 SiguienteNumero
        FROM dbo.BoletaConductaConfig
        WHERE InstitucionId = @institucionId
      `);
    const consecutivo = Number(nextResult.recordset[0]?.SiguienteNumero || 1);

    const usuarioNombreResult = await new sql.Request(transaction)
      .input("usuarioId", sql.Int, getAuthUserId(req))
      .query(`
        SELECT TOP 1 Nombre, PrimerApellido, SegundoApellido
        FROM dbo.Usuario
        WHERE UsuarioId = @usuarioId
      `);
    const funcionarioNombre = fullName(usuarioNombreResult.recordset[0] || req.auth || {});
    const insertResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("consecutivo", sql.Int, consecutivo)
      .input("fecha", sql.Date, getCostaRicaIsoDate())
      .input("estudianteId", sql.Int, estudianteId)
      .input("grupoId", sql.Int, row.GrupoId ? Number(row.GrupoId) : null)
      .input("matriculaId", sql.Int, row.MatriculaId ? Number(row.MatriculaId) : null)
      .input("seccion", sql.NVarChar(100), String(row.Seccion || ""))
      .input("detalleHechos", sql.NVarChar(sql.MAX), detalleHechos)
      .input("lugarAcontecimiento", sql.NVarChar(300), lugarAcontecimiento)
      .input("usuarioReportaId", sql.Int, getAuthUserId(req))
      .input("nombreFuncionario", sql.NVarChar(200), funcionarioNombre || null)
      .query(`
        INSERT INTO dbo.BoletaConducta
          (InstitucionId, Consecutivo, Fecha, EstudianteId, GrupoId, MatriculaId, Seccion, DetalleHechos, LugarAcontecimiento, UsuarioReportaId, NombreFuncionario, CreatedAt)
        OUTPUT INSERTED.BoletaConductaId
        VALUES
          (@institucionId, @consecutivo, @fecha, @estudianteId, @grupoId, @matriculaId, @seccion, @detalleHechos, @lugarAcontecimiento, @usuarioReportaId, @nombreFuncionario, SYSDATETIME())
      `);
    const boletaConductaId = Number(insertResult.recordset[0]?.BoletaConductaId || 0);

    await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.BoletaConductaConfig
        SET SiguienteNumero = SiguienteNumero + 1,
            UpdatedAt = SYSDATETIME()
        WHERE InstitucionId = @institucionId
      `);

    await transaction.commit();
    return ok(res, { boletaConductaId }, "Boleta de conducta generada correctamente");
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error generando boleta de conducta:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar la boleta de conducta" });
  }
});

router.get("/conducta/:boletaConductaId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (!institucionId) return;
    const boletaConductaId = Number(req.params.boletaConductaId);
    if (!Number.isFinite(boletaConductaId)) return badRequest(res, "Boleta inválida");

    const pool = await getPool();
    await ensureBoletaConductaTables(pool);

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("boletaConductaId", sql.Int, boletaConductaId)
      .query(`
        SELECT TOP 1
          b.*,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.NombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          i.LogoUrl,
          i.MembreteUrl
        FROM dbo.BoletaConducta b
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
        INNER JOIN dbo.Institucion i ON i.InstitucionId = b.InstitucionId
        WHERE b.BoletaConductaId = @boletaConductaId
          AND b.InstitucionId = @institucionId
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ ok: false, message: "No se encontró la boleta de conducta" });

    const institucion = {
      Nombre: row.InstitucionNombre,
      NombreComercial: row.InstitucionNombreComercial,
      NombreOficialBoleta: row.NombreOficialBoleta,
      RegionalEducativa: row.RegionalEducativa,
      CircuitoEducativo: row.CircuitoEducativo,
      LogoUrl: row.LogoUrl,
      MembreteUrl: row.MembreteUrl
    };
    const html = buildBoletaConductaHtml({
      institucion,
      boleta: row,
      estudianteNombre: fullName(row)
    });

    return ok(res, {
      boleta: row,
      institucion,
      estudianteNombre: fullName(row),
      html
    }, "Boleta de conducta generada correctamente");
  } catch (error) {
    console.error("Error consultando boleta de conducta:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la boleta de conducta" });
  }
});

router.post("/conducta/:boletaConductaId/enviar-correo", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (!institucionId) return;
    const boletaConductaId = Number(req.params.boletaConductaId);
    if (!Number.isFinite(boletaConductaId)) return badRequest(res, "Boleta inválida");

    const pool = await getPool();
    await ensureBoletaConductaTables(pool);

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("boletaConductaId", sql.Int, boletaConductaId)
      .query(`
        SELECT TOP 1
          b.*,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Identificacion,
          e.Correo AS EstudianteCorreo,
          e.FechaNacimiento,
          e.Telefono AS TelefonoEstudiante,
          e.AutorizaWhatsAppEncargado,
          u.Correo AS ProfesorCorreo,
          enc.Telefonos AS EncargadosTelefonos,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.NombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          i.LogoUrl,
          i.MembreteUrl
        FROM dbo.BoletaConducta b
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
        INNER JOIN dbo.Institucion i ON i.InstitucionId = b.InstitucionId
        LEFT JOIN dbo.Usuario u ON u.UsuarioId = b.UsuarioReportaId
        OUTER APPLY (
          SELECT
            STUFF((
              SELECT DISTINCT '|' + LTRIM(RTRIM(ISNULL(en2.Telefono, '')))
              FROM dbo.EstudianteEncargado ee2
              INNER JOIN dbo.Encargado en2 ON en2.EncargadoId = ee2.EncargadoId
              WHERE ee2.EstudianteId = e.EstudianteId
                AND ISNULL(ee2.Activo, 1) = 1
                AND ISNULL(en2.Activo, 1) = 1
                AND ISNULL(ee2.RecibeNotificaciones, 1) = 1
                AND LTRIM(RTRIM(ISNULL(en2.Telefono, ''))) <> ''
              FOR XML PATH(''), TYPE
            ).value('.', 'nvarchar(max)'), 1, 1, '') AS Telefonos
        ) enc
        WHERE b.BoletaConductaId = @boletaConductaId
          AND b.InstitucionId = @institucionId
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ ok: false, message: "No se encontró la boleta de conducta" });

    const correoEstudiante = String(row.EstudianteCorreo || `${String(row.Identificacion || "").trim()}@mep.go.cr`).trim();
    if (!correoEstudiante) return badRequest(res, "El estudiante no tiene correo registrado");
    const correoProfesor = resolveNotificationCc(req, row.ProfesorCorreo) || null;
    const estudianteNombre = fullName(row);
    const fechaIso = String(row.Fecha || "").slice(0, 10);
    const fechaCR = formatDateCR(row.Fecha);
    const consecutivo = String(Number(row.Consecutivo || 0)).padStart(4, "0");
    const nombreColegio = String(row.NombreOficialBoleta || row.InstitucionNombreComercial || row.InstitucionNombre || "");
    const mensajeWhatsApp = buildBoletaConductaWhatsAppText({
      consecutivo,
      fecha: fechaCR,
      estudianteNombre,
      seccion: String(row.Seccion || ""),
      detalle: String(row.DetalleHechos || ""),
      lugar: String(row.LugarAcontecimiento || ""),
      funcionario: String(row.NombreFuncionario || ""),
      colegio: nombreColegio
    });

    const asunto = `BOLETA DE REPORTE DE CONDUCTA ${consecutivo} ${fechaIso}`;
    const cuerpo = `Se adjunta BOLETA DE REPORTE DE CONDUCTA consecutivo ${consecutivo} para el estudiante ${estudianteNombre} del día ${fechaCR}.`;
    const pdfBuffer = buildBoletaConductaPdfBuffer({
      consecutivo,
      fecha: fechaCR,
      estudiante: estudianteNombre,
      seccion: String(row.Seccion || ""),
      detalle: String(row.DetalleHechos || ""),
      lugar: String(row.LugarAcontecimiento || ""),
      funcionario: String(row.NombreFuncionario || ""),
      colegio: nombreColegio,
      regional: String(row.RegionalEducativa || ""),
      circuito: String(row.CircuitoEducativo || "")
    });
    const filename = `boleta_conducta_${consecutivo}_${fechaIso}.pdf`;

    let enviado = false;
    let whatsappEnviado = false;
    let errorMsg: string | null = null;
    try {
      const correo = await sendBoletaConductaEmail({
        to: correoEstudiante,
        cc: correoProfesor || undefined,
        subject: asunto,
        text: cuerpo,
        html: `<p>${escapeHtml(cuerpo)}</p>`,
        attachments: [
          {
            filename,
            content: pdfBuffer.toString("base64"),
            type: "application/pdf",
            disposition: "attachment"
          }
        ]
      });
      enviado = correo?.enviado === true;
      if (!enviado) {
        errorMsg = String(correo?.motivo || "No se pudo enviar correo");
      }
    } catch (error: any) {
      enviado = false;
      errorMsg = String(error?.message || "No se pudo enviar correo");
    }

    const telefonosWhatsApp = resolveWhatsAppPhonesForNotification({
      fechaNacimiento: row.FechaNacimiento || null,
      telefonoEstudiante: row.TelefonoEstudiante || null,
      telefonosEncargados: String(row.EncargadosTelefonos || "")
        .split("|")
        .map((item: string) => String(item || "").trim())
        .filter((item: string) => item.length > 0),
      autorizaWhatsAppEncargado: !!row.AutorizaWhatsAppEncargado
    });
    const erroresWhatsApp: string[] = [];
    for (const telefono of telefonosWhatsApp) {
      const respuesta = await sendBoletaConductaWhatsApp({
        telefono,
        mensaje: mensajeWhatsApp
      });
      if (respuesta?.enviado === true) {
        whatsappEnviado = true;
        continue;
      }
      const detalle = String(respuesta?.motivo || respuesta?.error || "No se pudo enviar WhatsApp");
      erroresWhatsApp.push(`${telefono}: ${detalle}`);
    }
    if (!enviado && !whatsappEnviado && !errorMsg && erroresWhatsApp.length > 0) {
      errorMsg = erroresWhatsApp.join(" | ");
    } else if (errorMsg && erroresWhatsApp.length > 0) {
      errorMsg = `${errorMsg} | WhatsApp: ${erroresWhatsApp.join(" | ")}`;
    }
    const envioExitoso = enviado || whatsappEnviado;

    await pool.request()
      .input("boletaConductaId", sql.Int, boletaConductaId)
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, Number(row.EstudianteId || 0))
      .input("correoDestino", sql.NVarChar(320), correoEstudiante)
      .input("correoCC", sql.NVarChar(320), correoProfesor)
      .input("asunto", sql.NVarChar(300), asunto)
      .input("enviado", sql.Bit, envioExitoso ? 1 : 0)
      .input("error", sql.NVarChar(sql.MAX), errorMsg)
      .query(`
        INSERT INTO dbo.BoletaConductaEnvio
          (BoletaConductaId, InstitucionId, EstudianteId, CorreoDestino, CorreoCC, Asunto, Enviado, Error, CreatedAt)
        VALUES
          (@boletaConductaId, @institucionId, @estudianteId, @correoDestino, @correoCC, @asunto, @enviado, @error, SYSDATETIME())
      `);

    if (!envioExitoso) {
      return res.status(500).json({ ok: false, message: errorMsg || "No se pudo enviar la boleta" });
    }
    return ok(res, {
      enviado: true,
      correoEnviado: enviado,
      whatsappEnviado
    }, "Boleta enviada correctamente");
  } catch (error) {
    console.error("Error enviando boleta de conducta por correo:", error);
    return res.status(500).json({ ok: false, message: "No se pudo enviar la boleta por correo" });
  }
});

export default router;
