import { Router } from "express";
import multer from "multer";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { promises as fs } from "fs";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql, timedQuery } from "../../config/database";
import { badRequest, created, forbidden, ok } from "../../utils/http";
import { sendEmail } from "../../services/email.service";
import { env } from "../../config/env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const examenIaUpload = upload.any();
const CONTEXTO_CACHE_TTL_MS = 8000;
const contextoCache = new Map<string, { at: number; data: any }>();
const contextoInFlight = new Map<string, Promise<any>>();
const BOOTSTRAP_CACHE_TTL_MS = 10000;
const bootstrapCache = new Map<string, { at: number; data: any }>();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

type AuthUser = {
  userId?: number;
  usuarioId?: number;
  institucionId?: number | null;
  roles?: string[];
};

function getAuth(req: any): AuthUser {
  return req.auth || {};
}

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.userId || auth.usuarioId || 0);
}

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return (auth.roles || []).some((role) => roles.includes(role));
}

function isSuperAdmin(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function isInstitutionAdmin(req: any) {
  return hasAnyRole(req, ["ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
}

function isProfesor(req: any) {
  return hasAnyRole(req, ["PROFESOR", "PROFESOR_GUIA"]);
}

function getInstitutionId(req: any, res: any) {
  const auth = getAuth(req);
  const institucionId = auth.institucionId ?? null;

  if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
    badRequest(res, "El usuario no tiene instituciÃ³n asignada");
    return null;
  }

  return Number(institucionId);
}

function toOptionalNumber(value: any) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredNumber(value: any, field: string, res: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    badRequest(res, `El campo ${field} es invÃ¡lido`);
    return null;
  }
  return parsed;
}

function toNumberList(values: any) {
  const raw = Array.isArray(values) ? values : (values === undefined || values === null ? [] : [values]);
  return Array.from(
    new Set(
      raw
        .map((item) => Number(item))
        .filter((num) => Number.isFinite(num) && num > 0)
        .map((num) => Number(num))
    )
  );
}

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function xmlWordToText(xml: string) {
  return xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractDocxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return "";
  return xmlWordToText(docXml);
}

async function hasRealExamContentInDocx(buffer: Buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return false;
    const plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));
    const hasQuestions = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);
    const unresolvedMarkers = (xml.match(/\{\{/g) || []).length;
    return hasQuestions && unresolvedMarkers < 8;
  } catch {
    return false;
  }
}

async function extractUploadedText(file?: Express.Multer.File | null) {
  if (!file || !file.buffer) return "";
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();

  if (name.endsWith(".txt") || mime.includes("text/plain")) {
    return file.buffer.toString("utf8").trim();
  }

  if (
    name.endsWith(".docx") ||
    mime.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  ) {
    return (await extractDocxText(file.buffer)).trim();
  }

  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    const raw = file.buffer.toString("utf8");
    return raw
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return "";
}

function xmlEscape(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWordParagraphsXml(text: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  const lines = String(text || "").split(/\r?\n/);
  const font = String(style?.font || "Calibri").trim() || "Calibri";
  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;
  const halfPts = Math.round(sizePt * 2);
  const bold = style?.bold ? "<w:b/><w:bCs/>" : "";
  const runProps = `<w:rPr>${bold}<w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr>`;
  return lines
    .map((line) => `<w:p><w:r>${runProps}<w:t xml:space="preserve">${xmlEscape(line || " ")}</w:t></w:r></w:p>`)
    .join("");
}

function normalizeMathForWord(input: string) {
  const supers: Record<string, string> = { "0": "ï¿½", "1": "ï¿½", "2": "ï¿½", "3": "ï¿½", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "?", "+": "?", "-": "?" };
  let text = String(input || "");
  text = text
    .replace(/\\cdot/g, "ï¿½")
    .replace(/\\times/g, "ï¿½")
    .replace(/\\div/g, "ï¿½")
    .replace(/\\pm/g, "ï¿½")
    .replace(/\\leq/g, "=")
    .replace(/\\geq/g, "=")
    .replace(/\\neq/g, "?")
    .replace(/\\sqrt\{([^}]+)\}/g, "v($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\$(.*?)\$/g, "$1");

  text = text.replace(/\^([0-9+\-]+)/g, (_m, g1) => String(g1).split("").map((c) => supers[c] || c).join(""));
  return text;
}

async function renderDocxFromTemplate(
  templateBase64: string,
  examText: string,
  markers?: Record<string, string>,
  sectionBlocks?: Record<string, string>,
  style?: { font?: string; sizePt?: number }
) {
  const zip = await JSZip.loadAsync(Buffer.from(String(templateBase64 || ""), "base64"));
  const normalized = normalizeMathForWord(examText);
  const targetFiles = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/i.test(name)
  );
  let replacedAnyMarker = false;
  let contentTokenFound = false;
  let hasAnyMarkerToken = false;
  let insertedExamContent = false;

  for (const name of targetFiles) {
    const entry = zip.file(name);
    if (!entry) continue;
    let xml = await entry.async("string");

    if (markers && Object.keys(markers).length) {
      const p1 = replaceMarkersInParagraphXml(xml, markers, style);
      xml = p1.xml;
      if (p1.replacedAny) replacedAnyMarker = true;

      const p2 = replaceMarkersAcrossRuns(xml, markers);
      xml = p2.xml;
      if (p2.replacedAny) replacedAnyMarker = true;

      const p3 = replaceTemplateMarkers(xml, markers);
      if (p3 !== xml) replacedAnyMarker = true;
      xml = p3;

      // ï¿½ltima pasada robusta: soporta marcadores partidos por runs y espacios extremos de Word.
      for (const [k, v] of Object.entries(markers || {})) {
        const prev = xml;
        xml = replaceMarkerLooseAcrossXml(xml, k, String(v ?? ""));
        if (xml !== prev) replacedAnyMarker = true;
      }
      const p4 = replaceKnownPlainMarkers(xml, markers);
      if (p4 !== xml) replacedAnyMarker = true;
      xml = p4;
    }

    if (sectionBlocks && Object.keys(sectionBlocks).length) {
      const beforeBlocks = xml;
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_SR", sectionBlocks.SR || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RC", sectionBlocks.RC || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_C", sectionBlocks.C || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_I", sectionBlocks.I || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RE", sectionBlocks.RE || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RP", sectionBlocks.RP || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RR", sectionBlocks.RR || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RCAS", sectionBlocks.RCAS || "", style);
      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_PE", sectionBlocks.PE || "", style);
      if (xml !== beforeBlocks) insertedExamContent = true;

      const beforeHeadings = xml;
      xml = injectAfterHeading(xml, /SELECCI[ï¿½O]N\s+DE\s+RESPUESTA/i, sectionBlocks.SR || "", style);
      xml = injectAfterHeading(xml, /RESPUESTA\s+CORTA/i, sectionBlocks.RC || "", style);
      xml = injectAfterHeading(xml, /CORRESPONDENCIA/i, sectionBlocks.C || "", style);
      xml = injectAfterHeading(xml, /IDENTIFICACI[ï¿½O]N/i, sectionBlocks.I || "", style);
      xml = injectAfterHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+EJERCICIOS/i, sectionBlocks.RE || "", style);
      xml = injectAfterHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+PROBLEMAS/i, sectionBlocks.RP || "", style);
      xml = injectAfterHeading(xml, /RESPUESTA\s+RESTRINGIDA/i, sectionBlocks.RR || "", style);
      xml = injectAfterHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+CASOS/i, sectionBlocks.RCAS || "", style);
      xml = injectAfterHeading(xml, /PRODUCCI[ï¿½O]N\s+ESCRITA/i, sectionBlocks.PE || "", style);
      if (xml !== beforeHeadings) insertedExamContent = true;

      xml = pruneEmptySectionHeading(xml, /SELECCI[ï¿½O]N\s+DE\s+RESPUESTA/i, !(sectionBlocks.SR || "").trim());
      xml = pruneEmptySectionHeading(xml, /RESPUESTA\s+CORTA/i, !(sectionBlocks.RC || "").trim());
      xml = pruneEmptySectionHeading(xml, /CORRESPONDENCIA/i, !(sectionBlocks.C || "").trim());
      xml = pruneEmptySectionHeading(xml, /IDENTIFICACI[ï¿½O]N/i, !(sectionBlocks.I || "").trim());
      xml = pruneEmptySectionHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+EJERCICIOS/i, !(sectionBlocks.RE || "").trim());
      xml = pruneEmptySectionHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+PROBLEMAS/i, !(sectionBlocks.RP || "").trim());
      xml = pruneEmptySectionHeading(xml, /RESPUESTA\s+RESTRINGIDA/i, !(sectionBlocks.RR || "").trim());
      xml = pruneEmptySectionHeading(xml, /RESOLUCI[ï¿½O]N\s+DE\s+CASOS/i, !(sectionBlocks.RCAS || "").trim());
      xml = pruneEmptySectionHeading(xml, /PRODUCCI[ï¿½O]N\s+ESCRITA/i, !(sectionBlocks.PE || "").trim());
    }

    // Marcador de conteo exacto de pï¿½ginas del documento (Word lo recalcula al abrir/imprimir)
    xml = injectNumPagesFieldMarker(xml, "TOTAL_PAGINAS_DOCUMENTO", style);

    if (/\{\{[\s\S]*?\}\}/.test(xml)) {
      hasAnyMarkerToken = true;
    }

    const hasToken = /\{\{\s*(contenido_examen|resultado_examen)\s*\}\}/i.test(xml);
    if (hasToken) {
      contentTokenFound = true;
      insertedExamContent = true;
      xml = xml.replace(/\{\{\s*(contenido_examen|resultado_examen)\s*\}\}/gi, xmlEscape(normalized));
    }

    // Barrido final por archivo: garantiza reemplazo aunque Word haya fragmentado el token.
    if (markers && Object.keys(markers).length) {
      xml = sweepRemainingMarkers(xml, markers);
      xml = forceResolveMarkersByParagraph(xml, markers, style);
    }

    zip.file(name, xml);
  }

  // Agregar contenido al final cuando no hubo inserciï¿½n real del examen.
  if (!insertedExamContent) {
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      let xml = await docFile.async("string");
      const paragraphsXml = buildWordParagraphsXml(normalized, style);
      if (xml.includes("</w:body>")) {
        const replaced = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${paragraphsXml}${sect}`);
        xml = replaced !== xml ? replaced : xml.replace("</w:body>", `${paragraphsXml}</w:body>`);
      } else {
        xml += paragraphsXml;
      }
      zip.file("word/document.xml", xml);
    }
  }

  // Seguro final: si por formato del machote no quedaron preguntas visibles,
  // forzar inserciï¿½n del contenido del examen al final del documento.
  const docFileFinal = zip.file("word/document.xml");
  if (docFileFinal) {
    let xmlFinal = await docFileFinal.async("string");
    const plainFinal = xmlUnescape(xmlFinal.replace(/<[^>]+>/g, " "));
    const firstNumberedQuestion = String(normalized || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => /^\d+[\.\)]\s+/.test(x) || /^\d+\s*[:\-]\s*/.test(x)) || "";

    const hasRealQuestions = /\b1[\.\)]\s+/.test(plainFinal) || /\b2[\.\)]\s+/.test(plainFinal);
    const hasExamContent = firstNumberedQuestion
      ? plainFinal.includes(firstNumberedQuestion.slice(0, Math.min(firstNumberedQuestion.length, 25)))
      : hasRealQuestions;

    if (!hasExamContent) {
      const forced = buildWordParagraphsXml(normalized, style);
      if (xmlFinal.includes("</w:body>")) {
        const replaced = xmlFinal.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${forced}${sect}`);
        xmlFinal = replaced !== xmlFinal ? replaced : xmlFinal.replace("</w:body>", `${forced}</w:body>`);
      } else {
        xmlFinal += forced;
      }
      zip.file("word/document.xml", xmlFinal);
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

async function forceAppendExamToTemplate(
  templateBase64: string,
  examText: string,
  style?: { font?: string; sizePt?: number; bold?: boolean }
) {
  const zip = await JSZip.loadAsync(Buffer.from(String(templateBase64 || ""), "base64"));
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    const docFallback = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: examText || "" })] })] }] });
    return Packer.toBuffer(docFallback);
  }
  let xml = await docFile.async("string");
  const paragraphsXml = buildWordParagraphsXml(normalizeMathForWord(examText || ""), style);
  if (xml.includes("</w:body>")) {
    const replaced = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${paragraphsXml}${sect}`);
    xml = replaced !== xml ? replaced : xml.replace("</w:body>", `${paragraphsXml}</w:body>`);
  } else {
    xml += paragraphsXml;
  }
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function hardenRenderedDocx(
  renderedBuffer: Buffer,
  markers: Record<string, string>,
  examText: string,
  style?: { font?: string; sizePt?: number; bold?: boolean }
) {
  try {
    const zip = await JSZip.loadAsync(renderedBuffer);
    const doc = zip.file("word/document.xml");
    if (!doc) return { buffer: renderedBuffer, markersLeft: -1, hasQuestions: false };
    let xml = await doc.async("string");

    xml = sweepRemainingMarkers(xml, markers || {});
    xml = forceResolveMarkersByParagraph(xml, markers || {}, style);

    // Limpieza final: elimina cualquier marcador residual {{...}} para no exponer placeholders.
    xml = xml.replace(/\{\{[\s\S]{0,200}?\}\}/g, "");

    let plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));
    const hasQuestions = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);
    if (!hasQuestions) {
      const forced = buildWordParagraphsXml(normalizeMathForWord(examText || ""), style);
      if (xml.includes("</w:body>")) xml = xml.replace("</w:body>", `${forced}</w:body>`);
      else xml += forced;
      plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));
    }

    zip.file("word/document.xml", xml);
    const out = await zip.generateAsync({ type: "nodebuffer" });
    const left = (xml.match(/\{\{[\s\S]{0,200}?\}\}/g) || []).length;
    const okQ = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);
    return { buffer: out, markersLeft: left, hasQuestions: okQ, error: "" };
  } catch (err: any) {
    const msg = String(err?.message || err || "harden-error").slice(0, 180);
    return { buffer: renderedBuffer, markersLeft: -1, hasQuestions: false, error: msg };
  }
}

async function loadDefaultMachoteBase64() {
  const candidates = [
    String(process.env.EXAMEN_MACHOTE_PATH || "").trim(),
    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informï¿½tica y Comp\\CURSOS ONLINE\\Material Profe en linea\\Indicaciones prueba escrita - MACHOTE IA.docx",
    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informatica y Comp\\CURSOS ONLINE\\Material Profe en linea\\Indicaciones prueba escrita - MACHOTE IA.docx"
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      const buff = await fs.readFile(filePath);
      if (buff && buff.length > 100_000) {
        return { base64: buff.toString("base64"), path: filePath, bytes: buff.length };
      }
    } catch {
      // siguiente candidato
    }
  }

  // Bï¿½squeda adicional por nombre dentro de rutas conocidas (resiliente a tildes/ruta exacta)
  const roots = [
    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informï¿½tica y Comp\\CURSOS ONLINE\\Material Profe en linea",
    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informatica y Comp\\CURSOS ONLINE\\Material Profe en linea"
  ];
  for (const root of roots) {
    try {
      const files = await fs.readdir(root);
      const found = files.find((name) =>
        /indicaciones\s+prueba\s+escrita\s*-\s*machote\s*ia\.docx/i.test(String(name || ""))
      );
      if (found) {
        const fullPath = `${root}\\${found}`;
        const buff = await fs.readFile(fullPath);
        if (buff && buff.length > 100_000) return { base64: buff.toString("base64"), path: fullPath, bytes: buff.length };
      }
    } catch {
      // ignorar y continuar
    }
  }
  return { base64: "", path: "", bytes: 0 };
}

function replaceTemplateMarkers(text: string, markers: Record<string, string>) {
  let out = String(text || "");
  for (const [k, v] of Object.entries(markers || {})) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), String(v ?? ""));
  }
  // Aliases robustos para aï¿½o lectivo por variantes de escritura en plantillas
  const anio = String((markers as any)?.["ANO_LECTIVO"] || (markers as any)?.["ANO_LECTIVO"] || "");
  if (anio) {
    out = out.replace(/\{\{\s*A[NN]O_LECTIVO\s*\}\}/gi, anio);
    out = out.replace(/\{\{\s*A[NN]O\s+LECTIVO\s*\}\}/gi, anio);
  }
  return out;
}

function replaceKnownPlainMarkers(xml: string, markers: Record<string, string>) {
  let out = String(xml || "");
  for (const [k, v] of Object.entries(markers || {})) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), xmlEscape(String(v ?? "")));
  }
  return out;
}

function replaceMarkerLooseAcrossXml(xml: string, key: string, value: string) {
  const between = "(?:<[^>]+>|\\s)*";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyPattern = String(key || "")
    .split("")
    .map((ch) => esc(ch))
    .join(between);
  // Soporta:
  // - marcador limpio: {{KEY}}
  // - marcador con espacios: {{   KEY   }}
  // - marcador partido entre runs XML de Word
  const pattern = `\\{${between}\\{${between}${keyPattern}${between}\\}${between}\\}`;
  const re = new RegExp(pattern, "gi");
  return String(xml || "").replace(re, xmlEscape(String(value ?? "")));
}

function sweepRemainingMarkers(xml: string, markers: Record<string, string>) {
  let out = String(xml || "");
  for (const [k, v] of Object.entries(markers || {})) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Caso normal con {{KEY}}
    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), xmlEscape(String(v ?? "")));
    // Caso con marcador quebrado entre runs/estilos
    out = replaceMarkerLooseAcrossXml(out, k, String(v ?? ""));
    // Caso con una sola llave accidental por ediciï¿½n manual del machote
    out = out.replace(new RegExp(`\\{\\s*${escaped}\\s*\\}`, "gi"), xmlEscape(String(v ?? "")));
  }
  return out;
}

function parseJsonSafe(value: any) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

function tryParseExamItems(resultadoIA: string) {
  const raw = String(resultadoIA || "").trim();
  if (!raw) return [] as any[];
  const tryJson = (txt: string) => {
    try {
      const obj = JSON.parse(txt);
      const items = Array.isArray(obj?.items) ? obj.items : [];
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  };
  let items = tryJson(raw);
  if (items.length) return items;
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) items = tryJson(m[0]);
  if (items.length) return items;

  // Recuperaciï¿½n robusta cuando el JSON fue editado y quedï¿½ con basura alrededor:
  // extrae solo el array de "items" por balanceo de corchetes.
  const idx = raw.search(/"items"\s*:\s*\[/i);
  if (idx >= 0) {
    const start = raw.indexOf("[", idx);
    if (start >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < raw.length; i += 1) {
        const ch = raw[i];
        if (ch === "[") depth += 1;
        else if (ch === "]") {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end > start) {
        const onlyArray = raw.slice(start, end + 1);
        try {
          const arr = JSON.parse(onlyArray);
          if (Array.isArray(arr)) return arr;
        } catch {
          // ignora y retorna vacï¿½o
        }
      }
    }
  }
  return items;
}

function normalizeTipoItem(tipo: string) {
  const t = String(tipo || "").toUpperCase();
  if (t.includes("SR") || t.includes("SELE")) return "SR";
  if (t.includes("RCAS") || t.includes("CASO")) return "RCAS";
  if (t.includes("RC") || t.includes("CORTA")) return "RC";
  if (t === "C" || t.includes("CORRESP")) return "C";
  if (t === "I" || t.includes("IDENT")) return "I";
  if (t.includes("RE") || t.includes("EJERC")) return "RE";
  if (t.includes("RP") || t.includes("PROBL")) return "RP";
  if (t.includes("RR") || t.includes("RESTR")) return "RR";
  if (t.includes("PE") || t.includes("PRODU")) return "PE";
  return "";
}

function buildQuestionsBlockByType(items: any[], tipo: string) {
  const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);
  if (!filtered.length) return "";
  const lines: string[] = [];
  filtered.forEach((it, idx) => {
    const puntaje = Number(it?.puntaje || 0);
    lines.push(`${idx + 1}. ${String(it?.enunciado || "").trim()} (${Math.round(puntaje)} pts)`);
    const opciones = Array.isArray(it?.opciones) ? it.opciones : [];
    if (opciones.length) {
      opciones.forEach((op: any, i: number) => {
        const letra = String.fromCharCode(65 + i);
        lines.push(`   ${letra}) ${String(op || "").trim()}`);
      });
    }
  });
  return lines.join("\n");
}

function formatQuestionFromItem(item: any, index: number) {
  const puntaje = Number(item?.puntaje || 0);
  const enunciado = String(item?.enunciado || "").trim();
  const base = `${index + 1}. ${enunciado}${puntaje > 0 ? ` (${Math.round(puntaje)} pts)` : ""}`;
  const opciones = Array.isArray(item?.opciones) ? item.opciones : [];
  if (!opciones.length) return base;
  const lines = [base];
  opciones.forEach((op: any, i: number) => {
    const letra = String.fromCharCode(65 + i);
    lines.push(`   ${letra}) ${String(op || "").trim()}`);
  });
  return lines.join("\n");
}

function buildAnswerKeyBlockByType(items: any[], tipo: string) {
  const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);
  if (!filtered.length) return "";
  const lines: string[] = [];
  filtered.forEach((it, idx) => {
    const puntaje = Number(it?.puntaje || 0);
    const respuesta = String(it?.respuestaCorrecta || "").trim();
    const criterio = String(it?.criterioCorreccion || "").trim();
    lines.push(`${idx + 1}. ${respuesta || "(Sin respuesta)"}${puntaje > 0 ? ` (${Math.round(puntaje)} pts)` : ""}`);
    if (criterio) lines.push(`   Criterio: ${criterio}`);
  });
  return lines.join("\n");
}

function buildExamContentFromItems(items: any[]) {
  const order = ["SR", "RC", "C", "I", "RE", "RP", "RR", "RCAS", "PE"];
  const labels: Record<string, string> = {
    SR: "SELECCIï¿½N DE RESPUESTA",
    RC: "RESPUESTA CORTA",
    C: "CORRESPONDENCIA",
    I: "IDENTIFICACIï¿½N",
    RE: "RESOLUCIï¿½N DE EJERCICIOS",
    RP: "RESOLUCIï¿½N DE PROBLEMAS",
    RR: "RESPUESTA RESTRINGIDA",
    RCAS: "RESOLUCIï¿½N DE CASOS",
    PE: "PRODUCCIï¿½N ESCRITA"
  };
  const lines: string[] = [];
  for (const tipo of order) {
    const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);
    if (!filtered.length) continue;
    lines.push(labels[tipo]);
    filtered.forEach((it, idx) => lines.push(formatQuestionFromItem(it, idx)));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildAnswerContentFromItems(items: any[]) {
  const order = ["SR", "RC", "C", "I", "RE", "RP", "RR", "RCAS", "PE"];
  const labels: Record<string, string> = {
    SR: "CLAVE - SELECCIï¿½N DE RESPUESTA",
    RC: "CLAVE - RESPUESTA CORTA",
    C: "CLAVE - CORRESPONDENCIA",
    I: "CLAVE - IDENTIFICACIï¿½N",
    RE: "CLAVE - RESOLUCIï¿½N DE EJERCICIOS",
    RP: "CLAVE - RESOLUCIï¿½N DE PROBLEMAS",
    RR: "CLAVE - RESPUESTA RESTRINGIDA",
    RCAS: "CLAVE - RESOLUCIï¿½N DE CASOS",
    PE: "CLAVE - PRODUCCIï¿½N ESCRITA"
  };
  const lines: string[] = [];
  for (const tipo of order) {
    const block = buildAnswerKeyBlockByType(items, tipo);
    if (!block.trim()) continue;
    lines.push(labels[tipo]);
    lines.push(block);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function getDetalleTipoStats(detalleRows: any[]) {
  const stats = {
    SR: { cantidad: 0, subtotal: 0 },
    RC: { cantidad: 0, subtotal: 0 },
    C: { cantidad: 0, subtotal: 0 },
    I: { cantidad: 0, subtotal: 0 },
    RE: { cantidad: 0, subtotal: 0 },
    RP: { cantidad: 0, subtotal: 0 },
    RR: { cantidad: 0, subtotal: 0 },
    RCAS: { cantidad: 0, subtotal: 0 },
    PE: { cantidad: 0, subtotal: 0 }
  } as Record<string, { cantidad: number; subtotal: number }>;
  for (const r of detalleRows || []) {
    const d = parseJsonSafe(r.DetalleItemsJson);
    const getN = (k: string) => Number(String(d?.[k] ?? "0").replace(",", ".")) || 0;
    const add = (tipo: string, c: number, v: number) => {
      if (!stats[tipo]) return;
      stats[tipo].cantidad += c;
      stats[tipo].subtotal += c * v;
    };
    add("SR", getN("seleccionRespuestaCantidad"), getN("seleccionRespuestaPuntos"));
    add("RC", getN("respuestaCortaCantidad"), getN("respuestaCortaPuntos"));
    add("C", getN("correspondenciaCantidad"), getN("correspondenciaPuntos"));
    add("I", getN("identificacionCantidad"), getN("identificacionPuntos"));
    add("RE", getN("resolucionEjerciciosCantidad"), getN("resolucionEjerciciosPuntos"));
    add("RP", getN("resolucionProblemasCantidad"), getN("resolucionProblemasPuntos"));
    add("RR", getN("respuestaRestringidaCantidad"), getN("respuestaRestringidaPuntos"));
    add("RCAS", getN("resolucionCasosCantidad"), getN("resolucionCasosPuntos"));
    add("PE", getN("produccionEscritaCantidad"), getN("produccionEscritaPuntos"));
  }
  return stats;
}

function parseExamPayload(resultadoIA: string) {
  const raw = String(resultadoIA || "").trim();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : tryParseExamItems(raw);
  const advertencias = Array.isArray(parsed?.validacion?.advertencias)
    ? parsed.validacion.advertencias.map((x: any) => String(x))
    : [];
  return { parsed, items, raw, advertencias };
}

function parseQuestionBlocksFromPlainText(text: string) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: Record<string, string[]> = { SR: [], RC: [], C: [], I: [], RE: [], RP: [], RR: [], RCAS: [], PE: [] };
  let current = "";
  const mapHeading = (line: string) => {
    const u = line.toUpperCase();
    if (u.includes("SELECCIï¿½N DE RESPUESTA") || u.includes("SELECCION DE RESPUESTA")) return "SR";
    if (u.includes("RESPUESTA CORTA")) return "RC";
    if (u.includes("CORRESPONDENCIA")) return "C";
    if (u.includes("IDENTIFICACIï¿½N") || u.includes("IDENTIFICACION")) return "I";
    if (u.includes("RESOLUCIï¿½N DE EJERCICIOS") || u.includes("RESOLUCION DE EJERCICIOS")) return "RE";
    if (u.includes("RESOLUCIï¿½N DE PROBLEMAS") || u.includes("RESOLUCION DE PROBLEMAS")) return "RP";
    if (u.includes("RESPUESTA RESTRINGIDA")) return "RR";
    if (u.includes("RESOLUCIï¿½N DE CASOS") || u.includes("RESOLUCION DE CASOS")) return "RCAS";
    if (u.includes("PRODUCCIï¿½N ESCRITA") || u.includes("PRODUCCION ESCRITA")) return "PE";
    return "";
  };
  for (const ln of lines) {
    const maybe = mapHeading(ln);
    if (maybe) { current = maybe; continue; }
    if (!current) continue;
    if (/^\d+[\.\)]\s+/.test(ln) || /^[-*]\s+/.test(ln)) {
      blocks[current].push(ln);
    }
  }
  return Object.fromEntries(Object.entries(blocks).map(([k, arr]) => [k, arr.join("\n")]));
}

function injectAfterHeading(xml: string, headingRegex: RegExp, blockText: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  if (!blockText.trim()) return xml;
  return xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (pXml) => {
    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));
    if (!headingRegex.test(plain)) return pXml;
    const add = buildWordParagraphsXml(`\n${blockText}`, style);
    return `${pXml}${add}`;
  });
}

function pruneEmptySectionHeading(xml: string, headingRegex: RegExp, shouldPrune: boolean) {
  if (!shouldPrune) return xml;
  return xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (pXml) => {
    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));
    return headingRegex.test(plain) ? "" : pXml;
  });
}

function replaceBlockMarkerParagraph(xml: string, marker: string, blockText: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  if (!blockText.trim()) return xml;
  const key = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<w:p[\\s\\S]*?\\{\\{\\s*${key}\\s*\\}\\}[\\s\\S]*?<\\/w:p>`, "gi");
  const replacement = buildWordParagraphsXml(blockText, style);
  return xml.replace(regex, replacement);
}

function xmlUnescape(text: string) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function buildWordNumPagesFieldXml(style?: { font?: string; sizePt?: number; bold?: boolean }) {
  const font = String(style?.font || "Calibri").trim() || "Calibri";
  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;
  const halfPts = Math.round(sizePt * 2);
  const bold = style?.bold ? "<w:b/><w:bCs/>" : "";
  return `<w:fldSimple w:instr=" NUMPAGES \\\\* MERGEFORMAT "><w:r><w:rPr>${bold}<w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;
}

function injectNumPagesFieldMarker(xml: string, marker: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  const fieldXml = buildWordNumPagesFieldXml(style);
  const token = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const runTokenRegex = new RegExp(
    `<w:r[\\s\\S]*?<w:t[^>]*>\\s*\\{\\{\\s*${token}\\s*\\}\\}\\s*<\\/w:t>[\\s\\S]*?<\\/w:r>`,
    "gi"
  );
  let out = String(xml || "").replace(runTokenRegex, fieldXml);
  // fallback solo token textual (si no viene en run limpio)
  out = out.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "gi"), "1");
  return out;
}

function replaceMarkersInParagraphXml(xml: string, markers: Record<string, string>, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  let replacedAny = false;
  const font = String(style?.font || "Calibri").trim() || "Calibri";
  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;
  const halfPts = Math.round(sizePt * 2);
  const bold = style?.bold ? "<w:b/><w:bCs/>" : "";
  const runProps = `<w:rPr>${bold}<w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr>`;
  const out = xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (pXml) => {
    const pPr = (pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/) || [])[0] || "";
    const textRaw = pXml.replace(/<[^>]+>/g, "");
    let text = xmlUnescape(textRaw);
    const before = text;
    for (const [k, v] of Object.entries(markers || {})) {
      text = text.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "gi"), String(v ?? ""));
    }
    if (text === before) return pXml;
    replacedAny = true;
    return `<w:p>${pPr}<w:r>${runProps}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
  });
  return { xml: out, replacedAny };
}

function estimateDocumentPages(text: string) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  const estimated = Math.max(1, Math.ceil(lines / 38));
  return estimated;
}

function replaceMarkersAcrossRuns(xml: string, markers: Record<string, string>) {
  let out = String(xml || "");
  let replacedAny = false;
  const between = "(?:<[^>]+>|\\s)*";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [k, v] of Object.entries(markers || {})) {
    const token = `{{${k}}}`;
    const chars = token.split("").map((ch) => esc(ch)).join(between);
    const re = new RegExp(chars, "gi");
    const before = out;
    out = out.replace(re, xmlEscape(String(v ?? "")));
    if (out !== before) replacedAny = true;
  }
  return { xml: out, replacedAny };
}

function normalizeMarkerName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9_ ]/gi, "")
    .replace(/\s+/g, "_")
    .toUpperCase()
    .trim();
}

function forceResolveMarkersByParagraph(xml: string, markers: Record<string, string>, style?: { font?: string; sizePt?: number; bold?: boolean }) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(markers || {})) {
    map.set(normalizeMarkerName(k), String(v ?? ""));
  }
  const font = String(style?.font || "Calibri").trim() || "Calibri";
  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;
  const halfPts = Math.round(sizePt * 2);
  const runProps = `<w:rPr><w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr>`;

  return String(xml || "").replace(/<w:p[\s\S]*?<\/w:p>/g, (pXml) => {
    const pPr = (pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/) || [])[0] || "";
    const textRaw = pXml.replace(/<[^>]+>/g, "");
    let text = xmlUnescape(textRaw);
    if (!text.includes("{{") || !text.includes("}}")) return pXml;
    const before = text;
    text = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, keyRaw) => {
      const key = normalizeMarkerName(String(keyRaw || ""));
      return map.has(key) ? String(map.get(key)) : "";
    });
    if (text === before) return pXml;
    return `<w:p>${pPr}<w:r>${runProps}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
  });
}

function normalizeKey(value: any) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function assertCanAccess(req: any, res: any) {
  if (isSuperAdmin(req) || isInstitutionAdmin(req) || isProfesor(req)) return true;
  forbidden(res, "No tenÃ©s permisos para acceder al mÃ³dulo de evaluaciÃ³n");
  return false;
}
async function ensurePlantillaVisibilityColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionPlantilla
      ADD UsuarioCreadorId INT NULL;
    END;

    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'EsPublica') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionPlantilla
      ADD EsPublica BIT NOT NULL CONSTRAINT DF_EvaluacionPlantilla_EsPublica_eval360 DEFAULT(1);
    END;
  `);
}

async function ensurePromptIATemplateVisibilityColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.PlantillaPromptIA', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD UsuarioCreadorId INT NULL;
    END;

    IF COL_LENGTH('dbo.PlantillaPromptIA', 'EsPublica') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD EsPublica BIT NOT NULL CONSTRAINT DF_PlantillaPromptIA_EsPublica_eval360 DEFAULT(1);
    END;
  `);
}

async function ensureEval360ActividadPlaneamientoColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Eval360_Actividad', 'UsaIndicadoresPlaneamiento') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_Actividad
      ADD UsaIndicadoresPlaneamiento BIT NOT NULL CONSTRAINT DF_Eval360_Actividad_UsaIndicadoresPlaneamiento DEFAULT(0);
    END;
  `);
}

async function getAsignacionPermitida(req: any, res: any, input: {
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
}) {
  if (!assertCanAccess(req, res)) return null;

  const pool = await getPool();
  const userId = getUserId(req);

  const request = pool.request()
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, userId || null);

  let filtroInstitucion = "";
  if (!isSuperAdmin(req)) {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return null;
    request.input("institucionId", sql.Int, institucionId);
    filtroInstitucion = "AND ad.InstitucionId = @institucionId";
  }

  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
    ? "AND ad.UsuarioId = @usuarioId"
    : "";

  const result = await request.query(`
    SELECT TOP 1
      ad.AsignacionDocenteId,
      ad.UsuarioId,
      ad.InstitucionId,
      ad.GrupoId,
      g.Nombre AS GrupoNombre,
      g.Nivel AS GrupoNivel,
      ad.MateriaId,
      m.Nombre AS MateriaNombre,
      ad.AnioLectivoId,
      al.Nombre AS AnioNombre,
      ad.PeriodoId,
      p.Nombre AS PeriodoNombre
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
    LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
    WHERE ad.Activo = 1
      AND ad.GrupoId = @grupoId
      AND ad.MateriaId = @materiaId
      AND ad.AnioLectivoId = @anioLectivoId
      AND ad.PeriodoId = @periodoId
      ${filtroInstitucion}
      ${filtroProfesor}
  `);

  if (!result.recordset[0]) {
    forbidden(res, "No tenÃ©s permisos para trabajar con ese grupo, materia y periodo");
    return null;
  }

  return result.recordset[0];
}

async function getCatalogoComponentes(pool: any) {
  const result = await pool.request().query(`
    SELECT ComponenteCatalogoId, Nombre, Descripcion, Activo
    FROM dbo.Eval360_ComponenteCatalogo
    WHERE Activo = 1
    ORDER BY ComponenteCatalogoId
  `);

  return result.recordset;
}

function inferComponenteCatalogoId(nombreComponente: string, catalogo: any[]) {
  const key = normalizeKey(nombreComponente);

  const exact = catalogo.find((item) => normalizeKey(item.Nombre) === key);
  if (exact) return Number(exact.ComponenteCatalogoId);

  const reglas: Array<{ palabras: string[]; nombreCatalogo: string }> = [
    { palabras: ["COTIDIANO"], nombreCatalogo: "Trabajo cotidiano" },
    { palabras: ["TAREA"], nombreCatalogo: "Tareas" },
    { palabras: ["PROYECTO"], nombreCatalogo: "Proyecto" },
    { palabras: ["EXAM", "EXAMEN", "PRUEBA"], nombreCatalogo: "Pruebas" },
    { palabras: ["SUMATIVA", "INSTRUMENTO"], nombreCatalogo: "Instrumento de evaluaciÃ³n sumativa" },
    { palabras: ["PORTAFOLIO"], nombreCatalogo: "Portafolio de evidencias" },
    { palabras: ["DEMOSTRACION", "APRENDIDO"], nombreCatalogo: "DemostraciÃ³n de lo aprendido" },
    { palabras: ["ASISTENCIA"], nombreCatalogo: "Asistencia" }
  ];

  for (const regla of reglas) {
    if (regla.palabras.some((palabra) => key.includes(palabra))) {
      const match = catalogo.find((item) => normalizeKey(item.Nombre) === normalizeKey(regla.nombreCatalogo));
      if (match) return Number(match.ComponenteCatalogoId);
    }
  }

  return Number(catalogo[0]?.ComponenteCatalogoId || 1);
}


async function sincronizarEstructuraConPlantilla(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {
  if (!estructuraGrupoId || !plantillaBaseId) return;
  await ensureEval360ActividadPlaneamientoColumns(pool);
  await ensureEval360SeguimientoRecuperacionColumns(pool);

  const catalogo = await getCatalogoComponentes(pool);

  const componentesResult = await pool.request()
    .input("plantillaBaseId", sql.Int, plantillaBaseId)
    .query(`
      SELECT
        ec.EvaluacionComponenteId,
        COALESCE(NULLIF(LTRIM(RTRIM(ec.Nombre)), N''), ec.Descripcion) AS NombreComponente,
        ec.Descripcion,
        ec.Porcentaje,
        ec.Orden,
        ec.TipoSeguimiento,
        ec.PermitePlaneamiento
      FROM dbo.EvaluacionComponente ec
      WHERE ec.EvaluacionPlantillaId = @plantillaBaseId
        AND ISNULL(ec.Activo, 1) = 1
      ORDER BY ec.Orden, ec.EvaluacionComponenteId
    `);

  const componentes = componentesResult.recordset || [];
  if (!componentes.length) return;

  let detallesResult = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT *
      FROM dbo.Eval360_EstructuraGrupoDetalle
      WHERE EstructuraGrupoId = @estructuraGrupoId
        AND ISNULL(Activo, 1) = 1
    `);

  let detalles = detallesResult.recordset || [];

  for (const componente of componentes) {
    const nombre = normalizeText(componente.NombreComponente || componente.Descripcion);
    if (!nombre) continue;

    const existeDetalle = detalles.some((detalle: any) => normalizeKey(detalle.Nombre) === normalizeKey(nombre));
    if (!existeDetalle) {
      const componenteCatalogoId = inferComponenteCatalogoId(nombre, catalogo);
      await pool.request()
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("componenteCatalogoId", sql.Int, componenteCatalogoId)
        .input("nombre", sql.NVarChar(150), nombre)
        .input("porcentaje", sql.Decimal(5, 2), Number(componente.Porcentaje || 0))
        .input("orden", sql.Int, Number(componente.Orden || 1))
        .query(`
          INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
            (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
          VALUES
            (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())
        `);
    }
  }

  detallesResult = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT *
      FROM dbo.Eval360_EstructuraGrupoDetalle
      WHERE EstructuraGrupoId = @estructuraGrupoId
        AND ISNULL(Activo, 1) = 1
    `);
  detalles = detallesResult.recordset || [];

  for (const componente of componentes) {
    const nombreComponente = normalizeText(componente.NombreComponente || componente.Descripcion);
    const detalle = detalles.find((item: any) => normalizeKey(item.Nombre) === normalizeKey(nombreComponente));
    if (!detalle) continue;

    const actividadesPlantilla = await pool.request()
      .input("evaluacionComponenteId", sql.Int, Number(componente.EvaluacionComponenteId))
      .query(`
        SELECT
          EvaluacionActividadId,
          Descripcion,
          ISNULL(UsaIndicadoresPlaneamiento, 0) AS UsaIndicadoresPlaneamiento,
          Porcentaje,
          Fecha,
          Orden
        FROM dbo.EvaluacionActividad
        WHERE EvaluacionComponenteId = @evaluacionComponenteId
          AND ISNULL(Activo, 1) = 1
        ORDER BY Orden, EvaluacionActividadId
      `);

    for (const actividad of actividadesPlantilla.recordset || []) {
      const nombreActividad = normalizeText(actividad.Descripcion || `Actividad ${actividad.EvaluacionActividadId}`);
      if (!nombreActividad) continue;

      const existeActividad = await pool.request()
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("estructuraGrupoDetalleId", sql.Int, Number(detalle.EstructuraGrupoDetalleId))
        .input("nombre", sql.NVarChar(200), nombreActividad)
        .query(`
          SELECT TOP 1 ActividadId
          FROM dbo.Eval360_Actividad
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
            AND ISNULL(Activo, 1) = 1
            AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
        `);

      if (!existeActividad.recordset[0]) {
        await pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .input("estructuraGrupoDetalleId", sql.Int, Number(detalle.EstructuraGrupoDetalleId))
          .input("nombre", sql.NVarChar(200), nombreActividad)
          .input("descripcion", sql.NVarChar(sql.MAX), actividad.Descripcion || null)
          .input("fecha", sql.Date, actividad.Fecha || null)
          .input("puntosMaximos", sql.Decimal(10, 2), 100)
          .input("porcentajeDentroRubro", sql.Decimal(5, 2), Number(actividad.Porcentaje || 0))
          .input("usaIndicadoresPlaneamiento", sql.Bit, Boolean(actividad.UsaIndicadoresPlaneamiento))
          .input("fuente", sql.NVarChar(50), "Plantilla")
          .query(`
            INSERT INTO dbo.Eval360_Actividad
              (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)
            VALUES
              (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, @fecha, @puntosMaximos, @porcentajeDentroRubro, @usaIndicadoresPlaneamiento, @fuente, 1, SYSDATETIME())
          `);
      } else {
        await pool.request()
          .input("actividadId", sql.Int, Number(existeActividad.recordset[0].ActividadId))
          .input("usaIndicadoresPlaneamiento", sql.Bit, Boolean(actividad.UsaIndicadoresPlaneamiento))
          .query(`
            UPDATE dbo.Eval360_Actividad
            SET UsaIndicadoresPlaneamiento = @usaIndicadoresPlaneamiento,
                UpdatedAt = SYSDATETIME()
            WHERE ActividadId = @actividadId
          `);
      }
    }
  }
}


async function estructuraNecesitaSincronizacion(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {
  if (!estructuraGrupoId || !plantillaBaseId) return false;

  const faltantes = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("plantillaBaseId", sql.Int, plantillaBaseId)
    .query(`
      SELECT
        SUM(CASE WHEN d.EstructuraGrupoDetalleId IS NULL THEN 1 ELSE 0 END) AS ComponentesFaltantes,
        SUM(CASE WHEN ea.EvaluacionActividadId IS NOT NULL AND a.ActividadId IS NULL THEN 1 ELSE 0 END) AS ActividadesFaltantes
      FROM dbo.EvaluacionComponente ec
      OUTER APPLY (
        SELECT TOP 1 d.EstructuraGrupoDetalleId
        FROM dbo.Eval360_EstructuraGrupoDetalle d
        WHERE d.EstructuraGrupoId = @estructuraGrupoId
          AND ISNULL(d.Activo, 1) = 1
          AND UPPER(LTRIM(RTRIM(d.Nombre))) = UPPER(LTRIM(RTRIM(COALESCE(NULLIF(ec.Nombre, N''), ec.Descripcion))))
      ) d
      OUTER APPLY (
        SELECT TOP 1 ea.EvaluacionActividadId, ea.Descripcion
        FROM dbo.EvaluacionActividad ea
        WHERE ea.EvaluacionComponenteId = ec.EvaluacionComponenteId
          AND ISNULL(ea.Activo, 1) = 1
      ) ea
      OUTER APPLY (
        SELECT TOP 1 a.ActividadId
        FROM dbo.Eval360_Actividad a
        WHERE a.EstructuraGrupoId = @estructuraGrupoId
          AND d.EstructuraGrupoDetalleId IS NOT NULL
          AND a.EstructuraGrupoDetalleId = d.EstructuraGrupoDetalleId
          AND ISNULL(a.Activo, 1) = 1
          AND ea.EvaluacionActividadId IS NOT NULL
          AND UPPER(LTRIM(RTRIM(a.Nombre))) = UPPER(LTRIM(RTRIM(COALESCE(NULLIF(ea.Descripcion, N''), CONCAT(N'Actividad ', ea.EvaluacionActividadId)))))
      ) a
      WHERE ec.EvaluacionPlantillaId = @plantillaBaseId
        AND ISNULL(ec.Activo, 1) = 1
    `);

  const row = faltantes.recordset[0] || {};
  return Number(row.ComponentesFaltantes || 0) > 0 || Number(row.ActividadesFaltantes || 0) > 0;
}

async function sincronizarEstructuraConPlantillaSiFaltan(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {
  if (!estructuraGrupoId || !plantillaBaseId) return;
  await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, plantillaBaseId);
}

async function getEstructuraCompleta(pool: any, estructuraGrupoId: number) {
  const estructura = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT TOP 1
        eg.*,
        g.Nombre AS GrupoNombre,
        m.Nombre AS MateriaNombre,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre,
        ep.Nombre AS PlantillaBaseNombre
      FROM dbo.Eval360_EstructuraGrupo eg
      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
      INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId
      LEFT JOIN dbo.EvaluacionPlantilla ep ON ep.EvaluacionPlantillaId = eg.PlantillaBaseId
      WHERE eg.EstructuraGrupoId = @estructuraGrupoId
    `);

  const detalles = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT
        d.*,
        c.Nombre AS ComponenteCatalogoNombre
      FROM dbo.Eval360_EstructuraGrupoDetalle d
      INNER JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId
      WHERE d.EstructuraGrupoId = @estructuraGrupoId
      ORDER BY d.Orden, d.EstructuraGrupoDetalleId
    `);

  const niveles = await pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT *
      FROM dbo.Eval360_NivelDesempenoGrupo
      WHERE EstructuraGrupoId = @estructuraGrupoId
      ORDER BY Orden, NivelDesempenoGrupoId
    `);

  return {
    estructura: estructura.recordset[0] || null,
    detalles: detalles.recordset,
    niveles: niveles.recordset
  };
}

router.get("/componentes-catalogo", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const pool = await getPool();
    const catalogo = await getCatalogoComponentes(pool);
    return ok(res, catalogo);
  } catch (error) {
    console.error("Error listando componentes Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los componentes" });
  }
});

router.get("/plantillas", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const materiaId = toOptionalNumber(req.query.materiaId);
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId);

    const filtroActivo = incluirInactivas ? "" : "AND ep.Activo = 1";
    const filtroVisibilidadProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)"
      : "";

    const result = await request.query(`
      SELECT
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        ep.AnioLectivoId,
        al.Nombre AS AnioNombre,
        ep.PeriodoId,
        p.Nombre AS PeriodoNombre,
        ep.MateriaId,
        m.Nombre AS MateriaNombre,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo,
        SUM(CASE WHEN ec.Activo = 1 THEN ISNULL(ec.Porcentaje, 0) ELSE 0 END) AS TotalPorcentaje
      FROM dbo.EvaluacionPlantilla ep
      LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId
      LEFT JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionPlantillaId = ep.EvaluacionPlantillaId
      WHERE ep.InstitucionId = @institucionId
        ${filtroActivo}
        AND (@anioLectivoId IS NULL OR ep.AnioLectivoId = @anioLectivoId)
        AND (@periodoId IS NULL OR ep.PeriodoId = @periodoId)
        AND (@materiaId IS NULL OR ep.MateriaId = @materiaId)
        ${filtroVisibilidadProfesor}
      GROUP BY
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        ep.AnioLectivoId,
        al.Nombre,
        ep.PeriodoId,
        p.Nombre,
        ep.MateriaId,
        m.Nombre,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo
      ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
    `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando plantillas Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas de evaluaciÃ³n" });
  }
});

router.get("/plantillas/:id/detalle", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();
    await ensurePlantillaVisibilityColumns(pool);
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const plantillaId = toRequiredNumber(req.params.id, "plantillaId", res);
    if (plantillaId === null) return;

    const plantilla = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        SELECT
          ep.*,
          al.Nombre AS AnioNombre,
          p.Nombre AS PeriodoNombre,
          m.Nombre AS MateriaNombre
        FROM dbo.EvaluacionPlantilla ep
        LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId
        LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId
        WHERE ep.EvaluacionPlantillaId = @plantillaId
          AND ep.InstitucionId = @institucionId
          ${isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)" : ""}
      `);

    if (!plantilla.recordset[0]) return badRequest(res, "No se encontrÃ³ la plantilla indicada");

    const componentes = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        SELECT
          ec.EvaluacionComponenteId,
          ec.EvaluacionPlantillaId,
          ec.Descripcion,
          ec.Nombre,
          ec.Porcentaje,
          ec.Orden,
          ec.Activo
        FROM dbo.EvaluacionComponente ec
        WHERE ec.EvaluacionPlantillaId = @plantillaId
        ORDER BY ec.Orden, ec.EvaluacionComponenteId
      `);

    return ok(res, {
      plantilla: plantilla.recordset[0],
      componentes: componentes.recordset
    });
  } catch (error) {
    console.error("Error cargando detalle de plantilla Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el detalle de la plantilla" });
  }
});

router.get("/estructuras/grupo", async (req, res) => {
  try {
    const grupoId = toRequiredNumber(req.query.grupoId, "grupoId", res);
    const materiaId = toRequiredNumber(req.query.materiaId, "materiaId", res);
    const anioLectivoId = toRequiredNumber(req.query.anioLectivoId, "anioLectivoId", res);
    const periodoId = toRequiredNumber(req.query.periodoId, "periodoId", res);
    if ([grupoId, materiaId, anioLectivoId, periodoId].some((value) => value === null)) return;

    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId });
    if (!asignacion) return;

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    const estructura = result.recordset[0];
    if (!estructura) return ok(res, null);

    const data = await getEstructuraCompleta(pool, Number(estructura.EstructuraGrupoId));
    return ok(res, data);
  } catch (error) {
    console.error("Error cargando estructura Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la estructura de evaluaciÃ³n" });
  }
});

router.get("/estructuras/:id", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();
    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);
    if (estructuraGrupoId === null) return;

    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const data = await getEstructuraCompleta(pool, estructuraGrupoId);
    if (!data.estructura || (!isSuperAdmin(req) && Number(data.estructura.InstitucionId) !== institucionId)) {
      return forbidden(res, "No tenÃ©s permisos para ver esta estructura");
    }

    return ok(res, data);
  } catch (error) {
    console.error("Error cargando estructura por id Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la estructura de evaluaciÃ³n" });
  }
});

router.post("/estructuras/crear-desde-plantilla", async (req, res) => {
  const pool = await getPool();
  await ensurePlantillaVisibilityColumns(pool);
  const transaction = new sql.Transaction(pool);

  try {
    const grupoId = toRequiredNumber(req.body.grupoId, "grupoId", res);
    const materiaId = toRequiredNumber(req.body.materiaId, "materiaId", res);
    const anioLectivoId = toRequiredNumber(req.body.anioLectivoId, "anioLectivoId", res);
    const periodoId = toRequiredNumber(req.body.periodoId, "periodoId", res);
    const plantillaId = toOptionalNumber(req.body.plantillaId || req.body.evaluacionPlantillaId);
    const nombrePersonalizado = normalizeText(req.body.nombre);

    if ([grupoId, materiaId, anioLectivoId, periodoId].some((value) => value === null)) return;

    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId });
    if (!asignacion) return;

    const existente = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT TOP 1 EstructuraGrupoId, PlantillaBaseId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    const estructuraExistente = existente.recordset[0] || null;

    if (estructuraExistente && !plantillaId) {
      await sincronizarEstructuraConPlantillaSiFaltan(pool, Number(estructuraExistente.EstructuraGrupoId), Number(estructuraExistente.PlantillaBaseId || 0));
      const data = await getEstructuraCompleta(pool, Number(estructuraExistente.EstructuraGrupoId));
      return ok(res, { ...data, creada: false }, "Ya existe una estructura de evaluacion para este grupo");
    }

    if (estructuraExistente && plantillaId && Number(estructuraExistente.PlantillaBaseId || 0) !== Number(plantillaId)) {
      const calificacionesExistentes = await pool.request()
        .input("estructuraGrupoId", sql.Int, Number(estructuraExistente.EstructuraGrupoId))
        .query(`
          SELECT
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM dbo.Eval360_NotaActividad na
                INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = na.ActividadId
                WHERE act.EstructuraGrupoId = @estructuraGrupoId
                  AND (
                    (na.PuntosObtenidos IS NOT NULL AND na.PuntosObtenidos > 0)
                    OR (na.PorcentajeObtenido IS NOT NULL AND na.PorcentajeObtenido > 0)
                  )
              )
              OR EXISTS (
                SELECT 1
                FROM dbo.Eval360_SeguimientoIndicador si
                INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = si.ActividadId
                WHERE act.EstructuraGrupoId = @estructuraGrupoId
                  AND ISNULL(si.ValorSeleccionado, 0) > 0
              )
              OR EXISTS (
                SELECT 1
                FROM dbo.Eval360_EstructuraGrupo eg
                INNER JOIN dbo.AsistenciaRegistro ar
                  ON ar.GrupoId = eg.GrupoId
                 AND ar.MateriaId = eg.MateriaId
                 AND ar.AnioLectivoId = eg.AnioLectivoId
                 AND ar.PeriodoId = eg.PeriodoId
                WHERE eg.EstructuraGrupoId = @estructuraGrupoId
              )
              THEN 1
              ELSE 0
            END AS TieneCalificaciones
        `);

      if (Number(calificacionesExistentes.recordset[0]?.TieneCalificaciones || 0) === 1) {
        return badRequest(res, "No se puede cambiar la plantilla porque ya existen rubros calificados");
      }
    }

    const plantillaRequest = pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("plantillaId", sql.Int, plantillaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId);

    const plantillaResult = await plantillaRequest.query(`
      SELECT TOP 1
        ep.*,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre,
        m.Nombre AS MateriaNombre
      FROM dbo.EvaluacionPlantilla ep
      LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId
      WHERE ep.InstitucionId = @institucionId
        AND ep.Activo = 1
        AND (@plantillaId IS NULL OR ep.EvaluacionPlantillaId = @plantillaId)
        AND (@plantillaId IS NOT NULL OR ep.AnioLectivoId = @anioLectivoId)
        AND (@plantillaId IS NOT NULL OR ep.PeriodoId = @periodoId)
        AND (@plantillaId IS NOT NULL OR ep.MateriaId = @materiaId)
        ${isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)" : ""}
      ORDER BY
        CASE WHEN @plantillaId IS NOT NULL AND ep.EvaluacionPlantillaId = @plantillaId THEN 0 ELSE 1 END,
        CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END,
        ep.EvaluacionPlantillaId DESC
    `);

    const plantilla = plantillaResult.recordset[0];
    if (!plantilla) return badRequest(res, "No se encontrÃ³ una plantilla de evaluaciÃ³n activa para este grupo, materia y periodo");

    const componentesResult = await pool.request()
      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .query(`
        SELECT
          EvaluacionComponenteId,
          EvaluacionPlantillaId,
          COALESCE(NULLIF(LTRIM(RTRIM(Nombre)), N''), Descripcion) AS NombreComponente,
          Descripcion,
          Porcentaje,
          Orden,
          Activo
        FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId
          AND Activo = 1
        ORDER BY Orden, EvaluacionComponenteId
      `);

    const componentes = componentesResult.recordset;
    if (!componentes.length) return badRequest(res, "La plantilla seleccionada no tiene componentes activos");

    const total = componentes.reduce((sum: number, item: any) => sum + Number(item.Porcentaje || 0), 0);
    if (Number(total.toFixed(2)) !== 100) {
      return badRequest(res, `La plantilla seleccionada suma ${total.toFixed(2)}%. Debe sumar 100% para poder aplicarse`);
    }

    const catalogo = await getCatalogoComponentes(pool);


    await transaction.begin();

    if (estructuraExistente) {
      await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, Number(estructuraExistente.EstructuraGrupoId))
        .query(`
          UPDATE dbo.Eval360_EstructuraGrupo
          SET Activo = 0, UpdatedAt = SYSDATETIME()
          WHERE EstructuraGrupoId = @estructuraGrupoId
        `);
    }

    const estructuraResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req)) || null)
      .input("plantillaBaseId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .input("nombre", sql.NVarChar(200), nombrePersonalizado || `${plantilla.Nombre} - ${asignacion.GrupoNombre}`)
      .input("totalPorcentaje", sql.Decimal(5, 2), 100)
      .query(`
        INSERT INTO dbo.Eval360_EstructuraGrupo
          (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
        OUTPUT INSERTED.EstructuraGrupoId
        VALUES
          (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, @totalPorcentaje, 1, SYSDATETIME())
      `);

    const estructuraGrupoId = Number(estructuraResult.recordset[0].EstructuraGrupoId);

    for (const item of componentes) {
      const nombre = normalizeText(item.NombreComponente || item.Descripcion);
      const componenteCatalogoId = inferComponenteCatalogoId(nombre, catalogo);

      await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("componenteCatalogoId", sql.Int, componenteCatalogoId)
        .input("nombre", sql.NVarChar(150), nombre)
        .input("porcentaje", sql.Decimal(5, 2), Number(item.Porcentaje || 0))
        .input("orden", sql.Int, Number(item.Orden || 1))
        .query(`
          INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
            (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
          VALUES
            (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())
        `);
    }

    const nivelesGlobales = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .query(`
        SELECT Nombre, Valor, Orden
        FROM dbo.Eval360_NivelDesempenoGlobal
        WHERE InstitucionId = @institucionId
          AND Activo = 1
        ORDER BY Orden
      `);

    const niveles = nivelesGlobales.recordset.length
      ? nivelesGlobales.recordset
      : [
          { Nombre: "Avanzado", Valor: 3, Orden: 1 },
          { Nombre: "Intermedio", Valor: 2, Orden: 2 },
          { Nombre: "Inicial", Valor: 1, Orden: 3 }
        ];

    for (const nivel of niveles) {
      await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("nombre", sql.NVarChar(100), nivel.Nombre)
        .input("valor", sql.Decimal(5, 2), Number(nivel.Valor || 0))
        .input("orden", sql.Int, Number(nivel.Orden || 1))
        .query(`
          INSERT INTO dbo.Eval360_NivelDesempenoGrupo
            (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
          VALUES
            (@estructuraGrupoId, @nombre, @valor, @orden, 1)
        `);
    }

    await transaction.commit();

    await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(plantilla.EvaluacionPlantillaId));

    const data = await getEstructuraCompleta(pool, estructuraGrupoId);
    return created(res, { ...data, creada: true }, "Estructura de evaluaciÃ³n creada correctamente");
  } catch (error) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}
    console.error("Error creando estructura Eval360 desde plantilla:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear la estructura de evaluaciÃ³n" });
  }
});

router.put("/estructuras/:id/detalles", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);
    if (estructuraGrupoId === null) return;

    const detalles = Array.isArray(req.body.detalles) ? req.body.detalles : [];
    if (!detalles.length) return badRequest(res, "DebÃ©s enviar al menos un rubro de evaluaciÃ³n");

    const total = detalles
      .filter((item: any) => item.activo !== false && item.Activo !== false)
      .reduce((sum: number, item: any) => sum + Number(item.porcentaje ?? item.Porcentaje ?? 0), 0);

    if (Number(total.toFixed(2)) !== 100) {
      return badRequest(res, `La estructura suma ${total.toFixed(2)}%. Debe sumar 100%`);
    }

    const estructura = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_EstructuraGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1
      `);

    const row = estructura.recordset[0];
    if (!row) return badRequest(res, "No se encontrÃ³ la estructura indicada");

    const asignacion = await getAsignacionPermitida(req, res, {
      grupoId: Number(row.GrupoId),
      materiaId: Number(row.MateriaId),
      anioLectivoId: Number(row.AnioLectivoId),
      periodoId: Number(row.PeriodoId)
    });
    if (!asignacion) return;

    await transaction.begin();

    for (const item of detalles) {
      const id = toOptionalNumber(item.estructuraGrupoDetalleId ?? item.EstructuraGrupoDetalleId);
      const componenteCatalogoId = toRequiredNumber(item.componenteCatalogoId ?? item.ComponenteCatalogoId, "componenteCatalogoId", res);
      const nombre = normalizeText(item.nombre ?? item.Nombre);
      const porcentaje = Number(item.porcentaje ?? item.Porcentaje ?? 0);
      const orden = Number(item.orden ?? item.Orden ?? 1);
      const activo = item.activo === false || item.Activo === false ? 0 : 1;

      if (componenteCatalogoId === null) return;
      if (!nombre) return badRequest(res, "Todos los rubros deben tener nombre");

      if (id) {
        await new sql.Request(transaction)
          .input("id", sql.Int, id)
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .input("componenteCatalogoId", sql.Int, componenteCatalogoId)
          .input("nombre", sql.NVarChar(150), nombre)
          .input("porcentaje", sql.Decimal(5, 2), porcentaje)
          .input("orden", sql.Int, orden)
          .input("activo", sql.Bit, activo)
          .query(`
            UPDATE dbo.Eval360_EstructuraGrupoDetalle
            SET ComponenteCatalogoId = @componenteCatalogoId,
                Nombre = @nombre,
                Porcentaje = @porcentaje,
                Orden = @orden,
                Activo = @activo,
                UpdatedAt = SYSDATETIME()
            WHERE EstructuraGrupoDetalleId = @id
              AND EstructuraGrupoId = @estructuraGrupoId
          `);
      } else {
        await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .input("componenteCatalogoId", sql.Int, componenteCatalogoId)
          .input("nombre", sql.NVarChar(150), nombre)
          .input("porcentaje", sql.Decimal(5, 2), porcentaje)
          .input("orden", sql.Int, orden)
          .input("activo", sql.Bit, activo)
          .query(`
            INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
              (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
            VALUES
              (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, @activo, SYSDATETIME())
          `);
      }
    }

    await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("total", sql.Decimal(5, 2), 100)
      .query(`
        UPDATE dbo.Eval360_EstructuraGrupo
        SET TotalPorcentaje = @total,
            UpdatedAt = SYSDATETIME()
        WHERE EstructuraGrupoId = @estructuraGrupoId
      `);

    await transaction.commit();

    await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(row.PlantillaBaseId || 0));

    const data = await getEstructuraCompleta(pool, estructuraGrupoId);
    return ok(res, data, "Estructura de evaluaciÃ³n actualizada correctamente");
  } catch (error) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}
    console.error("Error actualizando detalles Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la estructura de evaluaciÃ³n" });
  }
});


function parseJsonSeguro(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function splitTextLines(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        return String(
          item.Descripcion
          || item.descripcion
          || item.Indicador
          || item.indicador
          || item.indicadorBase
          || item.texto
          || item.nombre
          || ""
        ).trim();
      }

      return String(item || "").trim();
    }).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueTextList(items: string[]) {
  const map = new Map<string, string>();

  for (const item of items || []) {
    const limpio = String(item || "").trim();
    if (!limpio) continue;

    const key = normalizeKey(limpio);
    if (!map.has(key)) map.set(key, limpio);
  }

  return Array.from(map.values());
}

function construirIndicadoresFallback(indicadoresBase: string[]) {
  return indicadoresBase.map((base) => ({
    indicadorBase: base,
    indicadorAvanzado: base,
    indicadorIntermedio: generarIndicadorIntermedio(base),
    indicadorInicial: generarIndicadorInicial(base)
  }));
}

function generarIndicadorIntermedio(base: string) {
  const texto = String(base || "").trim();
  if (!texto) return "";

  return `${texto} con apoyo parcial de la persona docente, utilizando procedimientos guiados y recursos de apoyo.`;
}

function generarIndicadorInicial(base: string) {
  const texto = String(base || "").trim();
  if (!texto) return "";

  return `${texto} de forma inicial, con apoyo constante, ejemplos modelados y acompaÃ±amiento docente.`;
}

async function getEstructuraPermitidaPorId(req: any, res: any, pool: any, estructuraGrupoId: number) {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return null;

  const userId = getUserId(req);
  const request = pool.request()
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, userId || null);

  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
    ? `
      AND EXISTS (
        SELECT 1
        FROM dbo.AsignacionDocente ad
        WHERE ad.Activo = 1
          AND ad.InstitucionId = eg.InstitucionId
          AND ad.GrupoId = eg.GrupoId
          AND ad.MateriaId = eg.MateriaId
          AND ad.AnioLectivoId = eg.AnioLectivoId
          AND ad.PeriodoId = eg.PeriodoId
          AND ad.UsuarioId = @usuarioId
      )
    `
    : "";

  const result = await request.query(`
    SELECT TOP 1 eg.*
    FROM dbo.Eval360_EstructuraGrupo eg
    WHERE eg.EstructuraGrupoId = @estructuraGrupoId
      AND eg.InstitucionId = @institucionId
      AND eg.Activo = 1
      ${filtroProfesor}
  `);

  const row = result.recordset[0];
  if (!row) {
    forbidden(res, "No tenÃ©s permisos para usar esta estructura de evaluaciÃ³n");
    return null;
  }

  return row;
}

async function getIndicadoresPlaneamiento(pool: any, estructura: any, planeamientoId: number) {
  const planeamiento = await pool.request()
    .input("planeamientoId", sql.Int, planeamientoId)
    .input("grupoId", sql.Int, Number(estructura.GrupoId))
    .input("materiaId", sql.Int, Number(estructura.MateriaId))
    .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))
    .input("periodoId", sql.Int, Number(estructura.PeriodoId))
    .query(`
      SELECT TOP 1
        PlaneamientoId,
        Nombre,
        ResultadoIAJson
      FROM dbo.Planeamiento
      WHERE PlaneamientoId = @planeamientoId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND Activo = 1
    `);

  if (!planeamiento.recordset[0]) return { planeamiento: null, indicadores: [] as string[] };

  const indicadoresTabla = await pool.request()
    .input("planeamientoId", sql.Int, planeamientoId)
    .query(`
      SELECT Descripcion
      FROM dbo.PlaneamientoIndicador
      WHERE PlaneamientoId = @planeamientoId
        AND Activo = 1
      ORDER BY PlaneamientoIndicadorId
    `);

  const resultado = parseJsonSeguro(planeamiento.recordset[0].ResultadoIAJson);
  const indicadoresJson = splitTextLines(resultado?.indicadoresEvaluacion);

  const indicadoresDesdeTabla = indicadoresTabla.recordset
    .map((item: any) => String(item.Descripcion || "").trim())
    .filter(Boolean);

  // Regla importante:
  // Eval360 debe usar solo los indicadores de evaluacion visibles en el
  // planeamiento. Los indicadores de semanas pertenecen a la mediacion y no
  // deben convertirse en un rubro adicional sin numeracion.
  const indicadores = indicadoresJson.length > 0
    ? uniqueTextList(indicadoresJson)
    : uniqueTextList(indicadoresDesdeTabla);

  return {
    planeamiento: planeamiento.recordset[0],
    indicadores
  };
}

async function getPlantillaIndicadores(req: any, pool: any, plantillaPromptIAId?: number | null) {
  await ensurePromptIATemplateVisibilityColumns(pool);

  const result = await pool.request()
    .input("plantillaPromptIAId", sql.Int, plantillaPromptIAId || null)
    .input("usuarioId", sql.Int, getUserId(req) || null)
    .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)
    .query(`
      SELECT TOP 1
        p.Id,
        p.NombrePlantilla,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t
        ON t.Id = p.TipoGeneracionIAId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%INDICADOR%'
        AND t.Activo = 1
        AND p.Activo = 1
        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)
        AND (@plantillaPromptIAId IS NULL OR p.Id = @plantillaPromptIAId)
      ORDER BY
        CASE WHEN @plantillaPromptIAId IS NOT NULL AND p.Id = @plantillaPromptIAId THEN 0 ELSE 1 END,
        p.Id DESC
    `);

  return result.recordset[0] || null;
}

function buildPromptIndicadores(input: {
  plantilla: any;
  indicadoresBase: string[];
  tipoUso: string;
  planeamientoNombre?: string;
  indicacionesDocente?: string;
}) {
  const indicadoresTexto = input.indicadoresBase
    .map((indicador, index) => `${index + 1}. ${indicador}`)
    .join("\n");

  return `
${input.plantilla?.IndicacionesSistema || "Sos un especialista en evaluaciÃ³n educativa del MEP de Costa Rica."}

${input.plantilla?.ContextoBase || ""}

Vas a generar niveles de desempeÃ±o para el seguimiento de: ${input.tipoUso}.
Planeamiento base: ${input.planeamientoNombre || "Planeamiento seleccionado"}.

Indicaciones adicionales de la persona docente:
${input.indicacionesDocente || "No se indicaron instrucciones adicionales."}

IMPORTANTE:
Las indicaciones adicionales de la persona docente deben respetarse siempre que no contradigan la estructura tÃ©cnica solicitada.

Indicadores base del planeamiento:
${indicadoresTexto}

Reglas de construcciÃ³n:
${input.plantilla?.ReglasConstruccion || ""}

Instrucciones obligatorias:
1. NO generÃ©s indicadores nuevos.
2. NO dividÃ¡s un indicador base en varios indicadores.
3. NO usÃ©s la secciÃ³n "Estructura de salida" de la plantilla para crear mÃ¡s filas.
4. La cantidad de objetos en el arreglo "indicadores" debe ser EXACTAMENTE ${input.indicadoresBase.length}.
5. El objeto 1 corresponde al indicador base 1, el objeto 2 al indicador base 2, y asÃ­ sucesivamente.
6. El indicador avanzado debe ser exactamente el indicador base original.
7. El indicador intermedio debe describir un desempeÃ±o parcial, observable y medible.
8. El indicador inicial debe describir un desempeÃ±o bÃ¡sico o inicial, observable y medible.
9. Cada indicador debe estar redactado en tercera persona singular.
10. Cada indicador debe contener una sola conducta observable.
11. UsÃ¡ estructura: acciÃ³n + conocimiento + condiciÃ³n.
12. No usÃ©s markdown.
13. No agreguÃ©s explicaciones fuera del JSON.

Formato de salida:
DevolvÃ© SOLO JSON vÃ¡lido con esta estructura exacta:

{
  "indicadores": [
    {
      "indicadorBase": "Texto original",
      "indicadorAvanzado": "Mismo texto original",
      "indicadorIntermedio": "Texto generado",
      "indicadorInicial": "Texto generado"
    }
  ]
}

Estructura de salida de la plantilla, usada SOLO como guÃ­a de redacciÃ³n, no como permiso para agregar filas:
${input.plantilla?.EstructuraSalida || ""}

Formato de respuesta de la plantilla:
${input.plantilla?.FormatoRespuesta || ""}

Recordatorio final obligatorio:
El JSON debe traer exactamente ${input.indicadoresBase.length} objetos en "indicadores".
`;
}

async function callOpenAiIndicadores(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EVAL360_MODEL || process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.25
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Error OpenAI Eval360 indicadores:", response.status, text.slice(0, 1000));
      return null;
    }

    const data: any = await response.json();
    const text = data.output_text || data.output?.[0]?.content?.[0]?.text || "";
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      try {
        return JSON.parse(match[0]);
      } catch (parseError) {
        console.error("Respuesta OpenAI Eval360 indicadores no es JSON vï¿½lido:", parseError);
        return null;
      }
    }
  } catch (error) {
    console.error("No se pudo consultar OpenAI Eval360 indicadores; se usarï¿½ fallback local:", error);
    return null;
  }
}

function normalizarIndicadoresGenerados(resultado: any, indicadoresBase: string[]) {
  const generados = Array.isArray(resultado?.indicadores) ? resultado.indicadores : [];
  const fallback = construirIndicadoresFallback(indicadoresBase);

  return indicadoresBase.map((base, index) => {
    const candidato = generados[index] || generados.find((item: any) =>
      normalizeKey(item?.indicadorBase) === normalizeKey(base)
    ) || fallback[index];

    return {
      indicadorBase: base,
      indicadorAvanzado: String(candidato?.indicadorAvanzado || base).trim() || base,
      indicadorIntermedio: String(candidato?.indicadorIntermedio || generarIndicadorIntermedio(base)).trim(),
      indicadorInicial: String(candidato?.indicadorInicial || generarIndicadorInicial(base)).trim()
    };
  });
}

router.get("/plantillas-ia-indicadores", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();

    const cacheKey = `eval360.plantillas-ia-indicadores|u:${getUserId(req) || 0}|adm:${isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0}`;
    const cached = bootstrapCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= BOOTSTRAP_CACHE_TTL_MS) {
      return ok(res, cached.data);
    }

    const request = pool.request()
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0);

    const result = await request.query(`
      SELECT
        p.Id,
        p.TipoGeneracionIAId,
        p.NombrePlantilla,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta,
        p.UsuarioCreadorId,
        p.EsPublica,
        p.Activo
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t
        ON t.Id = p.TipoGeneracionIAId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%INDICADOR%'
        AND t.Activo = 1
        AND p.Activo = 1
        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)
      ORDER BY p.NombrePlantilla
    `);

    bootstrapCache.set(cacheKey, { at: Date.now(), data: result.recordset });
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando plantillas IA de indicadores:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas IA de indicadores" });
  }
});

router.get("/plantillas-ia-examenes", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const pool = await getPool();
    const tiposExamen = await pool.request().query(`
      SELECT Id
      FROM dbo.TipoGeneracionIA
      WHERE UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%EXAM%'
         OR UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%PRUEBA%'
    `);
    const tipoIds = (tiposExamen.recordset || []).map((r: any) => Number(r.Id)).filter((n: number) => Number.isFinite(n) && n > 0);
    const request = pool.request()
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)
      .input("tipoId1", sql.Int, tipoIds[0] || null)
      .input("tipoId2", sql.Int, tipoIds[1] || null)
      .input("tipoId3", sql.Int, tipoIds[2] || null)
      .input("tipoId4", sql.Int, tipoIds[3] || null);
    const result = await request.query(`
      SELECT
        p.Id,
        p.TipoGeneracionIAId,
        p.NombrePlantilla,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta,
        p.UsuarioCreadorId,
        p.EsPublica,
        p.Activo
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t ON t.Id = p.TipoGeneracionIAId
      WHERE (
          p.TipoGeneracionIAId IN (@tipoId1, @tipoId2, @tipoId3, @tipoId4)
          OR UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%EXAM%'
          OR UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%PRUEBA%'
        )
        AND p.Activo = 1
        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)
      ORDER BY p.FechaCreacion DESC, p.Id DESC
    `);
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando plantillas IA de exï¿½menes:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas IA de exï¿½menes" });
  }
});

router.get("/examenes-ia", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const estructuraGrupoId = toRequiredNumber(req.query.estructuraGrupoId, "estructuraGrupoId", res);
    if (!estructuraGrupoId) return;
    const pool = await getPool();
    await ensureEval360ExamenIATable(pool);
    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;
    const result = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT *
        FROM dbo.Eval360_ExamenIAGenerado
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1
        ORDER BY ExamenIAGeneradoId DESC
      `);
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando exï¿½menes IA:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron listar los exï¿½menes IA" });
  }
});

router.post("/examenes-ia/generar", examenIaUpload, async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const actividadIdTabla = toRequiredNumber(req.body.actividadIdTabla, "actividadIdTabla", res);
    const plantillaPromptIAId = toOptionalNumber(req.body.plantillaPromptIAId);
    if (!estructuraGrupoId || !actividadIdTabla) return;

    const bodyAny = req.body || {};
    const rawSecciones = bodyAny.seccionGrupoIds;
    const seccionGrupoIds = (Array.isArray(rawSecciones) ? rawSecciones : (rawSecciones ? [rawSecciones] : []))
      .map((x: any) => Number(x))
      .filter((x: number) => Number.isFinite(x) && x > 0);
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    const formatoSalidaFile = files.find((f) => String(f.fieldname) === "formatoSalidaArchivo") || null;
    const documentoApoyoFile = files.find((f) => String(f.fieldname) === "documentoApoyoArchivo") || null;
    if (formatoSalidaFile && !/\.docx$/i.test(String(formatoSalidaFile.originalname || ""))) {
      return badRequest(res, "El archivo de formato de salida debe ser .docx");
    }
    const tipoColegio = normalizeText(bodyAny.tipoColegio);
    const fuenteWord = normalizeText(bodyAny.fuenteWord) || "Calibri";
    const tamanoWordPt = Math.max(8, Math.min(18, Math.round(Number(bodyAny.tamanoWord || 11) || 11)));
    const indicaciones = normalizeText(bodyAny.indicaciones);
    const documentoApoyoNombre = normalizeText(bodyAny.documentoApoyoNombre || documentoApoyoFile?.originalname || "");
    const formatoSalidaNombre = normalizeText(bodyAny.formatoSalidaNombre || formatoSalidaFile?.originalname || "");
    const nombreSolicitado = normalizeText(bodyAny.nombre);
    const documentoApoyoTexto = await extractUploadedText(documentoApoyoFile);
    const formatoSalidaTexto = await extractUploadedText(formatoSalidaFile);

    const pool = await getPool();
    await ensureEval360ExamenIATable(pool);
    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;

    const contexto = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT TOP 1
          eg.EstructuraGrupoId,
          eg.InstitucionId,
          eg.GrupoId,
          eg.MateriaId,
          eg.AnioLectivoId,
          eg.PeriodoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS Grado,
          m.Nombre AS Materia,
          al.Nombre AS AnioLectivo,
          p.Nombre AS Periodo,
          i.Nombre AS CentroEducativo,
          CAST(NULL AS NVARCHAR(250)) AS DireccionRegional,
          CAST(NULL AS NVARCHAR(120)) AS Circuito
        FROM dbo.Eval360_EstructuraGrupo eg
        INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId
        INNER JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId
        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId
        WHERE eg.EstructuraGrupoId = @estructuraGrupoId
      `);
    const ctx = contexto.recordset[0];
    if (!ctx) return badRequest(res, "No se encontrï¿½ el contexto de la estructura");

    const plantillaReq = pool.request()
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)
      .input("plantillaPromptIAId", sql.Int, plantillaPromptIAId);
    const plantillaResult = await plantillaReq.query(`
      SELECT TOP 1 p.*
      FROM dbo.PlantillaPromptIA p
      WHERE p.Activo = 1
        AND (@plantillaPromptIAId IS NULL OR p.Id = @plantillaPromptIAId)
        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)
      ORDER BY CASE WHEN @plantillaPromptIAId IS NOT NULL AND p.Id = @plantillaPromptIAId THEN 0 ELSE 1 END, p.Id DESC
    `);
    const plantilla = plantillaResult.recordset[0];
    if (!plantilla) return badRequest(res, "No se encontrï¿½ una plantilla IA de exï¿½menes");

    const indicadoresResult = await pool.request()
      .input("actividadId", sql.Int, actividadIdTabla)
      .query(`
        SELECT ig.IndicadorBase, ig.IndicadorAvanzado, ig.IndicadorIntermedio, ig.IndicadorInicial, ai.Puntos, ai.NumeroLecciones, ai.DetalleItemsJson
        FROM dbo.Eval360_ActividadIndicador ai
        INNER JOIN dbo.Eval360_IndicadorGrupo ig ON ig.IndicadorGrupoId = ai.IndicadorGrupoId
        WHERE ai.ActividadId = @actividadId
          AND ISNULL(ai.Activo, 1) = 1
          AND ISNULL(ig.Activo, 1) = 1
      `);
    const indicadores = indicadoresResult.recordset || [];
    if (!indicadores.length) return badRequest(res, "La tabla seleccionada no tiene indicadores asignados");
    const tiposResumen = getDetalleTipoStats(indicadores);
    const tiposActivos = Object.entries(tiposResumen)
      .filter(([, v]) => Number(v.cantidad || 0) > 0)
      .map(([k, v]) => ({
        tipoItem: k,
        cantidad: Math.round(Number(v.cantidad || 0)),
        subtotalPuntos: Math.round(Number(v.subtotal || 0)),
        valorPorPregunta: Number(v.cantidad || 0) > 0 ? Math.round(Number(v.subtotal || 0) / Number(v.cantidad || 1)) : 0
      }));
    const totalPuntosEsperado = Math.round(tiposActivos.reduce((acc, t) => acc + Number(t.subtotalPuntos || 0), 0));
    const totalLeccionesEsperado = Math.round(
      indicadores.reduce((acc: number, it: any) => acc + Number(it?.NumeroLecciones || 0), 0)
    );

    const seccionesTexto = seccionGrupoIds.length
      ? seccionGrupoIds.join(", ")
      : String(ctx.GrupoNombre || "");
    const reglasFormatoExtra = formatoSalidaFile
      ? `Reglas obligatorias de formato:
- Usï¿½ el archivo DOCX de salida como formato base obligatorio.
- No alterï¿½s encabezado, membrete, tablas fijas ni orden del documento.
- No agreguï¿½s secciones nuevas.
- Solo completï¿½ campos variables del examen.`
      : `Reglas obligatorias de formato:
- Construï¿½ una salida limpia y estructurada para examen sin agregar texto administrativo ni secciones irrelevantes.`;

    const prompt = `
${normalizeText(plantilla.IndicacionesSistema) || "Sos un asistente experto en construcciï¿½n de exï¿½menes de Matemï¿½tica."}
${normalizeText(plantilla.ContextoBase)}
${normalizeText(plantilla.ReglasConstruccion)}
${reglasFormatoExtra}

Reglas obligatorias de notaciï¿½n matemï¿½tica:
- No usar LaTeX en la salida final.
- Escribir expresiones en formato legible para Word (ejemplo: xï¿½, v(16), (a+b)/c, sen(x), log(x)).
- Evitar sï¿½mbolos rotos o comandos tï¿½cnicos.

Encabezado institucional (obligatorio):
- Direcciï¿½n Regional: ${normalizeText(ctx.DireccionRegional)}
- Circuito: ${normalizeText(ctx.Circuito)}
- Centro Educativo: ${normalizeText(ctx.CentroEducativo)}
- Materia: ${normalizeText(ctx.Materia)}
- Grado: ${normalizeText(ctx.Grado)}
- Periodo: ${normalizeText(ctx.Periodo)}
- Tipo de colegio: ${tipoColegio || "No indicado"}
- Secciones: ${seccionesTexto}

Indicadores para construir el examen:
${indicadores.map((it: any, i: number) => `${i + 1}. ${normalizeText(it.IndicadorBase)}`).join("\n")}

Tabla de especificaciones (FUENTE PRIORITARIA Y OBLIGATORIA):
- Total de lecciones esperadas: ${totalLeccionesEsperado}
- Total de puntos esperados: ${totalPuntosEsperado}
- Distribuciï¿½n por tipo de ï¿½tem (exacta):
${tiposActivos.map((t) => `  - ${t.tipoItem}: ${t.cantidad} pregunta(s), ${t.valorPorPregunta} punto(s) c/u, subtotal ${t.subtotalPuntos}`).join("\n")}

Indicaciones adicionales de la persona docente (obligatorias si existen):
${indicaciones || "No se indicaron"}

Documento de apoyo adjunto:
${documentoApoyoNombre || "No adjuntado"}

Contenido extraï¿½do del documento de apoyo (si existe, uso obligatorio):
${documentoApoyoTexto || "No se pudo extraer contenido o no fue adjuntado"}

Formato de salida solicitado:
${formatoSalidaNombre || normalizeText(plantilla.FormatoRespuesta) || "JSON"}

Contenido extraï¿½do de la plantilla/formato de salida (si existe, uso obligatorio):
${formatoSalidaTexto || "No se pudo extraer contenido o no fue adjuntado"}

Devolvï¿½ contenido de examen listo para revisiï¿½n docente.

Salida obligatoria en JSON vï¿½lido (sin markdown), con esta estructura:
{
  "items": [
    {
      "numero": 1,
      "tipoItem": "SR|RC|C|I|RE|RP|RR|RCAS|PE",
      "aprendizajeEsperado": "",
      "indicadorEvaluacion": "",
      "enunciado": "",
      "opciones": [],
      "respuestaCorrecta": "",
      "criterioCorreccion": "",
      "puntaje": 0
    }
  ],
  "validacion": {
    "totalItemsCalculado": 0,
    "totalPuntosCalculado": 0,
    "totalPuntosEsperado": ${totalPuntosEsperado},
    "coincideTotalPuntos": true,
    "advertencias": []
  }
}
`;

    const respuestaIA = await callOpenAiGeneric(prompt);
    const parsed = parseExamPayload(String(respuestaIA || ""));
    const tipoCountGenerado: Record<string, number> = {};
    for (const item of parsed.items) {
      const tipo = normalizeTipoItem(item?.tipoItem);
      if (!tipo) continue;
      tipoCountGenerado[tipo] = (tipoCountGenerado[tipo] || 0) + 1;
    }
    const warnings: string[] = [...parsed.advertencias];
    for (const t of tiposActivos) {
      const got = Number(tipoCountGenerado[t.tipoItem] || 0);
      if (got !== Number(t.cantidad || 0)) {
        warnings.push(`Distribuciï¿½n incompleta en ${t.tipoItem}: esperado ${t.cantidad}, generado ${got}.`);
      }
    }
    const puntosGenerados = Math.round(parsed.items.reduce((acc: number, it: any) => acc + Number(it?.puntaje || 0), 0));
    if (puntosGenerados !== totalPuntosEsperado) {
      warnings.push(`Puntaje total generado (${puntosGenerados}) no coincide con el esperado (${totalPuntosEsperado}).`);
    }

    const resultadoPersistido = parsed.parsed && typeof parsed.parsed === "object"
      ? JSON.stringify({
          ...parsed.parsed,
          validacion: {
            ...(parsed.parsed.validacion || {}),
            totalPuntosEsperado,
            totalPuntosCalculado: puntosGenerados,
            coincideTotalPuntos: puntosGenerados === totalPuntosEsperado,
            advertencias: warnings
          }
        })
      : String(respuestaIA || "");
    const userId = getUserId(req) || null;
    const nombreFinal = nombreSolicitado || `Prueba - ${normalizeText(ctx.Grado)}-${normalizeText(ctx.Materia)}, ${normalizeText(ctx.Periodo)}`;
    const insert = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("actividadIdTabla", sql.Int, actividadIdTabla)
      .input("usuarioId", sql.Int, userId)
      .input("plantillaPromptIAId", sql.Int, Number(plantilla.Id))
      .input("nombre", sql.NVarChar(250), nombreFinal)
      .input("materia", sql.NVarChar(150), normalizeText(ctx.Materia))
      .input("grado", sql.NVarChar(120), normalizeText(ctx.Grado))
      .input("periodo", sql.NVarChar(120), normalizeText(ctx.Periodo))
      .input("tipoColegio", sql.NVarChar(120), tipoColegio || null)
      .input("fuenteWord", sql.NVarChar(120), fuenteWord)
      .input("tamanoWordPt", sql.Int, tamanoWordPt)
      .input("seccionesJson", sql.NVarChar(sql.MAX), JSON.stringify(seccionGrupoIds))
      .input("formatoSalidaNombre", sql.NVarChar(255), formatoSalidaNombre || null)
      .input("formatoSalidaMimeType", sql.NVarChar(150), formatoSalidaFile?.mimetype || null)
      .input("formatoSalidaDocxBase64", sql.NVarChar(sql.MAX), (formatoSalidaFile && /\.docx$/i.test(String(formatoSalidaFile.originalname || ""))) ? formatoSalidaFile.buffer.toString("base64") : null)
      .input("indicaciones", sql.NVarChar(sql.MAX), indicaciones || null)
      .input("documentoApoyoNombre", sql.NVarChar(255), documentoApoyoNombre || null)
      .input("encabezadoJson", sql.NVarChar(sql.MAX), JSON.stringify({
        direccionRegional: normalizeText(ctx.DireccionRegional),
        circuito: normalizeText(ctx.Circuito),
        centroEducativo: normalizeText(ctx.CentroEducativo),
        materia: normalizeText(ctx.Materia),
        grado: normalizeText(ctx.Grado),
        periodo: normalizeText(ctx.Periodo),
        anioLectivo: normalizeText(ctx.AnioLectivo)
      }))
      .input("promptGenerado", sql.NVarChar(sql.MAX), prompt)
      .input("resultadoIA", sql.NVarChar(sql.MAX), resultadoPersistido)
      .query(`
        INSERT INTO dbo.Eval360_ExamenIAGenerado
          (EstructuraGrupoId, ActividadIdTabla, UsuarioId, PlantillaPromptIAId, Nombre, Materia, Grado, Periodo, TipoColegio, FuenteWord, TamanoWordPt, SeccionesJson, FormatoSalidaNombre, FormatoSalidaMimeType, FormatoSalidaDocxBase64, Indicaciones, DocumentoApoyoNombre, EncabezadoJson, PromptGenerado, ResultadoIA, Activo, CreatedAt)
        OUTPUT INSERTED.*
        VALUES
          (@estructuraGrupoId, @actividadIdTabla, @usuarioId, @plantillaPromptIAId, @nombre, @materia, @grado, @periodo, @tipoColegio, @fuenteWord, @tamanoWordPt, @seccionesJson, @formatoSalidaNombre, @formatoSalidaMimeType, @formatoSalidaDocxBase64, @indicaciones, @documentoApoyoNombre, @encabezadoJson, @promptGenerado, @resultadoIA, 1, SYSDATETIME())
      `);
    return created(res, insert.recordset[0], "Examen IA generado y guardado correctamente");
  } catch (error) {
    console.error("Error generando examen IA:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el examen con IA" });
  }
});

router.put("/examenes-ia/:id", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const id = toRequiredNumber(req.params.id, "id", res);
    if (!id) return;
    const pool = await getPool();
    await ensureEval360ExamenIATable(pool);
    const nombre = normalizeText(req.body.nombre);
    const indicaciones = normalizeText(req.body.indicaciones);
    const resultadoIA = normalizeText(req.body.resultadoIA);
    await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar(250), nombre || null)
      .input("indicaciones", sql.NVarChar(sql.MAX), indicaciones || null)
      .input("resultadoIA", sql.NVarChar(sql.MAX), resultadoIA || null)
      .query(`
        UPDATE dbo.Eval360_ExamenIAGenerado
        SET Nombre = COALESCE(@nombre, Nombre),
            Indicaciones = COALESCE(@indicaciones, Indicaciones),
            ResultadoIA = COALESCE(@resultadoIA, ResultadoIA),
            UpdatedAt = SYSDATETIME()
        WHERE ExamenIAGeneradoId = @id
      `);
    return ok(res, { id }, "Examen IA actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando examen IA:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el examen IA" });
  }
});

router.delete("/examenes-ia/:id", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const id = toRequiredNumber(req.params.id, "id", res);
    if (!id) return;
    const pool = await getPool();
    await ensureEval360ExamenIATable(pool);
    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Eval360_ExamenIAGenerado
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE ExamenIAGeneradoId = @id
      `);
    return ok(res, { id }, "Examen IA eliminado correctamente");
  } catch (error) {
    console.error("Error eliminando examen IA:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el examen IA" });
  }
});

router.get("/examenes-ia/:id/word", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const id = toRequiredNumber(req.params.id, "id", res);
    if (!id) return;
    const pool = await getPool();
    await ensureEval360ExamenIATable(pool);
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 ExamenIAGeneradoId, EstructuraGrupoId, Nombre, Materia, Grado, Periodo, ResultadoIA, FormatoSalidaDocxBase64, ActividadIdTabla, SeccionesJson, EncabezadoJson, FuenteWord, TamanoWordPt
        FROM dbo.Eval360_ExamenIAGenerado
        WHERE ExamenIAGeneradoId = @id
          AND Activo = 1
      `);
    const row = result.recordset?.[0];
    if (!row) return badRequest(res, "No se encontrï¿½ el examen");
    const modo = normalizeKey(req.query.modo || "EXAMEN");
    const parsedPayload = parseExamPayload(String(row.ResultadoIA || ""));
    const contenidoBase =
      parsedPayload.items.length > 0
        ? (modo.includes("RESP") ? buildAnswerContentFromItems(parsedPayload.items) : buildExamContentFromItems(parsedPayload.items))
        : String(row.ResultadoIA || "").trim();
    const contenido = normalizeMathForWord(contenidoBase || "(Sin contenido)");
    const actividadIdTabla = Number(row.ActividadIdTabla || 0);
    const seccionesArr = (() => {
      try {
        const arr = JSON.parse(String(row.SeccionesJson || "[]"));
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();
    const seccionesIds = seccionesArr.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0);
    const seccionesLabel = seccionesIds.length
      ? (() => {
          const q = seccionesIds.map((_, i) => `@sid${i}`).join(",");
          return { q, ids: seccionesIds };
        })()
      : null;
    let seccionTexto = "";
    if (seccionesLabel) {
      const reqSec = pool.request();
      seccionesLabel.ids.forEach((idSec, idx) => reqSec.input(`sid${idx}`, sql.Int, idSec));
      const secResult = await reqSec.query(`
        SELECT GrupoId, Nombre
        FROM dbo.Grupo
        WHERE GrupoId IN (${seccionesLabel.q})
      `);
      const namesById = new Map<number, string>(
        (secResult.recordset || []).map((r: any) => [Number(r.GrupoId), String(r.Nombre || "").trim()])
      );
      const ordered = seccionesLabel.ids.map((idSec) => namesById.get(idSec)).filter((x) => String(x || "").trim().length > 0);
      seccionTexto = ordered.join(", ");
    }

    const detResult = actividadIdTabla > 0
      ? await pool.request()
          .input("actividadId", sql.Int, actividadIdTabla)
          .query(`
            SELECT DetalleItemsJson
            FROM dbo.Eval360_ActividadIndicador
            WHERE ActividadId = @actividadId
              AND ISNULL(Activo, 1) = 1
          `)
      : { recordset: [] as any[] };
    const actividadInfo = actividadIdTabla > 0
      ? await pool.request()
          .input("actividadId", sql.Int, actividadIdTabla)
          .query(`
            SELECT TOP 1
              ActividadId,
              PuntosMaximos,
              PorcentajeDentroRubro
            FROM dbo.Eval360_Actividad
            WHERE ActividadId = @actividadId
          `)
      : { recordset: [] as any[] };
    const actividadRow = actividadInfo.recordset?.[0] || null;
    const rowsDetalle = detResult.recordset || [];
    const sum = {
      sr_c: 0, sr_v: 0, sr_p: 0,
      rc_c: 0, rc_v: 0, rc_p: 0,
      c_c: 0, c_v: 0, c_p: 0,
      i_c: 0, i_v: 0, i_p: 0,
      re_c: 0, re_v: 0, re_p: 0,
      rp_c: 0, rp_v: 0, rp_p: 0,
      rr_c: 0, rr_v: 0, rr_p: 0,
      rcas_c: 0, rcas_v: 0, rcas_p: 0,
      pe_c: 0, pe_v: 0, pe_p: 0
    };
    const avg = (tot: number, c: number) => c > 0 ? Math.round(tot / c) : 0;
    for (const r of rowsDetalle) {
      const d = parseJsonSafe(r.DetalleItemsJson);
      const getN = (k: string) => Number(String(d?.[k] ?? "0").replace(",", ".")) || 0;
      const srC = getN("seleccionRespuestaCantidad"); const srV = getN("seleccionRespuestaPuntos");
      const rcC = getN("respuestaCortaCantidad"); const rcV = getN("respuestaCortaPuntos");
      const cC = getN("correspondenciaCantidad"); const cV = getN("correspondenciaPuntos");
      const iC = getN("identificacionCantidad"); const iV = getN("identificacionPuntos");
      const reC = getN("resolucionEjerciciosCantidad"); const reV = getN("resolucionEjerciciosPuntos");
      const rpC = getN("resolucionProblemasCantidad"); const rpV = getN("resolucionProblemasPuntos");
      const rrC = getN("respuestaRestringidaCantidad"); const rrV = getN("respuestaRestringidaPuntos");
      const rcasC = getN("resolucionCasosCantidad"); const rcasV = getN("resolucionCasosPuntos");
      const peC = getN("produccionEscritaCantidad"); const peV = getN("produccionEscritaPuntos");
      sum.sr_c += srC; sum.sr_v += srV; sum.sr_p += srC * srV;
      sum.rc_c += rcC; sum.rc_v += rcV; sum.rc_p += rcC * rcV;
      sum.c_c += cC; sum.c_v += cV; sum.c_p += cC * cV;
      sum.i_c += iC; sum.i_v += iV; sum.i_p += iC * iV;
      sum.re_c += reC; sum.re_v += reV; sum.re_p += reC * reV;
      sum.rp_c += rpC; sum.rp_v += rpV; sum.rp_p += rpC * rpV;
      sum.rr_c += rrC; sum.rr_v += rrV; sum.rr_p += rrC * rrV;
      sum.rcas_c += rcasC; sum.rcas_v += rcasV; sum.rcas_p += rcasC * rcasV;
      sum.pe_c += peC; sum.pe_v += peV; sum.pe_p += peC * peV;
    }
    const totalPuntos = Math.round(sum.sr_p + sum.rc_p + sum.c_p + sum.i_p + sum.re_p + sum.rp_p + sum.rr_p + sum.rcas_p + sum.pe_p);
    const totalPaginasEstimadas = estimateDocumentPages(contenido);
    // Regla: el porcentaje de la prueba debe venir del porcentaje configurado del rubro/prueba.
    // PuntosMaximos representa puntos de escala interna, no porcentaje.
    const porcentajePrueba = Number(actividadRow?.PorcentajeDentroRubro ?? actividadRow?.PuntosMaximos ?? 0);
    const encabezado = parseJsonSafe(row.EncabezadoJson);
    const estiloWord = {
      font: normalizeText(row.FuenteWord) || "Calibri",
      sizePt: Math.max(8, Math.min(18, Number(row.TamanoWordPt || 11) || 11))
    };
    const markers: Record<string, string> = {
      NOMBRE_CENTRO_EDUCATIVO: String(encabezado?.centroEducativo || "Centro Educativo"),
      NOMBRE_ASIGNATURA: String(row.Materia || "Matemï¿½tica"),
      ANO_LECTIVO: String(encabezado?.anioLectivo || ""),
      PERIODO_ROMANO: "I",
      PERIODO_ORDINAL: String(row.Periodo || "Semestre"),
      GRADO_NUMERO: String(row.Grado || ""),
      GRADO_LETRAS_1: String(row.Grado || ""),
      GRADO_LETRAS_2: "",
      CANTIDAD_PREGUNTAS_SR: String(Math.round(sum.sr_c)),
      VALOR_PREGUNTA_SR: String(avg(sum.sr_v, rowsDetalle.length || 1)),
      CANTIDAD_PREGUNTAS_RC: String(Math.round(sum.rc_c)),
      VALOR_PREGUNTA_RC: String(avg(sum.rc_v, rowsDetalle.length || 1)),
      PUNTAJE_TOTAL_PRUEBA: String(totalPuntos || 0),
      TOTAL_PUNTOS_PRUEBA: String(totalPuntos || 0),
      CANTIDAD_PUNTOS_PRUEBA: String(totalPuntos || 0),
      TOTAL_PAGINAS_DOCUMENTO: String(totalPaginasEstimadas || 1),
      PUNTAJE_APARTADO_SR: String(Math.round(sum.sr_p)),
      PUNTAJE_APARTADO_RC: String(Math.round(sum.rc_p)),
      PUNTAJE_APARTADO_C: String(Math.round(sum.c_p)),
      PUNTAJE_APARTADO_I: String(Math.round(sum.i_p)),
      PUNTAJE_APARTADO_RE: String(Math.round(sum.re_p)),
      PUNTAJE_APARTADO_RP: String(Math.round(sum.rp_p)),
      PUNTAJE_APARTADO_RR: String(Math.round(sum.rr_p)),
      PUNTAJE_APARTADO_PE: String(Math.round(sum.pe_p)),
      PUNTOS_REACTIVOS_RE_RP_RR_PE: String(Math.round(porcentajePrueba || 0)),
      PORCENTAJE_TOTAL_PRUEBA: String(Math.round(porcentajePrueba || 0)),
      ELEMENTOS_IDENTIFICACION_I: "elementos",
      COMPLETAR_ESPACIOS_I: "los espacios",
      ACCION_RESPUESTA_I: "escriba el dato",
      COMPLETAR_ESPACIOS_C: "los conceptos",
      ELEMENTOS_RELACION_C: "la letra o nï¿½mero",
      MODO_USO_RELACION_C: "una, varias o ninguna vez.",
      LECCION_INICIO: "",
      LECCION_FIN: "",
      FECHA_APLICACION: new Date().toISOString().slice(0, 10),
      SECCION: seccionTexto || (seccionesIds.length ? seccionesIds.join(", ") : ""),
      CONTENIDO_EXAMEN: contenido,
      RESULTADO_EXAMEN: contenido
    };
    const items = parsedPayload.items;
    const blocksFromText = parseQuestionBlocksFromPlainText(contenido);
    const sectionBlocks: Record<string, string> = {
      SR: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "SR") : buildQuestionsBlockByType(items, "SR")) || String((blocksFromText as any).SR || ""),
      RC: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RC") : buildQuestionsBlockByType(items, "RC")) || String((blocksFromText as any).RC || ""),
      C: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "C") : buildQuestionsBlockByType(items, "C")) || String((blocksFromText as any).C || ""),
      I: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "I") : buildQuestionsBlockByType(items, "I")) || String((blocksFromText as any).I || ""),
      RE: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RE") : buildQuestionsBlockByType(items, "RE")) || String((blocksFromText as any).RE || ""),
      RP: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RP") : buildQuestionsBlockByType(items, "RP")) || String((blocksFromText as any).RP || ""),
      RR: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RR") : buildQuestionsBlockByType(items, "RR")) || String((blocksFromText as any).RR || ""),
      RCAS: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RCAS") : buildQuestionsBlockByType(items, "RCAS")) || String((blocksFromText as any).RCAS || ""),
      PE: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "PE") : buildQuestionsBlockByType(items, "PE")) || String((blocksFromText as any).PE || "")
    };
    let buffer: Buffer;
    let renderMode = "no-template";
    let templateBase64 = String(row.FormatoSalidaDocxBase64 || "");
    const defaultMachoteInfo = await loadDefaultMachoteBase64();
    const defaultMachote = String(defaultMachoteInfo.base64 || "");
    // Prioridad 1 en este entorno: usar siempre el machote institucional local.
    if (defaultMachote) {
      templateBase64 = defaultMachote;
    }
    if (!templateBase64) {
      const fallbackTpl = await pool.request()
        .input("estructuraGrupoId", sql.Int, Number(row.EstructuraGrupoId || 0))
        .input("id", sql.Int, id)
        .query(`
          SELECT TOP 1 FormatoSalidaDocxBase64
          FROM dbo.Eval360_ExamenIAGenerado
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND ExamenIAGeneradoId <> @id
            AND Activo = 1
            AND FormatoSalidaDocxBase64 IS NOT NULL
            AND LEN(FormatoSalidaDocxBase64) > 1000
          ORDER BY ExamenIAGeneradoId DESC
        `);
      templateBase64 = String(fallbackTpl.recordset?.[0]?.FormatoSalidaDocxBase64 || "");
      if (!templateBase64) {
        const fallbackGlobalTpl = await pool.request()
          .input("id", sql.Int, id)
          .query(`
            SELECT TOP 1 FormatoSalidaDocxBase64
            FROM dbo.Eval360_ExamenIAGenerado
            WHERE ExamenIAGeneradoId <> @id
              AND Activo = 1
              AND FormatoSalidaDocxBase64 IS NOT NULL
              AND LEN(FormatoSalidaDocxBase64) > 300
            ORDER BY ExamenIAGeneradoId DESC
          `);
        templateBase64 = String(fallbackGlobalTpl.recordset?.[0]?.FormatoSalidaDocxBase64 || "");
      }
      if (!templateBase64) {
        templateBase64 = defaultMachote;
      }
    }

    if (!templateBase64) {
      return badRequest(res, "No se encontrï¿½ un machote DOCX vï¿½lido para generar el examen. Subï¿½ nuevamente 'Indicaciones prueba escrita - MACHOTE IA.docx' al crear el examen.");
    }

    if (templateBase64) {
      // Prioridad: respetar siempre el machote y sus marcadores.
      // Evitamos degradar por heurï¿½sticas de validaciï¿½n que pueden dar falsos negativos.
      const fromTemplate = await renderDocxFromTemplate(templateBase64, contenido, markers, sectionBlocks, estiloWord);
      if (fromTemplate && fromTemplate.length > 0) {
        buffer = fromTemplate;
        renderMode = "template-sections";
      } else {
        // ï¿½ltimo recurso: mantener machote y anexar contenido.
        buffer = await forceAppendExamToTemplate(templateBase64, contenido, estiloWord);
        renderMode = "template-append-fallback";
      }
    }
    const hardened = await hardenRenderedDocx(buffer, markers, contenido, estiloWord);
    buffer = hardened.buffer;
    let recoveryError = "";
    // Si endurecimiento falla o no encuentra preguntas, forzar anexado visible.
    if (!hardened.hasQuestions) {
      const recoveryBase64 = String(defaultMachote || templateBase64 || "");
      try {
        // Importante: reconstruir siempre desde el machote base vï¿½lido.
        buffer = await forceAppendExamToTemplate(recoveryBase64, contenido, estiloWord);
        renderMode = "template-recovery-append";
      } catch (err: any) {
        recoveryError = String(err?.message || err || "recovery-append-failed").slice(0, 180);
        // ï¿½ltimo seguro: devolver el machote ï¿½ntegro, no un doc pequeï¿½o corrupto.
        if (recoveryBase64) {
          try {
            buffer = Buffer.from(recoveryBase64, "base64");
            renderMode = "template-recovery-raw";
          } catch {
            // mantener buffer previo
          }
        }
      }
    }
    const suffix = modo.includes("RESP") ? "_respuestas" : "_examen";
    const ts = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
    const filename = `${String(row.Nombre || "examen").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "examen"}${suffix}_${ts}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Access-Control-Expose-Headers", "X-Render-Mode, X-Word-Renderer-Version, X-Template-Source, X-Template-Bytes, X-Template-Path, X-Items-Count, X-Markers-Left, X-Doc-Has-Questions, X-Harden-Error, Content-Disposition, Content-Length");
    res.setHeader("X-Render-Mode", renderMode);
    res.setHeader("X-Word-Renderer-Version", "v2026-05-18-04");
    res.setHeader("X-Template-Source", defaultMachote ? "default-machote-local" : "db");
    res.setHeader("X-Template-Bytes", String(Number(defaultMachoteInfo.bytes || 0)));
    res.setHeader("X-Template-Path", String(defaultMachoteInfo.path || ""));
    res.setHeader("X-Items-Count", String(Array.isArray(parsedPayload.items) ? parsedPayload.items.length : 0));
    res.setHeader("X-Markers-Left", String(Number(hardened.markersLeft ?? -1)));
    res.setHeader("X-Doc-Has-Questions", hardened.hasQuestions ? "1" : "0");
    const hardenError = String((hardened as any).error || "");
    res.setHeader("X-Harden-Error", String([hardenError, recoveryError].filter(Boolean).join(" | ")));
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error generando Word de examen IA:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el archivo Word" });
  }
});

router.get("/tablas-especificaciones/:actividadId/excel", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    const actividadId = toRequiredNumber(req.params.actividadId, "actividadId", res);
    if (!actividadId) return;
    const pool = await getPool();

    const actividadCtx = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 a.ActividadId, a.Nombre, a.EstructuraGrupoId
        FROM dbo.Eval360_Actividad a
        WHERE a.ActividadId = @actividadId
      `);
    const actividad = actividadCtx.recordset?.[0];
    if (!actividad) return badRequest(res, "No se encontrï¿½ la actividad de la tabla de especificaciones");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(actividad.EstructuraGrupoId));
    if (!estructura) return;

    const result = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT
          ig.IndicadorGrupoId,
          ig.PlaneamientoId,
          ig.IndicadorBase,
          ai.NumeroLecciones,
          ai.Puntos,
          ai.DetalleItemsJson
        FROM dbo.Eval360_ActividadIndicador ai
        INNER JOIN dbo.Eval360_IndicadorGrupo ig ON ig.IndicadorGrupoId = ai.IndicadorGrupoId
        WHERE ai.ActividadId = @actividadId
          AND ISNULL(ai.Activo, 1) = 1
        ORDER BY ig.IndicadorGrupoId
      `);

    const rows = (result.recordset || []).map((r: any) => {
      const d = parseJsonSafe(r.DetalleItemsJson);
      return {
        IndicadorGrupoId: Number(r.IndicadorGrupoId || 0),
        PlaneamientoId: Number(r.PlaneamientoId || 0),
        Indicador: String(r.IndicadorBase || ""),
        NumeroLecciones: Number(r.NumeroLecciones || 0),
        Puntos: Number(r.Puntos || 0),
        SR_Cantidad: Number(d?.seleccionRespuestaCantidad || 0),
        SR_Valor: Number(d?.seleccionRespuestaPuntos || 0),
        RC_Cantidad: Number(d?.respuestaCortaCantidad || 0),
        RC_Valor: Number(d?.respuestaCortaPuntos || 0),
        C_Cantidad: Number(d?.correspondenciaCantidad || 0),
        C_Valor: Number(d?.correspondenciaPuntos || 0),
        I_Cantidad: Number(d?.identificacionCantidad || 0),
        I_Valor: Number(d?.identificacionPuntos || 0),
        RE_Cantidad: Number(d?.resolucionEjerciciosCantidad || 0),
        RE_Valor: Number(d?.resolucionEjerciciosPuntos || 0),
        RP_Cantidad: Number(d?.resolucionProblemasCantidad || 0),
        RP_Valor: Number(d?.resolucionProblemasPuntos || 0),
        RR_Cantidad: Number(d?.respuestaRestringidaCantidad || 0),
        RR_Valor: Number(d?.respuestaRestringidaPuntos || 0),
        RCas_Cantidad: Number(d?.resolucionCasosCantidad || 0),
        RCas_Valor: Number(d?.resolucionCasosPuntos || 0),
        PE_Cantidad: Number(d?.produccionEscritaCantidad || 0),
        PE_Valor: Number(d?.produccionEscritaPuntos || 0)
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TablaEspecificaciones");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const safeName = String(actividad.Nombre || "tabla_especificaciones").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    const filename = `${safeName || "tabla_especificaciones"}_${actividadId}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando tabla de especificaciones a Excel:", error);
    return res.status(500).json({ ok: false, message: "No se pudo descargar la tabla de especificaciones en Excel" });
  }
});

router.get("/indicadores", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const estructuraGrupoId = toOptionalNumber(req.query.estructuraGrupoId);
    const planeamientoId = toOptionalNumber(req.query.planeamientoId);
    const tipoUso = normalizeText(req.query.tipoUso);
    const pool = await getPool();

    let estructuraIdFinal = estructuraGrupoId;

    if (planeamientoId && !estructuraIdFinal) {
      const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, null);
      if (!contexto) return;
      estructuraIdFinal = Number(contexto.estructura.EstructuraGrupoId);
    }

    if (!estructuraIdFinal) {
      return badRequest(res, "DebÃ©s indicar estructuraGrupoId o planeamientoId");
    }

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraIdFinal);
    if (!estructura) return;

    const request = pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraIdFinal);

    const filters = ["i.EstructuraGrupoId = @estructuraGrupoId"];

    if (!planeamientoId) {
      filters.push("ISNULL(i.Activo, 1) = 1");
    }

    if (planeamientoId) {
      request.input("planeamientoId", sql.Int, planeamientoId);
      filters.push("i.PlaneamientoId = @planeamientoId");
    }

    if (tipoUso) {
      request.input("tipoUso", sql.NVarChar(50), tipoUso);
      filters.push("i.TipoUso = @tipoUso");
    }

    const result = await request.query(`
      SELECT
        i.*
      FROM dbo.Eval360_IndicadorGrupo i
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE i.TipoUso
          WHEN N'Cotidiano' THEN 1
          WHEN N'Tareas' THEN 2
          WHEN N'TablaEspecificaciones' THEN 3
          ELSE 9
        END,
        i.IndicadorGrupoId
    `);

    if (planeamientoId && (!result.recordset || result.recordset.length === 0)) {
      const planeamientoBase = await pool.request()
        .input("planeamientoId", sql.Int, planeamientoId)
        .query(`
          SELECT TOP 1 LTRIM(RTRIM(ISNULL(Nombre, N''))) AS Nombre
          FROM dbo.Planeamiento
          WHERE PlaneamientoId = @planeamientoId
            AND Activo = 1
        `);
      const nombreBase = String(planeamientoBase.recordset[0]?.Nombre || "").trim();

      if (nombreBase) {
        const fallbackReq = pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraIdFinal)
          .input("nombreBase", sql.NVarChar(200), nombreBase);
        if (tipoUso) fallbackReq.input("tipoUso", sql.NVarChar(50), tipoUso);

        const fallback = await fallbackReq.query(`
          SELECT
            i.*
          FROM dbo.Eval360_IndicadorGrupo i
          INNER JOIN dbo.Planeamiento pOrigen
            ON pOrigen.PlaneamientoId = i.PlaneamientoId
          WHERE i.EstructuraGrupoId = @estructuraGrupoId
            AND LTRIM(RTRIM(ISNULL(pOrigen.Nombre, N''))) = @nombreBase
            ${tipoUso ? "AND i.TipoUso = @tipoUso" : ""}
          ORDER BY
            CASE i.TipoUso
              WHEN N'Cotidiano' THEN 1
              WHEN N'Tareas' THEN 2
              WHEN N'TablaEspecificaciones' THEN 3
              ELSE 9
            END,
            i.IndicadorGrupoId
        `);
        return ok(res, fallback.recordset || []);
      }
    }

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando indicadores Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los indicadores" });
  }
});

async function getEstructuraDesdePlaneamiento(req: any, res: any, pool: any, planeamientoId: number, estructuraGrupoId?: number | null) {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return null;

  const userId = getUserId(req);

  if (estructuraGrupoId) {
    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return null;

    const planeamientoLookup = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT TOP 1 p.*
        FROM dbo.Planeamiento p
        INNER JOIN dbo.Eval360_EstructuraGrupo eg
          ON eg.GrupoId = p.GrupoId
         AND eg.MateriaId = p.MateriaId
         AND eg.AnioLectivoId = p.AnioLectivoId
         AND eg.PeriodoId = p.PeriodoId
        WHERE p.PlaneamientoId = @planeamientoId
          AND eg.EstructuraGrupoId = @estructuraGrupoId
          AND p.Activo = 1
      `);

    if (!planeamientoLookup.recordset[0]) {
      badRequest(res, "El planeamiento seleccionado no pertenece a la estructura indicada");
      return null;
    }

    return {
      estructura,
      planeamiento: planeamientoLookup.recordset[0]
    };
  }

  const request = pool.request()
    .input("planeamientoId", sql.Int, planeamientoId)
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, userId || null);

  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
    ? `
      AND EXISTS (
        SELECT 1
        FROM dbo.AsignacionDocente ad
        WHERE ad.Activo = 1
          AND ad.InstitucionId = p.InstitucionId
          AND ad.GrupoId = p.GrupoId
          AND ad.MateriaId = p.MateriaId
          AND ad.AnioLectivoId = p.AnioLectivoId
          AND ad.PeriodoId = p.PeriodoId
          AND ad.UsuarioId = @usuarioId
      )
    `
    : "";

  const planeamientoResult = await request.query(`
    SELECT TOP 1 p.*
    FROM dbo.Planeamiento p
    WHERE p.PlaneamientoId = @planeamientoId
      AND p.InstitucionId = @institucionId
      AND p.Activo = 1
      ${filtroProfesor}
  `);

  const planeamiento = planeamientoResult.recordset[0];

  if (!planeamiento) {
    forbidden(res, "No tenÃ©s permisos para usar este planeamiento o no existe");
    return null;
  }

  const estructuraResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, Number(planeamiento.GrupoId))
    .input("materiaId", sql.Int, Number(planeamiento.MateriaId))
    .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))
    .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))
    .query(`
      SELECT TOP 1 *
      FROM dbo.Eval360_EstructuraGrupo
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND Activo = 1
      ORDER BY EstructuraGrupoId DESC
    `);

  if (estructuraResult.recordset[0]) {
    return {
      estructura: estructuraResult.recordset[0],
      planeamiento
    };
  }

  const createResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, Number(planeamiento.GrupoId))
    .input("materiaId", sql.Int, Number(planeamiento.MateriaId))
    .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))
    .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))
    .input("usuarioId", sql.Int, Number(planeamiento.UsuarioId || userId || 0) || null)
    .input("nombre", sql.NVarChar(200), `Estructura de evaluaciÃ³n - ${planeamiento.Nombre || "Planeamiento"}`)
    .query(`
      INSERT INTO dbo.Eval360_EstructuraGrupo
        (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
      OUTPUT INSERTED.*
      VALUES
        (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, NULL, @nombre, 100, 1, SYSDATETIME())
    `);

  const estructuraCreada = createResult.recordset[0];

  await pool.request()
    .input("estructuraGrupoId", sql.Int, Number(estructuraCreada.EstructuraGrupoId))
    .input("institucionId", sql.Int, institucionId)
    .query(`
      INSERT INTO dbo.Eval360_NivelDesempenoGrupo
        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
      SELECT
        @estructuraGrupoId,
        Nombre,
        Valor,
        Orden,
        Activo
      FROM dbo.Eval360_NivelDesempenoGlobal
      WHERE InstitucionId = @institucionId
        AND Activo = 1
      ORDER BY Orden
    `);

  return {
    estructura: estructuraCreada,
    planeamiento
  };
}


router.post("/indicadores/generar-desde-planeamiento", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;

    const planeamientoId = toRequiredNumber(req.body.planeamientoId, "planeamientoId", res);
    const estructuraGrupoId = toOptionalNumber(req.body.estructuraGrupoId);
    const plantillaPromptIAId = toOptionalNumber(req.body.plantillaPromptIAId);
    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);
    const tiposUsoRaw = Array.isArray(req.body.tiposUso) ? req.body.tiposUso : ["Cotidiano", "Tareas", "TablaEspecificaciones"];
    const grupoIdsSolicitados = toNumberList(req.body.grupoIds);

    if (planeamientoId === null) return;

    const tiposUso = tiposUsoRaw
      .map((item: any) => normalizeText(item))
      .filter((item: string) => ["Cotidiano", "Tareas", "TablaEspecificaciones"].includes(item));

    if (!tiposUso.length) return badRequest(res, "DebÃ©s indicar al menos un tipo de uso vÃ¡lido");

    const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, estructuraGrupoId);
    if (!contexto) return;

    const estructura = contexto.estructura;
    const { planeamiento, indicadores } = await getIndicadoresPlaneamiento(pool, estructura, planeamientoId);

    if (!planeamiento) return badRequest(res, "No se encontrÃ³ el planeamiento seleccionado");
    if (!indicadores.length) return badRequest(res, "El planeamiento seleccionado no tiene indicadores de evaluaciÃ³n");

    const plantilla = await getPlantillaIndicadores(req, pool, plantillaPromptIAId);
    if (!plantilla) return badRequest(res, "No se encontrÃ³ una plantilla IA activa de indicadores");

    const resultadosPorTipo: Record<string, any[]> = {};

    for (const tipoUso of tiposUso) {
      const prompt = buildPromptIndicadores({
        plantilla,
        indicadoresBase: indicadores,
        tipoUso,
        planeamientoNombre: planeamiento.Nombre,
        indicacionesDocente
      });

      const aiResult = await callOpenAiIndicadores(prompt);
      resultadosPorTipo[tipoUso] = normalizarIndicadoresGenerados(aiResult, indicadores);
    }

    const grupoIdsDestino = grupoIdsSolicitados.length
      ? grupoIdsSolicitados
      : [Number(estructura.GrupoId)];
    const placeholdersGrupos = grupoIdsDestino.map((_, index) => `@gid${index}`).join(", ");
    const requestEstructuras = pool.request()
      .input("institucionId", sql.Int, Number(estructura.InstitucionId))
      .input("materiaId", sql.Int, Number(estructura.MateriaId))
      .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))
      .input("periodoId", sql.Int, Number(estructura.PeriodoId))
      .input("usuarioId", sql.Int, getUserId(req) || null);
    grupoIdsDestino.forEach((grupoId, index) => requestEstructuras.input(`gid${index}`, sql.Int, grupoId));

    const filtroProfesor = isProfesor(req)
      ? `
        AND EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.Activo = 1
            AND ad.InstitucionId = eg.InstitucionId
            AND ad.GrupoId = eg.GrupoId
            AND ad.MateriaId = eg.MateriaId
            AND ad.AnioLectivoId = eg.AnioLectivoId
            AND ad.PeriodoId = eg.PeriodoId
            AND ad.UsuarioId = @usuarioId
        )
      `
      : "";

    const estructurasDestinoResult = await requestEstructuras.query(`
      SELECT
        eg.EstructuraGrupoId,
        eg.GrupoId
      FROM dbo.Eval360_EstructuraGrupo eg
      WHERE eg.InstitucionId = @institucionId
        AND eg.MateriaId = @materiaId
        AND eg.AnioLectivoId = @anioLectivoId
        AND eg.PeriodoId = @periodoId
        AND eg.Activo = 1
        AND eg.GrupoId IN (${placeholdersGrupos})
        ${filtroProfesor}
    `);
    await transaction.begin();

    const estructurasDestino = [...(estructurasDestinoResult.recordset || [])];
    const plantillaBaseId = Number(estructura.PlantillaBaseId || 0);
    const gruposConEstructura = new Set(estructurasDestino.map((item: any) => Number(item.GrupoId)));
    const gruposSinEstructura = grupoIdsDestino.filter((grupoId) => !gruposConEstructura.has(Number(grupoId)));

    if (gruposSinEstructura.length && plantillaBaseId > 0) {
      for (const grupoId of gruposSinEstructura) {
        const creada = await new sql.Request(transaction)
          .input("institucionId", sql.Int, Number(estructura.InstitucionId))
          .input("grupoId", sql.Int, Number(grupoId))
          .input("materiaId", sql.Int, Number(estructura.MateriaId))
          .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))
          .input("periodoId", sql.Int, Number(estructura.PeriodoId))
          .input("usuarioId", sql.Int, getUserId(req) || null)
          .input("plantillaBaseId", sql.Int, plantillaBaseId)
          .input("nombre", sql.NVarChar(200), `Estructura de evaluaciï¿½n - ${planeamiento.Nombre || "Planeamiento"}`)
          .query(`
            INSERT INTO dbo.Eval360_EstructuraGrupo
              (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
            OUTPUT INSERTED.EstructuraGrupoId, INSERTED.GrupoId
            VALUES
              (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, 100, 1, SYSDATETIME())
          `);

        const estructuraCreada = creada.recordset[0];
        if (!estructuraCreada) continue;

        await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, Number(estructuraCreada.EstructuraGrupoId))
          .input("institucionId", sql.Int, Number(estructura.InstitucionId))
          .query(`
            INSERT INTO dbo.Eval360_NivelDesempenoGrupo
              (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
            SELECT
              @estructuraGrupoId,
              Nombre,
              Valor,
              Orden,
              Activo
            FROM dbo.Eval360_NivelDesempenoGlobal
            WHERE InstitucionId = @institucionId
              AND Activo = 1
            ORDER BY Orden
          `);

        await sincronizarEstructuraConPlantilla(
          transaction,
          Number(estructuraCreada.EstructuraGrupoId),
          plantillaBaseId
        );

        estructurasDestino.push({
          EstructuraGrupoId: Number(estructuraCreada.EstructuraGrupoId),
          GrupoId: Number(estructuraCreada.GrupoId)
        });
      }
    }

    if (!estructurasDestino.length) {
      return badRequest(res, "No hay secciones con plantilla de evaluaciï¿½n activa para aplicar los indicadores");
    }

    // Limpieza preventiva: si antes se generaron indicadores extra por el JSON
    // del planeamiento o por una respuesta de IA mÃ¡s larga, se desactivan para
    // que la pantalla muestre Ãºnicamente los indicadores base reales del planeamiento.
    const basesPermitidas = new Set(indicadores.map((base) => normalizeKey(base)));
    const tiposPermitidos = new Set(tiposUso.map((tipo) => normalizeKey(tipo)));
    for (const estructuraDestino of estructurasDestino) {
      const estructuraDestinoId = Number(estructuraDestino.EstructuraGrupoId);
      const grupoDestinoId = Number(estructuraDestino.GrupoId || 0);
      let planeamientoDestinoId = planeamientoId;
      if (grupoDestinoId && grupoDestinoId !== Number(planeamiento.GrupoId || 0)) {
        const planeamientoDestinoResult = await new sql.Request(transaction)
          .input("institucionId", sql.Int, Number(estructura.InstitucionId))
          .input("grupoId", sql.Int, grupoDestinoId)
          .input("materiaId", sql.Int, Number(planeamiento.MateriaId))
          .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))
          .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))
          .input("nombre", sql.NVarChar(200), String(planeamiento.Nombre || "").trim())
          .query(`
            SELECT TOP 1 PlaneamientoId
            FROM dbo.Planeamiento
            WHERE InstitucionId = @institucionId
              AND GrupoId = @grupoId
              AND MateriaId = @materiaId
              AND AnioLectivoId = @anioLectivoId
              AND PeriodoId = @periodoId
              AND Activo = 1
              AND LTRIM(RTRIM(ISNULL(Nombre, N''))) = @nombre
            ORDER BY PlaneamientoId DESC
          `);
        const planeamientoDestino = Number(planeamientoDestinoResult.recordset[0]?.PlaneamientoId || 0);
        if (planeamientoDestino > 0) {
          planeamientoDestinoId = planeamientoDestino;
        } else {
          const planeamientoFallbackResult = await new sql.Request(transaction)
            .input("institucionId", sql.Int, Number(estructura.InstitucionId))
            .input("grupoId", sql.Int, grupoDestinoId)
            .input("materiaId", sql.Int, Number(planeamiento.MateriaId))
            .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))
            .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))
            .query(`
              SELECT TOP 1 PlaneamientoId
              FROM dbo.Planeamiento
              WHERE InstitucionId = @institucionId
                AND GrupoId = @grupoId
                AND MateriaId = @materiaId
                AND AnioLectivoId = @anioLectivoId
                AND PeriodoId = @periodoId
                AND Activo = 1
              ORDER BY PlaneamientoId DESC
            `);
          const planeamientoFallback = Number(planeamientoFallbackResult.recordset[0]?.PlaneamientoId || 0);
          if (planeamientoFallback > 0) planeamientoDestinoId = planeamientoFallback;
        }
      }
      const existentesParaPlaneamiento = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("planeamientoId", sql.Int, planeamientoDestinoId)
        .query(`
          SELECT IndicadorGrupoId, IndicadorBase, TipoUso
          FROM dbo.Eval360_IndicadorGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND PlaneamientoId = @planeamientoId
        `);

      const idsNoPermitidos = existentesParaPlaneamiento.recordset
        .filter((item: any) => !basesPermitidas.has(normalizeKey(item.IndicadorBase)) || !tiposPermitidos.has(normalizeKey(item.TipoUso)))
        .map((item: any) => Number(item.IndicadorGrupoId))
        .filter(Boolean);

      for (const indicadorGrupoId of idsNoPermitidos) {
        await new sql.Request(transaction)
          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
          .query(`
            UPDATE dbo.Eval360_IndicadorGrupo
            SET Activo = 0,
                UpdatedAt = SYSDATETIME()
            WHERE IndicadorGrupoId = @indicadorGrupoId
          `);
      }

      for (const tipoUso of tiposUso) {
        for (const item of resultadosPorTipo[tipoUso]) {
          const existing = await new sql.Request(transaction)
            .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
            .input("planeamientoId", sql.Int, planeamientoDestinoId)
            .input("tipoUso", sql.NVarChar(50), tipoUso)
            .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)
            .query(`
              SELECT TOP 1 IndicadorGrupoId
              FROM dbo.Eval360_IndicadorGrupo
              WHERE EstructuraGrupoId = @estructuraGrupoId
                AND PlaneamientoId = @planeamientoId
                AND TipoUso = @tipoUso
                AND IndicadorBase = @indicadorBase
            `);

          if (existing.recordset[0]) {
            await new sql.Request(transaction)
              .input("indicadorGrupoId", sql.Int, existing.recordset[0].IndicadorGrupoId)
              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)
              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)
              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)
              .query(`
                UPDATE dbo.Eval360_IndicadorGrupo
                SET IndicadorAvanzado = @indicadorAvanzado,
                    IndicadorIntermedio = @indicadorIntermedio,
                    IndicadorInicial = @indicadorInicial,
                    Activo = 1,
                    UpdatedAt = SYSDATETIME()
                WHERE IndicadorGrupoId = @indicadorGrupoId
              `);
          } else {
            await new sql.Request(transaction)
              .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
              .input("planeamientoId", sql.Int, planeamientoDestinoId)
              .input("tipoUso", sql.NVarChar(50), tipoUso)
              .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)
              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)
              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)
              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)
              .query(`
                INSERT INTO dbo.Eval360_IndicadorGrupo
                  (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
                VALUES
                  (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
              `);
          }
        }
      }
    }

    await transaction.commit();

    const indicadoresGuardados = await pool.request()
      .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND PlaneamientoId = @planeamientoId
          AND Activo = 1
        ORDER BY
          CASE TipoUso
            WHEN N'Cotidiano' THEN 1
            WHEN N'Tareas' THEN 2
            WHEN N'TablaEspecificaciones' THEN 3
            ELSE 9
          END,
          IndicadorGrupoId
      `);

    return created(res, {
      estructuraGrupoId: Number(estructura.EstructuraGrupoId),
      planeamientoId,
      plantillaPromptIAId: plantilla.Id,
      generadoConIA: !!process.env.OPENAI_API_KEY,
      estructurasAplicadas: estructurasDestino.length,
      gruposSolicitados: grupoIdsDestino,
      indicadores: indicadoresGuardados.recordset
    }, "Indicadores generados correctamente desde el planeamiento");
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {}
    console.error("Error generando indicadores Eval360 desde planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron generar los indicadores desde el planeamiento" });
  }
});


router.put("/indicadores/:id", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const indicadorGrupoId = toRequiredNumber(req.params.id, "indicadorGrupoId", res);
    if (indicadorGrupoId === null) return;

    const pool = await getPool();

    const lookup = await pool.request()
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE IndicadorGrupoId = @indicadorGrupoId
      `);

    const indicador = lookup.recordset[0];
    if (!indicador) return badRequest(res, "No se encontrÃ³ el indicador");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(indicador.EstructuraGrupoId));
    if (!estructura) return;
    const indicadoresConUso = await getIndicadoresConUso(pool, [indicadorGrupoId]);
    if (indicadoresConUso.length) {
      return res.status(409).json({
        ok: false,
        message: "No se puede editar este indicador porque ya fue calificado en esta sección.",
        indicadoresConUso
      });
    }

    const indicadorAvanzado = normalizeText(req.body.indicadorAvanzado || indicador.IndicadorAvanzado);
    const indicadorIntermedio = normalizeText(req.body.indicadorIntermedio || indicador.IndicadorIntermedio);
    const indicadorInicial = normalizeText(req.body.indicadorInicial || indicador.IndicadorInicial);
    const activo = req.body.activo === undefined ? indicador.Activo : Boolean(req.body.activo);

    if (!indicadorAvanzado || !indicadorIntermedio || !indicadorInicial) {
      return badRequest(res, "Los textos de avanzado, intermedio e inicial son obligatorios");
    }

    const result = await pool.request()
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicadorAvanzado)
      .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicadorIntermedio)
      .input("indicadorInicial", sql.NVarChar(sql.MAX), indicadorInicial)
      .input("activo", sql.Bit, activo ? 1 : 0)
      .query(`
        UPDATE dbo.Eval360_IndicadorGrupo
        SET IndicadorAvanzado = @indicadorAvanzado,
            IndicadorIntermedio = @indicadorIntermedio,
            IndicadorInicial = @indicadorInicial,
            Activo = @activo,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE IndicadorGrupoId = @indicadorGrupoId
      `);

    return ok(res, result.recordset[0], "Indicador actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando indicador Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el indicador" });
  }
});




async function getIndicadoresConUso(pool: any, indicadorGrupoIds: number[]) {
  const ids = indicadorGrupoIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!ids.length) return [];

  const tablas = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME = 'IndicadorGrupoId'
      AND TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME <> 'Eval360_IndicadorGrupo'
  `);

  if (!tablas.recordset.length) return [];

  const valuesSql = ids.map((id) => `(${id})`).join(",");
  const unionSql = tablas.recordset.map((tabla: any) => {
    const schema = String(tabla.TABLE_SCHEMA).replace(/]/g, "]]" );
    const table = String(tabla.TABLE_NAME).replace(/]/g, "]]" );
    return `
      SELECT DISTINCT CAST(t.IndicadorGrupoId AS INT) AS IndicadorGrupoId,
             N'${schema}.${table}' AS TablaOrigen
      FROM [${schema}].[${table}] t
      INNER JOIN ids ON ids.IndicadorGrupoId = t.IndicadorGrupoId
    `;
  }).join("\nUNION ALL\n");

  const result = await pool.request().query(`
    WITH ids(IndicadorGrupoId) AS (
      SELECT v.IndicadorGrupoId
      FROM (VALUES ${valuesSql}) v(IndicadorGrupoId)
    )
    ${unionSql}
  `);

  return result.recordset || [];
}

function mensajeIndicadoresConUso() {
  return "No se pueden eliminar los indicadores porque ya tienen calificaciones o registros asociados en tareas o trabajo cotidiano.";
}

router.delete("/indicadores/planeamiento/:planeamientoId", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;

    const planeamientoId = toRequiredNumber(req.params.planeamientoId, "planeamientoId", res);
    if (planeamientoId === null) return;
    const grupoIdsSolicitados = toNumberList((req as any).body?.grupoIds);

    const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, null);
    if (!contexto) return;
    const nombrePlaneamientoBase = String(contexto?.planeamiento?.Nombre || "").trim();

    const estructuraBase = contexto.estructura;
    const grupoIdsDestino = grupoIdsSolicitados.length
      ? grupoIdsSolicitados
      : [Number(estructuraBase.GrupoId)];
    const placeholdersGrupos = grupoIdsDestino.map((_, index) => `@gid${index}`).join(", ");
    const requestEstructuras = pool.request()
      .input("institucionId", sql.Int, Number(estructuraBase.InstitucionId))
      .input("materiaId", sql.Int, Number(estructuraBase.MateriaId))
      .input("anioLectivoId", sql.Int, Number(estructuraBase.AnioLectivoId))
      .input("periodoId", sql.Int, Number(estructuraBase.PeriodoId))
      .input("usuarioId", sql.Int, getUserId(req) || null);
    grupoIdsDestino.forEach((grupoId, index) => requestEstructuras.input(`gid${index}`, sql.Int, grupoId));
    const filtroProfesor = isProfesor(req)
      ? `
        AND EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.Activo = 1
            AND ad.InstitucionId = eg.InstitucionId
            AND ad.GrupoId = eg.GrupoId
            AND ad.MateriaId = eg.MateriaId
            AND ad.AnioLectivoId = eg.AnioLectivoId
            AND ad.PeriodoId = eg.PeriodoId
            AND ad.UsuarioId = @usuarioId
        )
      `
      : "";

    const estructurasDestinoResult = await requestEstructuras.query(`
      SELECT
        eg.EstructuraGrupoId
      FROM dbo.Eval360_EstructuraGrupo eg
      WHERE eg.InstitucionId = @institucionId
        AND eg.MateriaId = @materiaId
        AND eg.AnioLectivoId = @anioLectivoId
        AND eg.PeriodoId = @periodoId
        AND eg.Activo = 1
        AND eg.GrupoId IN (${placeholdersGrupos})
        ${filtroProfesor}
    `);
    const estructurasDestinoIds = (estructurasDestinoResult.recordset || [])
      .map((item: any) => Number(item.EstructuraGrupoId))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    if (!estructurasDestinoIds.length) {
      return badRequest(res, "No hay secciones con plantilla de evaluaciï¿½n activa para eliminar indicadores");
    }

    const indicadoresDestino: any[] = [];
    for (const estructuraGrupoId of estructurasDestinoIds) {
      const indicadoresReq = pool.request()
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId);
      if (nombrePlaneamientoBase) {
        indicadoresReq.input("nombrePlaneamientoBase", sql.NVarChar(200), nombrePlaneamientoBase);
      }
      const indicadoresResult = await indicadoresReq.query(`
          SELECT *
          FROM dbo.Eval360_IndicadorGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND (
              PlaneamientoId = @planeamientoId
              ${nombrePlaneamientoBase ? `
              OR EXISTS (
                SELECT 1
                FROM dbo.Planeamiento p
                WHERE p.PlaneamientoId = Eval360_IndicadorGrupo.PlaneamientoId
                  AND LTRIM(RTRIM(ISNULL(p.Nombre, N''))) = @nombrePlaneamientoBase
              )` : ""}
            )
            AND ISNULL(Activo, 1) = 1
        `);
      indicadoresDestino.push(...(indicadoresResult.recordset || []));
    }

    if (!indicadoresDestino.length) {
      return ok(res, { eliminados: 0 }, "No hay indicadores activos para eliminar");
    }

    const ids = Array.from(new Set(indicadoresDestino.map((item: any) => Number(item.IndicadorGrupoId)).filter(Boolean)));
    const indicadoresConUso = await getIndicadoresConUso(pool, ids);

    if (indicadoresConUso.length) {
      return res.status(409).json({
        ok: false,
        message: mensajeIndicadoresConUso(),
        indicadoresConUso
      });
    }

    await transaction.begin();

    for (const id of ids) {
      await new sql.Request(transaction)
        .input("indicadorGrupoId", sql.Int, id)
        .query(`
          UPDATE dbo.Eval360_IndicadorGrupo
          SET Activo = 0,
              UpdatedAt = SYSDATETIME()
          WHERE IndicadorGrupoId = @indicadorGrupoId
        `);
    }

    await transaction.commit();

    return ok(res, { eliminados: ids.length, estructurasAplicadas: estructurasDestinoIds.length }, "Indicadores eliminados correctamente");
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {}
    console.error("Error eliminando indicadores Eval360 del planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron eliminar los indicadores del planeamiento" });
  }
});

router.delete("/indicadores/:id", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;

    const indicadorGrupoId = toRequiredNumber(req.params.id, "indicadorGrupoId", res);
    if (indicadorGrupoId === null) return;

    const pool = await getPool();

    const lookup = await pool.request()
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE IndicadorGrupoId = @indicadorGrupoId
      `);

    const indicador = lookup.recordset[0];
    if (!indicador) return badRequest(res, "No se encontrÃ³ el indicador");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(indicador.EstructuraGrupoId));
    if (!estructura) return;

    const indicadoresConUso = await getIndicadoresConUso(pool, [indicadorGrupoId]);
    if (indicadoresConUso.length) {
      return res.status(409).json({
        ok: false,
        message: mensajeIndicadoresConUso(),
        indicadoresConUso
      });
    }

    await pool.request()
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .query(`
        UPDATE dbo.Eval360_IndicadorGrupo
        SET Activo = 0,
            UpdatedAt = SYSDATETIME()
        WHERE IndicadorGrupoId = @indicadorGrupoId
      `);

    return ok(res, null, "Indicador eliminado correctamente");
  } catch (error) {
    console.error("Error eliminando indicador Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el indicador" });
  }
});


function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRubroCorreoSeguimiento(tipoUso: string) {
  const key = normalizeKey(tipoUso);
  if (key.includes("TAREA")) return "Tareas";
  if (key.includes("COTIDIAN")) return "Trabajo cotidiano";
  return normalizeText(tipoUso) || "Seguimiento diario";
}

async function callOpenAiGeneric(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EVAL360_MODEL || process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.2
    })
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("Error OpenAI Eval360 exï¿½menes:", text);
    return null;
  }
  const data: any = await response.json();
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "";
}

async function ensureEval360ExamenIATable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Eval360_ExamenIAGenerado', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Eval360_ExamenIAGenerado (
        ExamenIAGeneradoId INT IDENTITY(1,1) PRIMARY KEY,
        EstructuraGrupoId INT NOT NULL,
        ActividadIdTabla INT NOT NULL,
        UsuarioId INT NULL,
        PlantillaPromptIAId INT NULL,
        Nombre NVARCHAR(250) NOT NULL,
        Materia NVARCHAR(150) NULL,
        Grado NVARCHAR(120) NULL,
        Periodo NVARCHAR(120) NULL,
        TipoColegio NVARCHAR(120) NULL,
        SeccionesJson NVARCHAR(MAX) NULL,
        FormatoSalidaNombre NVARCHAR(255) NULL,
        Indicaciones NVARCHAR(MAX) NULL,
        DocumentoApoyoNombre NVARCHAR(255) NULL,
        EncabezadoJson NVARCHAR(MAX) NULL,
        PromptGenerado NVARCHAR(MAX) NULL,
        ResultadoIA NVARCHAR(MAX) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Eval360_ExamenIAGenerado_Activo DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ExamenIAGenerado_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL
      );
    END;

    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FormatoSalidaMimeType') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_ExamenIAGenerado
      ADD FormatoSalidaMimeType NVARCHAR(150) NULL;
    END;

    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FormatoSalidaDocxBase64') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_ExamenIAGenerado
      ADD FormatoSalidaDocxBase64 NVARCHAR(MAX) NULL;
    END;

    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FuenteWord') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_ExamenIAGenerado
      ADD FuenteWord NVARCHAR(120) NULL;
    END;

    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'TamanoWordPt') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_ExamenIAGenerado
      ADD TamanoWordPt INT NULL;
    END;
  `);
}

async function ensureEval360SeguimientoRecuperacionColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacion') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_SeguimientoIndicador
      ADD ActRecuperacion BIT NOT NULL CONSTRAINT DF_Eval360_SeguimientoIndicador_ActRecuperacion DEFAULT(0);
    END;

    IF COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacionTexto') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_SeguimientoIndicador
      ADD ActRecuperacionTexto NVARCHAR(MAX) NULL;
    END;
  `);
}

function toHtmlWithLineBreaks(value: any) {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

const MAIL_FROM_NOTIFICACIONES = "info@profe360cr.com";

async function sendEmailWithFallback(input: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
}) {
  try {
    return await sendEmail({
      from: MAIL_FROM_NOTIFICACIONES,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html: input.html,
      text: input.text
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
      text: input.text
    });
  }
}

function getReadableError(error: any) {
  const direct =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.error?.message ||
    error?.message;
  if (direct && String(direct).trim()) return String(direct).trim();
  try {
    return JSON.stringify(error);
  } catch {
    return "Error desconocido enviando correo";
  }
}

async function ensureMensajesSeguimientoTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.MensajeSeguimiento', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MensajeSeguimiento (
        MensajeSeguimientoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        TipoUso NVARCHAR(30) NOT NULL,
        ValorNivel INT NULL,
        Titulo NVARCHAR(200) NULL,
        Cuerpo NVARCHAR(MAX) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_MensajeSeguimiento_Activo DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MensajeSeguimiento_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL
      );
      CREATE INDEX IX_MensajeSeguimiento_InstitucionTipo
        ON dbo.MensajeSeguimiento (InstitucionId, TipoUso, ValorNivel, Activo);
    END
  `);
}

function normalizeTipoUsoMensaje(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.includes("COTIDIAN")) return "COTIDIANO";
  if (raw.includes("TAREA")) return "TAREA";
  if (raw.includes("ASIST")) return "ASISTENCIA";
  if (raw.includes("EXAM") || raw.includes("PRUEBA")) return "EXAMEN";
  return "";
}

async function resolverMensajeSeguimiento(pool: any, institucionId: number, tipoUso: string, valorNivel?: number | null) {
  await ensureMensajesSeguimientoTable(pool);
  const tipo = normalizeTipoUsoMensaje(tipoUso);
  if (!tipo) return null;
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), tipo)
    .input("valorNivel", sql.Int, (valorNivel === 0 || (valorNivel && [1, 2, 3].includes(Number(valorNivel)))) ? Number(valorNivel) : null)
    .query(`
      SELECT TOP 1 Titulo, Cuerpo
      FROM dbo.MensajeSeguimiento
      WHERE InstitucionId = @institucionId
        AND TipoUso = @tipoUso
        AND Activo = 1
        AND (ValorNivel = @valorNivel OR ValorNivel IS NULL)
      ORDER BY CASE WHEN ValorNivel = @valorNivel THEN 0 ELSE 1 END, MensajeSeguimientoId DESC
    `);
  return result.recordset[0] || null;
}

async function getCorreoNotificacionConfig(pool: any, institucionId: number, tipoUso: string) {
  const tipo = normalizeTipoUsoMensaje(tipoUso);
  if (!tipo) return null;
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), tipo)
    .query(`
      SELECT TOP 1 FromEmail, ParaModo, CcModo, AsuntoTemplate, CuerpoTemplate
      FROM dbo.CorreoNotificacionConfig
      WHERE InstitucionId = @institucionId
        AND TipoUso = @tipoUso
        AND Activo = 1
    `);
  return result.recordset[0] || null;
}

function renderTemplate(text: string, vars: Record<string, string>) {
  let out = String(text || "");
  for (const key of Object.keys(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), vars[key] || "");
  }
  return out;
}

function buildSeguimientoCorreo(params: {
  estudianteNombre: string;
  tipoUso: string;
  materiaNombre?: string | null;
  anioNombre?: string | null;
  indicadorBase: string;
  estadoLabel: string;
  observacion?: string | null;
}) {
  const observacion = normalizeText(params.observacion);
  const rubro = getRubroCorreoSeguimiento(params.tipoUso);
  const materia = normalizeText(params.materiaNombre) || "Materia";
  const anio = normalizeText(params.anioNombre) || "aÃ±o lectivo";
  const subject = `${params.estudianteNombre}-${rubro}-${materia} aÃ±o lectivo ${anio}`;
  const text = observacion || `Se informa seguimiento acadÃ©mico de ${params.estudianteNombre}. Rubro: ${rubro}. Indicador: ${params.indicadorBase}. Resultado: ${params.estadoLabel}.`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px; color: #1e3a8a;">Seguimiento acadÃ©mico Profe360</h2>
      <p>${escapeHtml(text)}</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0;" />
      <p><strong>Estudiante:</strong> ${escapeHtml(params.estudianteNombre)}</p>
      <p><strong>Rubro:</strong> ${escapeHtml(rubro)}</p>
      <p><strong>Materia:</strong> ${escapeHtml(materia)}</p>
      <p><strong>AÃ±o lectivo:</strong> ${escapeHtml(anio)}</p>
      <p><strong>Indicador:</strong> ${escapeHtml(params.indicadorBase)}</p>
      <p><strong>Resultado:</strong> ${escapeHtml(params.estadoLabel)}</p>
      <p style="margin-top: 20px; color: #475569;">Este correo fue enviado desde Profe360 por seguimiento acadÃ©mico.</p>
    </div>`;
  return { subject, text, html };
}

function buildSeguimientoMensaje(params: {
  estudianteNombre: string;
  tipoUso: string;
  indicadorBase: string;
  estadoLabel: string;
  observacion?: string | null;
}) {
  const correo = buildSeguimientoCorreo(params);
  return { text: correo.text, html: correo.html };
}

function normalizeWhatsAppPhone(raw?: string | null) {
  const original = String(raw || "").trim();
  if (!original) return "";
  const normalized = original.replace(/[^\d+]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("+")) return normalized;
  return `+${normalized}`;
}

async function sendWhatsAppSeguimiento(params: { telefono?: string | null; mensaje: string }) {
  const telefono = normalizeWhatsAppPhone(params.telefono);
  if (!telefono) return { enviado: false, modo: "omitido", motivo: "Sin telï¿½fono vï¿½lido de encargado" };

  const mode = String(process.env.WHATSAPP_MODE || "simulado").trim().toLowerCase();
  const provider = String(process.env.WHATSAPP_PROVIDER || "generic").trim().toLowerCase();
  const webhookUrl = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  const webhookToken = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const webhookAuthHeader = String(process.env.WHATSAPP_WEBHOOK_AUTH_HEADER || "Authorization").trim() || "Authorization";
  const fromNumber = normalizeWhatsAppPhone(process.env.WHATSAPP_FROM_NUMBER || "");

  if (mode !== "webhook" || !webhookUrl) {
    console.log("WhatsApp seguimiento simulado:", { telefono, mensaje: params.mensaje });
    return { enviado: false, modo: "simulado", telefono, motivo: webhookUrl ? "WHATSAPP_MODE no es webhook" : "WHATSAPP_WEBHOOK_URL no configurado" };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    let payload: Record<string, any> = {
      telefono,
      mensaje: String(params.mensaje || ""),
      canal: "whatsapp",
      origen: "profe360-seguimiento"
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
      console.error("Error enviando WhatsApp por webhook:", response.status, snippet);
      return { enviado: false, modo: "webhook", telefono, status: response.status, error: snippet || "Respuesta no OK del proveedor" };
    }

    return { enviado: true, modo: "webhook", telefono, status: response.status };
  } catch (error: any) {
    const readable = String(error?.message || error || "Error desconocido");
    console.error("Excepciï¿½n enviando WhatsApp por webhook:", readable);
    return { enviado: false, modo: "webhook", telefono, error: readable };
  }
}

function isAdultByBirthDate(fechaNacimiento?: string | Date | null) {
  if (!fechaNacimiento) return false;
  const dob = new Date(fechaNacimiento);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 18;
}

function resolveWhatsAppPhonesForStudent(params: {
  fechaNacimiento?: string | Date | null;
  telefonoEstudiante?: string | null;
  telefonosEncargados?: string[];
}) {
  const isAdult = isAdultByBirthDate(params.fechaNacimiento);
  const telefonoEstudiante = String(params.telefonoEstudiante || "").trim();
  if (isAdult && telefonoEstudiante) return [telefonoEstudiante];
  return Array.from(new Set((params.telefonosEncargados || []).map((t) => String(t || "").trim()).filter(Boolean)));
}

async function ensureReporteEnvioBitacoraTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.ReporteEnvioBitacora', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ReporteEnvioBitacora (
        ReporteEnvioBitacoraId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Modulo NVARCHAR(40) NOT NULL,
        RegistroClave NVARCHAR(200) NOT NULL,
        GrupoId INT NULL,
        MateriaId INT NULL,
        PeriodoId INT NULL,
        AnioLectivoId INT NULL,
        EstudianteId INT NULL,
        Fecha DATE NULL,
        CorreoEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Correo DEFAULT(0),
        WaEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Wa DEFAULT(0),
        UltimoEnvioAt DATETIME2 NULL,
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_UpdatedAt DEFAULT(SYSDATETIME()),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_ReporteEnvioBitacora_ModuloClave ON dbo.ReporteEnvioBitacora(Modulo, RegistroClave);
      CREATE INDEX IX_ReporteEnvioBitacora_Filtros ON dbo.ReporteEnvioBitacora(GrupoId, MateriaId, PeriodoId, AnioLectivoId, EstudianteId, Fecha);
    END
  `);
}

async function ensureNotaEdicionAuditoriaTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Eval360_NotaEdicionAuditoria', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Eval360_NotaEdicionAuditoria (
        NotaEdicionAuditoriaId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        NotaActividadId INT NOT NULL,
        ActividadId INT NOT NULL,
        EstudianteId INT NOT NULL,
        EstructuraGrupoId INT NOT NULL,
        EstructuraGrupoDetalleId INT NOT NULL,
        PorcentajeAnterior DECIMAL(10,2) NOT NULL,
        PorcentajeNuevo DECIMAL(10,2) NOT NULL,
        NotaAnterior DECIMAL(10,2) NOT NULL,
        NotaNueva DECIMAL(10,2) NOT NULL,
        PuntosAnterior DECIMAL(10,2) NOT NULL,
        PuntosNuevo DECIMAL(10,2) NOT NULL,
        Justificacion NVARCHAR(1000) NOT NULL,
        UsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_NotaEdicionAuditoria_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE INDEX IX_Eval360_NotaEdicionAuditoria_ActividadEstudiante
        ON dbo.Eval360_NotaEdicionAuditoria (ActividadId, EstudianteId, CreatedAt DESC);
    END
  `);
}

async function ensureComponenteAjusteManualTables(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Eval360_ComponenteAjusteManual', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Eval360_ComponenteAjusteManual (
        ComponenteAjusteManualId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EstructuraGrupoId INT NOT NULL,
        EstructuraGrupoDetalleId INT NOT NULL,
        EstudianteId INT NOT NULL,
        PorcentajeObtenidoComponente DECIMAL(10,2) NOT NULL,
        Justificacion NVARCHAR(1000) NULL,
        UsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManual_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManual_UpdatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_Eval360_ComponenteAjusteManual_Key
        ON dbo.Eval360_ComponenteAjusteManual (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId);
    END

    IF OBJECT_ID('dbo.Eval360_ComponenteAjusteManualAuditoria', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Eval360_ComponenteAjusteManualAuditoria (
        ComponenteAjusteManualAuditoriaId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EstructuraGrupoId INT NOT NULL,
        EstructuraGrupoDetalleId INT NOT NULL,
        EstudianteId INT NOT NULL,
        PorcentajeAnterior DECIMAL(10,2) NOT NULL,
        PorcentajeNuevo DECIMAL(10,2) NOT NULL,
        Justificacion NVARCHAR(1000) NOT NULL,
        UsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManualAuditoria_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE INDEX IX_Eval360_ComponenteAjusteManualAuditoria_Key
        ON dbo.Eval360_ComponenteAjusteManualAuditoria (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, CreatedAt DESC);
    END
  `);
}

async function upsertReporteEnvioBitacora(pool: any, payload: {
  modulo: string;
  registroClave: string;
  grupoId?: number | null;
  materiaId?: number | null;
  periodoId?: number | null;
  anioLectivoId?: number | null;
  estudianteId?: number | null;
  fecha?: string | null;
  correoEnviado?: boolean;
  waEnviado?: boolean;
}) {
  await pool.request()
    .input("modulo", sql.NVarChar(40), String(payload.modulo || "").trim().toUpperCase())
    .input("registroClave", sql.NVarChar(200), String(payload.registroClave || "").trim())
    .input("grupoId", sql.Int, payload.grupoId || null)
    .input("materiaId", sql.Int, payload.materiaId || null)
    .input("periodoId", sql.Int, payload.periodoId || null)
    .input("anioLectivoId", sql.Int, payload.anioLectivoId || null)
    .input("estudianteId", sql.Int, payload.estudianteId || null)
    .input("fecha", sql.Date, payload.fecha || null)
    .input("correoEnviado", sql.Bit, payload.correoEnviado ? 1 : 0)
    .input("waEnviado", sql.Bit, payload.waEnviado ? 1 : 0)
    .query(`
      MERGE dbo.ReporteEnvioBitacora AS target
      USING (
        SELECT
          @modulo AS Modulo,
          @registroClave AS RegistroClave
      ) AS source
      ON target.Modulo = source.Modulo
         AND target.RegistroClave = source.RegistroClave
      WHEN MATCHED THEN
        UPDATE SET
          GrupoId = COALESCE(@grupoId, target.GrupoId),
          MateriaId = COALESCE(@materiaId, target.MateriaId),
          PeriodoId = COALESCE(@periodoId, target.PeriodoId),
          AnioLectivoId = COALESCE(@anioLectivoId, target.AnioLectivoId),
          EstudianteId = COALESCE(@estudianteId, target.EstudianteId),
          Fecha = COALESCE(@fecha, target.Fecha),
          CorreoEnviado = CASE WHEN @correoEnviado = 1 THEN 1 ELSE target.CorreoEnviado END,
          WaEnviado = CASE WHEN @waEnviado = 1 THEN 1 ELSE target.WaEnviado END,
          UltimoEnvioAt = CASE WHEN @correoEnviado = 1 OR @waEnviado = 1 THEN SYSDATETIME() ELSE target.UltimoEnvioAt END,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (Modulo, RegistroClave, GrupoId, MateriaId, PeriodoId, AnioLectivoId, EstudianteId, Fecha, CorreoEnviado, WaEnviado, UltimoEnvioAt, UpdatedAt, CreatedAt)
        VALUES (@modulo, @registroClave, @grupoId, @materiaId, @periodoId, @anioLectivoId, @estudianteId, @fecha, @correoEnviado, @waEnviado, CASE WHEN @correoEnviado = 1 OR @waEnviado = 1 THEN SYSDATETIME() ELSE NULL END, SYSDATETIME(), SYSDATETIME());
    `);
}

function getEstadoLabelSeguimiento(estado: string) {
  if (estado === "NO_ENTREGADO") return "No entregado";
  if (estado === "AUSENTE") return "Ausente";
  if (estado === "INTERMEDIO") return "Intermedio";
  if (estado === "AVANZADO") return "Avanzado";
  return "Inicial";
}

const MAPA_SEGUIMIENTO_NIVELES: Record<string, { valor: number; orden: number }> = {
  INICIAL: { valor: 1, orden: 1 },
  INTERMEDIO: { valor: 2, orden: 2 },
  AVANZADO: { valor: 3, orden: 3 },
  AUSENTE: { valor: 0, orden: 4 },
  NO_ENTREGADO: { valor: 0, orden: 4 }
};

function normalizarEstadoSeguimiento(value: any, tipoUso?: string) {
  const key = normalizeKey(value).replace(/\s+/g, "_");
  if (["INICIAL", "INTERMEDIO", "AVANZADO", "AUSENTE", "NO_ENTREGADO"].includes(key)) return key;
  return normalizeKey(tipoUso).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE";
}

async function getOrCreateNivelSeguimiento(transaction: any, estructuraGrupoId: number, estado: string) {
  const meta = MAPA_SEGUIMIENTO_NIVELES[estado] || MAPA_SEGUIMIENTO_NIVELES.INICIAL;
  const nombre = estado === "NO_ENTREGADO" ? "No entregado" : estado === "AUSENTE" ? "Ausente" : estado.charAt(0) + estado.slice(1).toLowerCase();

  const existing = await new sql.Request(transaction)
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("nombre", sql.NVarChar(100), nombre)
    .query(`
      SELECT TOP 1 NivelDesempenoGrupoId
      FROM dbo.Eval360_NivelDesempenoGrupo
      WHERE EstructuraGrupoId = @estructuraGrupoId
        AND Nombre = @nombre
    `);

  if (existing.recordset[0]) return Number(existing.recordset[0].NivelDesempenoGrupoId);

  const inserted = await new sql.Request(transaction)
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("nombre", sql.NVarChar(100), nombre)
    .input("valor", sql.Decimal(10, 2), meta.valor)
    .input("orden", sql.Int, meta.orden)
    .query(`
      INSERT INTO dbo.Eval360_NivelDesempenoGrupo
        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
      OUTPUT INSERTED.NivelDesempenoGrupoId
      VALUES
        (@estructuraGrupoId, @nombre, @valor, @orden, 1)
    `);

  return Number(inserted.recordset[0].NivelDesempenoGrupoId);
}

async function recalcularNotaActividadIndicadores(transaction: any, params: {
  estructuraGrupoId: number;
  estructuraGrupoDetalleId: number;
  actividadId: number;
}) {
  const estudiantesResult = await new sql.Request(transaction)
    .input("actividadId", sql.Int, params.actividadId)
    .query(`
      SELECT DISTINCT EstudianteId
      FROM dbo.Eval360_SeguimientoIndicador
      WHERE ActividadId = @actividadId
    `);

  const indicadoresResult = await new sql.Request(transaction)
    .input("actividadId", sql.Int, params.actividadId)
    .query(`
      SELECT COUNT(DISTINCT IndicadorGrupoId) AS TotalIndicadores
      FROM dbo.Eval360_ActividadIndicador
      WHERE ActividadId = @actividadId
        AND ISNULL(Activo, 1) = 1
    `);

  const totalIndicadores = Number(indicadoresResult.recordset[0]?.TotalIndicadores || 0);
  const puntosMaximos = totalIndicadores * 3;

  for (const estudiante of estudiantesResult.recordset || []) {
    const estudianteId = Number(estudiante.EstudianteId);
    const resumenResult = await new sql.Request(transaction)
      .input("actividadId", sql.Int, params.actividadId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        SELECT ISNULL(SUM(ValorSeleccionado), 0) AS PuntosObtenidos
        FROM dbo.Eval360_SeguimientoIndicador
        WHERE ActividadId = @actividadId
          AND EstudianteId = @estudianteId
      `);

    const puntosObtenidos = Number(resumenResult.recordset[0]?.PuntosObtenidos || 0);
    const porcentajeObtenido = puntosMaximos > 0 ? Number(((puntosObtenidos / puntosMaximos) * 100).toFixed(2)) : 0;

    await new sql.Request(transaction)
      .input("actividadId", sql.Int, params.actividadId)
      .input("estudianteId", sql.Int, estudianteId)
      .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)
      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
      .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)
      .query(`
        UPDATE dbo.Eval360_NotaActividad
        SET PuntosObtenidos = @puntosObtenidos,
            PuntosMaximos = @puntosMaximos,
            PorcentajeObtenido = @porcentajeObtenido,
            UpdatedAt = SYSDATETIME()
        WHERE ActividadId = @actividadId
          AND EstudianteId = @estudianteId;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO dbo.Eval360_NotaActividad
            (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, CreatedAt)
          VALUES
            (@actividadId, @estudianteId, @puntosObtenidos, @puntosMaximos, @porcentajeObtenido, SYSDATETIME());
        END
      `);
  }
}

async function sincronizarNotaFormalDesdeActividad(transaction: any, params: {
  estructuraGrupoId: number;
  estructuraGrupoDetalleId: number;
  actividadId: number;
}) {
  const contextoResult = await new sql.Request(transaction)
    .input("estructuraGrupoId", sql.Int, params.estructuraGrupoId)
    .input("estructuraGrupoDetalleId", sql.Int, params.estructuraGrupoDetalleId)
    .input("actividadId", sql.Int, params.actividadId)
    .query(`
      SELECT TOP 1
        eg.GrupoId,
        eg.MateriaId,
        eg.PeriodoId,
        eg.PlantillaBaseId,
        d.Nombre AS ComponenteNombre,
        a.Nombre AS ActividadNombre
      FROM dbo.Eval360_EstructuraGrupo eg
      INNER JOIN dbo.Eval360_EstructuraGrupoDetalle d ON d.EstructuraGrupoId = eg.EstructuraGrupoId
      INNER JOIN dbo.Eval360_Actividad a ON a.EstructuraGrupoDetalleId = d.EstructuraGrupoDetalleId
      WHERE eg.EstructuraGrupoId = @estructuraGrupoId
        AND d.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
        AND a.ActividadId = @actividadId
    `);

  const contexto = contextoResult.recordset[0];
  if (!contexto?.PlantillaBaseId) return;

  const actividadPlantillaResult = await new sql.Request(transaction)
    .input("plantillaId", sql.Int, Number(contexto.PlantillaBaseId))
    .input("componenteNombre", sql.NVarChar(150), contexto.ComponenteNombre || "")
    .input("actividadNombre", sql.NVarChar(200), contexto.ActividadNombre || "")
    .query(`
      SELECT TOP 1
        ea.EvaluacionActividadId,
        CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,4)) AS PorcentajeReal
      FROM dbo.EvaluacionActividad ea
      INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
      WHERE ec.EvaluacionPlantillaId = @plantillaId
        AND ISNULL(ec.Activo, 1) = 1
        AND ISNULL(ea.Activo, 1) = 1
        AND UPPER(LTRIM(RTRIM(ec.Descripcion))) = UPPER(LTRIM(RTRIM(@componenteNombre)))
        AND UPPER(LTRIM(RTRIM(ea.Descripcion))) = UPPER(LTRIM(RTRIM(@actividadNombre)))
      ORDER BY ea.Orden, ea.EvaluacionActividadId
    `);

  const actividadPlantilla = actividadPlantillaResult.recordset[0];
  if (!actividadPlantilla) return;

  const notasResult = await new sql.Request(transaction)
    .input("actividadId", sql.Int, params.actividadId)
    .query(`
      SELECT EstudianteId, NotaObtenida
      FROM dbo.Eval360_NotaActividad
      WHERE ActividadId = @actividadId
    `);

  for (const nota of notasResult.recordset || []) {
    const notaObtenida = Number(nota.NotaObtenida || 0);
    const porcentajeGanado = Number(((notaObtenida * Number(actividadPlantilla.PorcentajeReal || 0)) / 100).toFixed(4));

    await new sql.Request(transaction)
      .input("evaluacionActividadId", sql.Int, Number(actividadPlantilla.EvaluacionActividadId))
      .input("estudianteId", sql.Int, Number(nota.EstudianteId))
      .input("grupoId", sql.Int, Number(contexto.GrupoId))
      .input("materiaId", sql.Int, Number(contexto.MateriaId))
      .input("periodoId", sql.Int, Number(contexto.PeriodoId))
      .input("nota", sql.Decimal(10, 2), notaObtenida)
      .input("porcentajeGanado", sql.Decimal(10, 4), porcentajeGanado)
      .query(`
        UPDATE dbo.EvaluacionNota
        SET Nota = @nota,
            PorcentajeGanado = @porcentajeGanado,
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionActividadId = @evaluacionActividadId
          AND EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND PeriodoId = @periodoId;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO dbo.EvaluacionNota
            (EvaluacionActividadId, EstudianteId, GrupoId, MateriaId, PeriodoId, Nota, PorcentajeGanado, Observacion, CreatedAt)
          VALUES
            (@evaluacionActividadId, @estudianteId, @grupoId, @materiaId, @periodoId, @nota, @porcentajeGanado, N'Calculada desde indicadores', SYSDATETIME());
        END
      `);
  }
}

router.get("/seguimiento/contexto", async (req, res) => {
  try {
    const t0 = Date.now();
    if (!assertCanAccess(req, res)) return;

    const grupoId = toRequiredNumber(req.query.grupoId, "grupoId", res);
    const materiaId = toRequiredNumber(req.query.materiaId, "materiaId", res);
    const anioLectivoId = toRequiredNumber(req.query.anioLectivoId, "anioLectivoId", res);
    const periodoId = toRequiredNumber(req.query.periodoId, "periodoId", res);
    const sincronizarSolicitado = ["1", "true", "si", "sï¿½"].includes(
      String(req.query.sincronizar ?? "").trim().toLowerCase()
    );
    if (grupoId === null || materiaId === null || anioLectivoId === null || periodoId === null) return;

    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId });
    if (!asignacion) return;

    const institucionId = !isSuperAdmin(req) ? getInstitutionId(req, res) : Number(asignacion.InstitucionId || 0);
    if (institucionId === null) return;

    const cacheKey = `${institucionId}|${grupoId}|${materiaId}|${anioLectivoId}|${periodoId}`;
    const canUseCache = !sincronizarSolicitado;
    if (canUseCache) {
      const cached = contextoCache.get(cacheKey);
      if (cached && Date.now() - cached.at <= CONTEXTO_CACHE_TTL_MS) {
        console.log(`[eval360.contexto.cache.hit] ${cacheKey}`);
        return ok(res, cached.data);
      }
      const inFlight = contextoInFlight.get(cacheKey);
      if (inFlight) {
        console.log(`[eval360.contexto.cache.join] ${cacheKey}`);
        const sharedData = await inFlight;
        return ok(res, sharedData);
      }
    }

    const loadContextPromise = (async () => {
      const pool = await getPool();
      await ensureComponenteAjusteManualTables(pool);

      const estructuraResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 eg.*, ep.Nombre AS PlantillaBaseNombre
        FROM dbo.Eval360_EstructuraGrupo eg
        LEFT JOIN dbo.EvaluacionPlantilla ep ON ep.EvaluacionPlantillaId = eg.PlantillaBaseId
        WHERE eg.InstitucionId = @institucionId
          AND eg.GrupoId = @grupoId
          AND eg.MateriaId = @materiaId
          AND eg.AnioLectivoId = @anioLectivoId
          AND eg.PeriodoId = @periodoId
          AND eg.Activo = 1
        ORDER BY eg.EstructuraGrupoId DESC
      `);

      const estructura = estructuraResult.recordset[0] || null;
      const estructuraGrupoId = estructura ? Number(estructura.EstructuraGrupoId) : 0;

    if (sincronizarSolicitado && estructuraGrupoId && Number(estructura?.PlantillaBaseId || 0) > 0) {
      await timedQuery("eval360.contexto.syncFaltantes", () =>
        sincronizarEstructuraConPlantillaSiFaltan(pool, estructuraGrupoId, Number(estructura.PlantillaBaseId))
      );

      const examenPlantillaCheck = await timedQuery("eval360.contexto.syncCheckPlantillaExamen", () =>
        pool.request()
          .input("plantillaBaseId", sql.Int, Number(estructura.PlantillaBaseId))
          .query(`
            SELECT TOP 1 ec.EvaluacionComponenteId
            FROM dbo.EvaluacionComponente ec
            WHERE ec.EvaluacionPlantillaId = @plantillaBaseId
              AND ISNULL(ec.Activo, 1) = 1
              AND (
                UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'
                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'
                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'
                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'
                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'
                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'
                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'
                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'
              )
          `)
      );

      if (examenPlantillaCheck.recordset[0]) {
        const examenDetalleCheck = await timedQuery("eval360.contexto.syncCheckDetalleExamen", () =>
          pool.request()
            .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
            .query(`
              SELECT TOP 1 d.EstructuraGrupoDetalleId
              FROM dbo.Eval360_EstructuraGrupoDetalle d
              LEFT JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId
              WHERE d.EstructuraGrupoId = @estructuraGrupoId
                AND ISNULL(d.Activo, 1) = 1
                AND (
                  UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'
                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'
                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'
                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'
                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'
                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'
                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'
                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'
                )
            `)
        );

        if (!examenDetalleCheck.recordset[0]) {
          await timedQuery("eval360.contexto.syncForzadoExamen", () =>
            sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(estructura.PlantillaBaseId))
          );
        }
      }
    }

      const [plantillas, estudiantes, planeamientos] = await Promise.all([
      timedQuery("eval360.contexto.plantillas", () => pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT EvaluacionPlantillaId, Nombre, Estado, DecimalesNota, PermitirProfesorEditar
          FROM dbo.EvaluacionPlantilla
          WHERE InstitucionId = @institucionId
            AND ISNULL(Activo, 1) = 1
            AND ISNULL(Estado, N'ACTIVA') <> N'INACTIVA'
          ORDER BY Nombre
        `)),
      timedQuery("eval360.contexto.estudiantes", () => pool.request()
        .input("grupoId", sql.Int, grupoId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .query(`
          SELECT
            e.EstudianteId,
            e.Identificacion,
            e.Nombre,
            e.PrimerApellido,
            e.SegundoApellido,
            e.Correo,
            e.Telefono,
            e.AutorizaWhatsAppEncargado,
            enc.NombreCompleto AS EncargadoPrincipalNombre,
            enc.Correo AS EncargadoPrincipalCorreo,
            enc.Telefono AS EncargadoPrincipalTelefono,
            encWa.Detalle AS EncargadosWhatsAppDetalle,
            m.MatriculaId,
            m.Estado AS EstadoMatricula
          FROM dbo.Matricula m
          INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
          OUTER APPLY (
            SELECT TOP 1
              CONCAT(en.Nombre, N' ', ISNULL(en.PrimerApellido, N''), N' ', ISNULL(en.SegundoApellido, N'')) AS NombreCompleto,
              en.Correo,
              en.Telefono
            FROM dbo.EstudianteEncargado ee
            INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
            WHERE ee.EstudianteId = e.EstudianteId
              AND ISNULL(ee.Activo, 1) = 1
              AND ISNULL(en.Activo, 1) = 1
            ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC
          ) enc
          OUTER APPLY (
            SELECT
              STUFF((
                SELECT DISTINCT
                  ' | ' +
                  COALESCE(NULLIF(LTRIM(RTRIM(ee2.Parentesco)), ''), CASE WHEN en2.TipoEncargado = 'MADRE' THEN 'Madre' WHEN en2.TipoEncargado = 'PADRE' THEN 'Padre' ELSE 'Encargado' END) +
                  ': ' + LTRIM(RTRIM(ISNULL(en2.Telefono, '')))
                FROM dbo.EstudianteEncargado ee2
                INNER JOIN dbo.Encargado en2 ON en2.EncargadoId = ee2.EncargadoId
                WHERE ee2.EstudianteId = e.EstudianteId
                  AND ISNULL(ee2.Activo, 1) = 1
                  AND ISNULL(en2.Activo, 1) = 1
                  AND ISNULL(ee2.RecibeNotificaciones, 1) = 1
                  AND LTRIM(RTRIM(ISNULL(en2.Telefono, ''))) <> ''
                FOR XML PATH(''), TYPE
              ).value('.', 'nvarchar(max)'), 1, 3, '') AS Detalle
          ) encWa
          WHERE m.GrupoId = @grupoId
            AND m.AnioLectivoId = @anioLectivoId
            AND ISNULL(e.Activo, 1) = 1
            AND ISNULL(m.Estado, N'Activa') IN (N'Activa', N'ACTIVA', N'Activo', N'ACTIVO')
          ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
        `)),
      timedQuery("eval360.contexto.planeamientos", () => pool.request()
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .query(`
          SELECT
            PlaneamientoId,
            Nombre,
            CAST(NULL AS nvarchar(200)) AS Tema,
            ResultadoIAJson,
            FechaInicio,
            FechaFin
          FROM dbo.Planeamiento
          WHERE GrupoId = @grupoId
            AND MateriaId = @materiaId
            AND AnioLectivoId = @anioLectivoId
            AND PeriodoId = @periodoId
            AND ISNULL(Activo, 1) = 1
          ORDER BY CreatedAt DESC, PlaneamientoId DESC
        `))
    ]);

      let detalles: any[] = [];
      let indicadores: any[] = [];
      let seguimientos: any[] = [];
      let actividades: any[] = [];
      let actividadIndicadores: any[] = [];
      let notasActividades: any[] = [];
      let asistenciaRegistros: any[] = [];
      let componenteAjustesManuales: any[] = [];
      let mensajesSeguimiento: any[] = [];

      if (estructuraGrupoId) {
        const [detallesResult, indicadoresResult, seguimientosResult, actividadesResult, actividadIndicadoresResult, notasActividadesResult, asistenciaResult, ajustesManualesResult] = await Promise.all([
        timedQuery("eval360.contexto.detalles", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT d.*, c.Nombre AS ComponenteCatalogoNombre
            FROM dbo.Eval360_EstructuraGrupoDetalle d
            INNER JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId
            WHERE d.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(d.Activo, 1) = 1
            ORDER BY d.Orden, d.EstructuraGrupoDetalleId
          `)),
        timedQuery("eval360.contexto.indicadores", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT i.*, p.Nombre AS PlaneamientoNombre
            FROM dbo.Eval360_IndicadorGrupo i
            LEFT JOIN dbo.Planeamiento p ON p.PlaneamientoId = i.PlaneamientoId
            WHERE i.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(i.Activo, 1) = 1
              AND i.TipoUso IN (N'Cotidiano', N'Tareas', N'TablaEspecificaciones')
            ORDER BY p.Nombre, i.TipoUso, i.IndicadorGrupoId
          `)),
        timedQuery("eval360.contexto.seguimientos", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT
              s.SeguimientoIndicadorId,
              s.ActividadId,
              s.IndicadorGrupoId,
              s.EstudianteId,
              s.NivelDesempenoGrupoId,
              s.ValorSeleccionado,
              s.Observacion,
              CASE WHEN COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacion') IS NULL THEN CAST(0 AS bit) ELSE ISNULL(s.ActRecuperacion, 0) END AS ActRecuperacion,
              CASE WHEN COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacionTexto') IS NULL THEN NULL ELSE s.ActRecuperacionTexto END AS ActRecuperacionTexto,
              ng.Nombre AS NivelNombre,
              a.EstructuraGrupoDetalleId,
              a.Nombre AS ActividadNombre,
              a.Fuente,
              ISNULL(reb.CorreoEnviado, 0) AS CorreoEnviado,
              ISNULL(reb.WaEnviado, 0) AS WaEnviado
            FROM dbo.Eval360_SeguimientoIndicador s
            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = s.ActividadId
            INNER JOIN dbo.Eval360_NivelDesempenoGrupo ng ON ng.NivelDesempenoGrupoId = s.NivelDesempenoGrupoId
            LEFT JOIN dbo.ReporteEnvioBitacora reb
              ON reb.Modulo IN (N'COTIDIANO_INDICADOR', N'TAREAS_INDICADOR')
             AND reb.RegistroClave = CONCAT(
               N'COTI_IND|',
               CONVERT(varchar(20), s.ActividadId), N'|',
               CONVERT(varchar(20), s.IndicadorGrupoId), N'|',
               CONVERT(varchar(20), s.EstudianteId)
             )
            WHERE a.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(a.Activo, 1) = 1
          `)),
        timedQuery("eval360.contexto.actividades", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT
              a.ActividadId,
              a.EstructuraGrupoId,
              a.EstructuraGrupoDetalleId,
              a.Nombre,
              a.Descripcion,
              a.Fecha,
              a.PuntosMaximos,
              a.PorcentajeDentroRubro,
              ISNULL(a.UsaIndicadoresPlaneamiento, 0) AS UsaIndicadoresPlaneamiento,
              a.Fuente,
              a.Activo
            FROM dbo.Eval360_Actividad a
            WHERE a.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(a.Activo, 1) = 1
            ORDER BY a.Fecha, a.ActividadId
          `)),
        timedQuery("eval360.contexto.actividadIndicadores", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT
              ai.ActividadId,
              ai.IndicadorGrupoId,
              ai.Activo,
              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NULL THEN NULL ELSE ai.NumeroLecciones END AS NumeroLecciones,
              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NULL THEN NULL ELSE ai.Puntos END AS Puntos,
              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NULL THEN NULL ELSE ai.DetalleItemsJson END AS DetalleItemsJson
            FROM dbo.Eval360_ActividadIndicador ai
            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId
            WHERE a.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(a.Activo, 1) = 1
              AND ISNULL(ai.Activo, 1) = 1
          `)),
        timedQuery("eval360.contexto.notasActividades", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT
              n.NotaActividadId,
              n.ActividadId,
              n.EstudianteId,
              n.PuntosObtenidos,
              n.PuntosMaximos,
              n.NotaObtenida,
              n.PorcentajeObtenido,
              n.Observacion,
              CASE WHEN nea.NotaEdicionAuditoriaId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS FueEditado,
              ISNULL(reb.CorreoEnviado, 0) AS CorreoEnviado,
              ISNULL(reb.WaEnviado, 0) AS WaEnviado
            FROM dbo.Eval360_NotaActividad n
            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = n.ActividadId
            OUTER APPLY (
              SELECT TOP 1 x.NotaEdicionAuditoriaId
              FROM dbo.Eval360_NotaEdicionAuditoria x
              WHERE x.NotaActividadId = n.NotaActividadId
              ORDER BY x.CreatedAt DESC
            ) nea
            LEFT JOIN dbo.ReporteEnvioBitacora reb
              ON reb.Modulo IN (N'COTIDIANO_ACTIVIDAD', N'TAREAS_ACTIVIDAD')
             AND reb.RegistroClave = CONCAT(
               N'COTI_ACT|',
               CONVERT(varchar(20), n.ActividadId), N'|',
               CONVERT(varchar(20), n.EstudianteId)
             )
            WHERE a.EstructuraGrupoId = @estructuraGrupoId
              AND ISNULL(a.Activo, 1) = 1
          `)),
        timedQuery("eval360.contexto.asistencia", () => pool.request()
          .input("grupoId", sql.Int, grupoId)
          .input("materiaId", sql.Int, materiaId)
          .input("anioLectivoId", sql.Int, anioLectivoId)
          .input("periodoId", sql.Int, periodoId)
          .query(`
            SELECT
              ar.AsistenciaRegistroId,
              ar.EstudianteId,
              ar.Fecha,
              ar.Estado,
              ar.MinutosTardia,
              ar.Observacion,
              ISNULL(reb.CorreoEnviado, 0) AS CorreoEnviado,
              ISNULL(reb.WaEnviado, 0) AS WaEnviado,
              CASE WHEN COL_LENGTH('dbo.AsistenciaRegistro', 'HorarioGrupoId') IS NULL THEN NULL ELSE TRY_CONVERT(int, ar.HorarioGrupoId) END AS HorarioGrupoId,
              hg.BloqueHorarioId,
              bh.Nombre AS BloqueNombre,
              CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
              CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin
            FROM dbo.AsistenciaRegistro ar
            LEFT JOIN dbo.ReporteEnvioBitacora reb
              ON reb.Modulo = N'ASISTENCIA'
             AND reb.RegistroClave = CONCAT(
               N'ASIS|',
               CONVERT(varchar(20), ar.GrupoId), N'|',
               CONVERT(varchar(20), ar.MateriaId), N'|',
               CONVERT(varchar(20), ar.PeriodoId), N'|',
               CONVERT(varchar(10), ar.Fecha, 23), N'|',
               CONVERT(varchar(20), ar.EstudianteId), N'|',
               CONVERT(varchar(20), ISNULL(ar.HorarioGrupoId, 0))
             )
            LEFT JOIN dbo.HorarioGrupo hg ON COL_LENGTH('dbo.AsistenciaRegistro', 'HorarioGrupoId') IS NOT NULL AND hg.HorarioGrupoId = ar.HorarioGrupoId
            LEFT JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
            WHERE ar.GrupoId = @grupoId
              AND ar.MateriaId = @materiaId
              AND ar.AnioLectivoId = @anioLectivoId
              AND ar.PeriodoId = @periodoId
          `)),
        timedQuery("eval360.contexto.ajustesManuales", () => pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .query(`
            SELECT
              EstructuraGrupoId,
              EstructuraGrupoDetalleId,
              EstudianteId,
              PorcentajeObtenidoComponente,
              Justificacion,
              UpdatedAt
            FROM dbo.Eval360_ComponenteAjusteManual
            WHERE EstructuraGrupoId = @estructuraGrupoId
          `))
      ]);

        detalles = detallesResult.recordset;
        indicadores = indicadoresResult.recordset;
        seguimientos = seguimientosResult.recordset;
        actividades = actividadesResult.recordset;
        actividadIndicadores = actividadIndicadoresResult.recordset;
        notasActividades = notasActividadesResult.recordset;
        asistenciaRegistros = asistenciaResult.recordset;
        componenteAjustesManuales = ajustesManualesResult.recordset;
      }

      mensajesSeguimiento = (await timedQuery("eval360.contexto.mensajesSeguimiento", () => pool.request()
      .input("institucionId", sql.Int, Number(institucionId || 0))
      .query(`
        SELECT
          MensajeSeguimientoId,
          TipoUso,
          ValorNivel,
          Titulo,
          Cuerpo
        FROM dbo.MensajeSeguimiento
        WHERE InstitucionId = @institucionId
          AND Activo = 1
        ORDER BY TipoUso, CASE WHEN ValorNivel IS NULL THEN 0 ELSE 1 END, MensajeSeguimientoId DESC
      `))).recordset;

      const data = {
        estructura,
        detalles,
        plantillas: plantillas.recordset,
        estudiantes: estudiantes.recordset,
        planeamientos: planeamientos.recordset,
        indicadores,
        actividades,
        actividadIndicadores,
        notasActividades,
        asistenciaRegistros,
        componenteAjustesManuales,
        seguimientos,
        mensajesSeguimiento
      };
      return data;
    })();

    if (canUseCache) {
      contextoInFlight.set(cacheKey, loadContextPromise);
    }

    let data: any;
    try {
      data = await loadContextPromise;
    } finally {
      if (canUseCache) contextoInFlight.delete(cacheKey);
    }

    if (canUseCache) {
      contextoCache.set(cacheKey, { at: Date.now(), data });
    }

    console.log(`[eval360.contexto.total] ${Date.now() - t0}ms`);
    return ok(res, data);
  } catch (error) {
    console.error("Error cargando contexto de seguimiento Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el seguimiento de notas" });
  }
});

router.post("/seguimiento/asignar-indicadores-actividad", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;

    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);
    const permitirMultiplesActividades = Boolean(req.body.permitirMultiplesActividades);
    const indicadorIds = Array.isArray(req.body.indicadorIds) ? req.body.indicadorIds.map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0) : [];
    const asignacionesRaw = Array.isArray(req.body.asignaciones) ? req.body.asignaciones : [];
    const asignacionesMap = new Map<number, { numeroLecciones: number; puntos: number; detalleItemsJson: string }>();
    for (const item of asignacionesRaw) {
      const indicadorId = Number(item?.indicadorId || 0);
      if (!Number.isFinite(indicadorId) || indicadorId <= 0) continue;
      const numeroLecciones = Number(item?.numeroLecciones ?? 0);
      const puntos = Number(item?.puntos ?? 0);
      const detalleItems = item?.detalleItems && typeof item.detalleItems === "object" ? item.detalleItems : {};
      asignacionesMap.set(indicadorId, {
        numeroLecciones: Number.isFinite(numeroLecciones) ? numeroLecciones : 0,
        puntos: Number.isFinite(puntos) ? puntos : 0,
        detalleItemsJson: JSON.stringify(detalleItems || {})
      });
    }

    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;

    const actividadResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 ActividadId
        FROM dbo.Eval360_Actividad
        WHERE ActividadId = @actividadId
          AND EstructuraGrupoId = @estructuraGrupoId
          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
          AND ISNULL(Activo, 1) = 1
      `);

    if (!actividadResult.recordset[0]) return badRequest(res, "La actividad no pertenece al componente seleccionado");

    const placeholders = indicadorIds.map((_, index) => `@indicadorId${index}`).join(", ");
    const requestIndicadores = pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("actividadId", sql.Int, actividadId);
    indicadorIds.forEach((id: number, index: number) => requestIndicadores.input(`indicadorId${index}`, sql.Int, id));

    if (indicadorIds.length) {
      const indicadoresValidos = await requestIndicadores.query(`
        SELECT IndicadorGrupoId
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND ISNULL(Activo, 1) = 1
          AND IndicadorGrupoId IN (${placeholders})
      `);
      if ((indicadoresValidos.recordset || []).length !== indicadorIds.length) {
        return badRequest(res, "Hay indicadores invï¿½lidos o fuera de este grupo");
      }

      if (!permitirMultiplesActividades) {
        const indicadoresAsignadosOtraActividad = await requestIndicadores.query(`
          SELECT DISTINCT ai.IndicadorGrupoId
          FROM dbo.Eval360_ActividadIndicador ai
          INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId
          WHERE a.EstructuraGrupoId = @estructuraGrupoId
            AND ai.IndicadorGrupoId IN (${placeholders})
            AND ai.ActividadId <> @actividadId
            AND ISNULL(ai.Activo, 1) = 1
        `);
        if ((indicadoresAsignadosOtraActividad.recordset || []).length > 0) {
          return badRequest(res, "Uno o mï¿½s indicadores ya estï¿½n asignados a otra actividad");
        }

        const indicadoresCalificadosOtraActividad = await requestIndicadores.query(`
          SELECT DISTINCT si.IndicadorGrupoId
          FROM dbo.Eval360_SeguimientoIndicador si
          INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = si.ActividadId
          WHERE a.EstructuraGrupoId = @estructuraGrupoId
            AND si.IndicadorGrupoId IN (${placeholders})
            AND si.ActividadId <> @actividadId
        `);
        if ((indicadoresCalificadosOtraActividad.recordset || []).length > 0) {
          return badRequest(res, "Uno o mï¿½s indicadores ya tienen calificaciones en otra actividad");
        }
      }
    }

    const indicadoresCalificadosRemovidos = await requestIndicadores.query(`
      SELECT DISTINCT si.IndicadorGrupoId
      FROM dbo.Eval360_SeguimientoIndicador si
      WHERE si.ActividadId = @actividadId
        ${indicadorIds.length ? `AND si.IndicadorGrupoId NOT IN (${placeholders})` : ""}
    `);
    if ((indicadoresCalificadosRemovidos.recordset || []).length > 0) {
      return badRequest(res, "No se pueden quitar indicadores que ya tienen calificaciones en esta actividad");
    }

    await transaction.begin();

    await new sql.Request(transaction)
      .input("actividadId", sql.Int, actividadId)
      .query(`
        UPDATE dbo.Eval360_ActividadIndicador
        SET Activo = 0
        WHERE ActividadId = @actividadId
      `);

    for (const indicadorId of indicadorIds) {
      const existing = await new sql.Request(transaction)
        .input("actividadId", sql.Int, actividadId)
        .input("indicadorGrupoId", sql.Int, indicadorId)
        .query(`
          SELECT TOP 1 ActividadId
          FROM dbo.Eval360_ActividadIndicador
          WHERE ActividadId = @actividadId
            AND IndicadorGrupoId = @indicadorGrupoId
        `);

      if (existing.recordset[0]) {
        const reqUpdate = new sql.Request(transaction)
          .input("actividadId", sql.Int, actividadId)
          .input("indicadorGrupoId", sql.Int, indicadorId);
        const asignacion = asignacionesMap.get(Number(indicadorId)) || { numeroLecciones: 0, puntos: 0, detalleItemsJson: "{}" };
        reqUpdate.input("numeroLecciones", sql.Decimal(10, 2), Number(asignacion.numeroLecciones || 0));
        reqUpdate.input("puntos", sql.Decimal(10, 2), Number(asignacion.puntos || 0));
        reqUpdate.input("detalleItemsJson", sql.NVarChar(sql.MAX), String(asignacion.detalleItemsJson || "{}"));
        await reqUpdate.query(`
          IF COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NOT NULL
             AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NOT NULL
             AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NOT NULL
          BEGIN
            UPDATE dbo.Eval360_ActividadIndicador
            SET Activo = 1,
                NumeroLecciones = @numeroLecciones,
                Puntos = @puntos,
                DetalleItemsJson = @detalleItemsJson
            WHERE ActividadId = @actividadId
              AND IndicadorGrupoId = @indicadorGrupoId
          END
          ELSE
          BEGIN
            UPDATE dbo.Eval360_ActividadIndicador
            SET Activo = 1
            WHERE ActividadId = @actividadId
              AND IndicadorGrupoId = @indicadorGrupoId
          END
        `);
      } else {
        const reqInsert = new sql.Request(transaction)
          .input("actividadId", sql.Int, actividadId)
          .input("indicadorGrupoId", sql.Int, indicadorId);
        const asignacion = asignacionesMap.get(Number(indicadorId)) || { numeroLecciones: 0, puntos: 0, detalleItemsJson: "{}" };
        reqInsert.input("numeroLecciones", sql.Decimal(10, 2), Number(asignacion.numeroLecciones || 0));
        reqInsert.input("puntos", sql.Decimal(10, 2), Number(asignacion.puntos || 0));
        reqInsert.input("detalleItemsJson", sql.NVarChar(sql.MAX), String(asignacion.detalleItemsJson || "{}"));
        await reqInsert.query(`
          IF COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NOT NULL
             AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NOT NULL
             AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NOT NULL
          BEGIN
            INSERT INTO dbo.Eval360_ActividadIndicador
              (ActividadId, IndicadorGrupoId, Activo, NumeroLecciones, Puntos, DetalleItemsJson)
            VALUES
              (@actividadId, @indicadorGrupoId, 1, @numeroLecciones, @puntos, @detalleItemsJson)
          END
          ELSE
          BEGIN
            INSERT INTO dbo.Eval360_ActividadIndicador
              (ActividadId, IndicadorGrupoId, Activo)
            VALUES
              (@actividadId, @indicadorGrupoId, 1)
          END
        `);
      }
    }

    await transaction.commit();
    return ok(res, { actividadId, totalAsignados: indicadorIds.length }, "Indicadores asignados a la actividad correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error asignando indicadores a actividad:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron asignar los indicadores" });
  }
});

router.post("/seguimiento/guardar-indicador", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;
    await ensureReporteEnvioBitacoraTable(pool);

    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const indicadorGrupoId = toRequiredNumber(req.body.indicadorGrupoId, "indicadorGrupoId", res);
    const actividadIdBody = Number(req.body.actividadId || 0);
    const tipoUso = normalizeText(req.body.tipoUso || "Cotidiano");
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];

    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || indicadorGrupoId === null) return;
    if (!registros.length) return badRequest(res, "No hay registros para guardar");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;

    const indicadorResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND IndicadorGrupoId = @indicadorGrupoId
          AND ISNULL(Activo, 1) = 1
      `);

    const indicador = indicadorResult.recordset[0];
    if (!indicador) return badRequest(res, "No se encontrÃ³ el indicador seleccionado");

    const contextoCorreoResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .query(`
        SELECT TOP 1
          eg.InstitucionId,
          i.Nombre AS InstitucionNombre,
          g.Nombre AS SeccionNombre,
          m.Nombre AS MateriaNombre,
          al.Nombre AS AnioNombre,
          profesor.Correo AS ProfesorCorreo,
          profesor.NombreCompleto AS ProfesorNombreCompleto
        FROM dbo.Eval360_EstructuraGrupo eg
        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId
        INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId
        OUTER APPLY (
          SELECT TOP 1
            u.Correo,
            LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, ''), ' ', ISNULL(u.PrimerApellido, ''), ' ', ISNULL(u.SegundoApellido, '')))) AS NombreCompleto
          FROM dbo.AsignacionDocente ad
          INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
          WHERE ad.Activo = 1
            AND ad.InstitucionId = eg.InstitucionId
            AND ad.GrupoId = eg.GrupoId
            AND ad.MateriaId = eg.MateriaId
            AND ad.AnioLectivoId = eg.AnioLectivoId
            AND ad.PeriodoId = eg.PeriodoId
          ORDER BY CASE WHEN ad.UsuarioId = @usuarioId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC
        ) profesor
        WHERE eg.EstructuraGrupoId = @estructuraGrupoId
      `);

    const contextoCorreo = contextoCorreoResult.recordset[0] || {};

    const notificacionesPendientes: Array<{
      estudianteId: number;
      estudianteNombre: string;
      fechaNacimiento?: string | null;
      telefonoEstudiante?: string | null;
      correoEstudiante?: string | null;
      telefonosEncargados?: string[];
      autorizaWhatsApp?: boolean;
      estado: string;
      observacion?: string | null;
    }> = [];

    await transaction.begin();

    const actividadNombre = `${tipoUso} - ${String(indicador.IndicadorBase || "Indicador").slice(0, 160)}`;
    let actividadId = Number.isFinite(actividadIdBody) && actividadIdBody > 0 ? actividadIdBody : 0;
    let actividadCreadaAutomaticamente = false;

    if (actividadId) {
      const actividadSeleccionada = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
        .input("actividadId", sql.Int, actividadId)
        .query(`
          SELECT TOP 1 ActividadId
          FROM dbo.Eval360_Actividad
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
            AND ActividadId = @actividadId
            AND ISNULL(Activo, 1) = 1
        `);

      if (!actividadSeleccionada.recordset[0]) {
        await transaction.rollback();
        return badRequest(res, "La actividad seleccionada no pertenece al componente");
      }
    } else {
      const existingActividad = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
        .query(`
          SELECT TOP 1 a.ActividadId
          FROM dbo.Eval360_Actividad a
          INNER JOIN dbo.Eval360_ActividadIndicador ai ON ai.ActividadId = a.ActividadId
          WHERE a.EstructuraGrupoId = @estructuraGrupoId
            AND a.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
            AND ai.IndicadorGrupoId = @indicadorGrupoId
            AND ISNULL(a.Activo, 1) = 1
            AND ISNULL(ai.Activo, 1) = 1
        `);

      actividadId = Number(existingActividad.recordset[0]?.ActividadId || 0);
    }

    if (!actividadId) {
      const insertedActividad = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
        .input("nombre", sql.NVarChar(200), actividadNombre)
        .input("descripcion", sql.NVarChar(sql.MAX), indicador.IndicadorBase || null)
        .input("puntosMaximos", sql.Decimal(10, 2), 3)
        .query(`
          INSERT INTO dbo.Eval360_Actividad
            (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)
          OUTPUT INSERTED.ActividadId
          VALUES
            (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, CAST(SYSDATETIME() AS date), @puntosMaximos, NULL, 1, N'Planeamiento', 1, SYSDATETIME())
        `);

      actividadId = Number(insertedActividad.recordset[0].ActividadId);
      actividadCreadaAutomaticamente = true;
    }

    const existingActividadIndicador = await new sql.Request(transaction)
      .input("actividadId", sql.Int, actividadId)
      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
      .query(`
        SELECT TOP 1 ActividadId
        FROM dbo.Eval360_ActividadIndicador
        WHERE ActividadId = @actividadId
          AND IndicadorGrupoId = @indicadorGrupoId
          AND ISNULL(Activo, 1) = 1
      `);

    if (!existingActividadIndicador.recordset[0]) {
      if (actividadCreadaAutomaticamente) {
        await new sql.Request(transaction)
          .input("actividadId", sql.Int, actividadId)
          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
          .query(`
            INSERT INTO dbo.Eval360_ActividadIndicador
              (ActividadId, IndicadorGrupoId, Activo)
            VALUES
              (@actividadId, @indicadorGrupoId, 1)
          `);
      } else {
        await transaction.rollback();
        return badRequest(res, "El indicador no estï¿½ asociado a la actividad seleccionada. Asignalo primero desde Registro diario.");
      }
    }

    for (const registro of registros) {
      const estudianteId = Number(registro.estudianteId || registro.EstudianteId || 0);
      if (!estudianteId) continue;

      const estado = normalizarEstadoSeguimiento(registro.estado, tipoUso);
      const valor = Number(MAPA_SEGUIMIENTO_NIVELES[estado]?.valor ?? 0);
      const nivelDesempenoGrupoId = await getOrCreateNivelSeguimiento(transaction, estructuraGrupoId, estado);
      const observacion = normalizeText(registro.observacion || "");
      const informarEncargado = !!registro.informarEncargado;
      const actRecuperacion = !!registro.actRecuperacion && normalizeKey(tipoUso).includes("COTIDIAN");
      const actRecuperacionTexto = actRecuperacion ? normalizeText(registro.actRecuperacionTexto || "") : "";

      const existingSeguimiento = await new sql.Request(transaction)
        .input("actividadId", sql.Int, actividadId)
        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
        .input("estudianteId", sql.Int, estudianteId)
        .query(`
          SELECT TOP 1 SeguimientoIndicadorId
          FROM dbo.Eval360_SeguimientoIndicador
          WHERE ActividadId = @actividadId
            AND IndicadorGrupoId = @indicadorGrupoId
            AND EstudianteId = @estudianteId
        `);

      if (existingSeguimiento.recordset[0]) {
        await new sql.Request(transaction)
          .input("seguimientoIndicadorId", sql.Int, Number(existingSeguimiento.recordset[0].SeguimientoIndicadorId))
          .input("nivelDesempenoGrupoId", sql.Int, nivelDesempenoGrupoId)
          .input("valorSeleccionado", sql.Decimal(10, 2), valor)
          .input("observacion", sql.NVarChar(sql.MAX), observacion || null)
          .input("actRecuperacion", sql.Bit, actRecuperacion ? 1 : 0)
          .input("actRecuperacionTexto", sql.NVarChar(sql.MAX), actRecuperacionTexto || null)
          .query(`
            UPDATE dbo.Eval360_SeguimientoIndicador
            SET NivelDesempenoGrupoId = @nivelDesempenoGrupoId,
                ValorSeleccionado = @valorSeleccionado,
                Observacion = @observacion,
                ActRecuperacion = @actRecuperacion,
                ActRecuperacionTexto = @actRecuperacionTexto,
                UpdatedAt = SYSDATETIME()
            WHERE SeguimientoIndicadorId = @seguimientoIndicadorId
          `);
      } else {
        await new sql.Request(transaction)
          .input("actividadId", sql.Int, actividadId)
          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
          .input("estudianteId", sql.Int, estudianteId)
          .input("nivelDesempenoGrupoId", sql.Int, nivelDesempenoGrupoId)
          .input("valorSeleccionado", sql.Decimal(10, 2), valor)
          .input("observacion", sql.NVarChar(sql.MAX), observacion || null)
          .input("actRecuperacion", sql.Bit, actRecuperacion ? 1 : 0)
          .input("actRecuperacionTexto", sql.NVarChar(sql.MAX), actRecuperacionTexto || null)
          .query(`
            INSERT INTO dbo.Eval360_SeguimientoIndicador
              (ActividadId, IndicadorGrupoId, EstudianteId, NivelDesempenoGrupoId, ValorSeleccionado, Observacion, ActRecuperacion, ActRecuperacionTexto, CreatedAt)
            VALUES
              (@actividadId, @indicadorGrupoId, @estudianteId, @nivelDesempenoGrupoId, @valorSeleccionado, @observacion, @actRecuperacion, @actRecuperacionTexto, SYSDATETIME())
          `);
      }

      if (informarEncargado) {
        const estudianteAviso = await new sql.Request(transaction)
          .input("estudianteId", sql.Int, estudianteId)
          .query(`
            SELECT TOP 1
              e.EstudianteId,
              e.Nombre,
              e.PrimerApellido,
              e.SegundoApellido,
              e.FechaNacimiento,
              e.Telefono AS TelefonoEstudiante,
              e.Correo,
              e.AutorizaWhatsAppEncargado,
              enc.Telefonos AS EncargadosTelefonos
            FROM dbo.Estudiante e
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
            WHERE e.EstudianteId = @estudianteId
          `);

        const estudiante = estudianteAviso.recordset[0];
        if (estudiante) {
          notificacionesPendientes.push({
            estudianteId,
            estudianteNombre: [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" "),
            fechaNacimiento: estudiante.FechaNacimiento || null,
            telefonoEstudiante: estudiante.TelefonoEstudiante || null,
            correoEstudiante: estudiante.Correo,
            telefonosEncargados: String(estudiante.EncargadosTelefonos || "")
              .split("|")
              .map((item: string) => String(item || "").trim())
              .filter((item: string) => item.length > 0),
            autorizaWhatsApp: !!estudiante.AutorizaWhatsAppEncargado,
            estado,
            observacion
          });
        }
      }
    }

    await recalcularNotaActividadIndicadores(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });
    await sincronizarNotaFormalDesdeActividad(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });

    await transaction.commit();

    const resultadosNotificacion: any[] = [];
    const correoCfg = await getCorreoNotificacionConfig(pool, Number(contextoCorreo.InstitucionId || 0), tipoUso);
    for (const aviso of notificacionesPendientes) {
      const mensaje = buildSeguimientoCorreo({
        estudianteNombre: aviso.estudianteNombre,
        tipoUso,
        materiaNombre: contextoCorreo.MateriaNombre,
        anioNombre: contextoCorreo.AnioNombre,
        indicadorBase: indicador.IndicadorBase || "Indicador",
        estadoLabel: getEstadoLabelSeguimiento(aviso.estado),
        observacion: aviso.observacion
      });
      const plantillaMensaje = await resolverMensajeSeguimiento(
        pool,
        Number(contextoCorreo.InstitucionId || 0),
        tipoUso,
        Number(MAPA_SEGUIMIENTO_NIVELES[aviso.estado]?.valor || 0)
      );
      const textoFinal = normalizeText(plantillaMensaje?.Cuerpo) || mensaje.text;
      const tituloFinal = normalizeText(plantillaMensaje?.Titulo) || mensaje.subject;
      const vars = {
        fecha: new Date().toISOString().slice(0, 10),
        alumno: aviso.estudianteNombre,
        seccion: String(contextoCorreo.SeccionNombre || ""),
        materia: String(contextoCorreo.MateriaNombre || ""),
        profesor: String(contextoCorreo.ProfesorNombreCompleto || contextoCorreo.ProfesorCorreo || ""),
        colegio: String(contextoCorreo.InstitucionNombre || ""),
        lecciones: "No aplica",
        reporte: getEstadoLabelSeguimiento(aviso.estado),
        detalle: textoFinal
      };
      const subjectFinal = correoCfg?.AsuntoTemplate ? renderTemplate(String(correoCfg.AsuntoTemplate), vars) : tituloFinal;
      const bodyFinal = correoCfg?.CuerpoTemplate ? renderTemplate(String(correoCfg.CuerpoTemplate), vars) : textoFinal;
      const htmlFinal = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <h2 style="margin: 0 0 12px; color: #1e3a8a;">${escapeHtml(subjectFinal)}</h2>
          <p>${toHtmlWithLineBreaks(bodyFinal)}</p>
        </div>
      `;

      if (aviso.correoEstudiante) {
        try {
          const correo = await sendEmailWithFallback({
            to: aviso.correoEstudiante,
            cc: contextoCorreo.ProfesorCorreo || undefined,
            subject: subjectFinal,
            html: htmlFinal,
            text: bodyFinal
          });
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", ...correo });
        } catch (mailError: any) {
          const readable = getReadableError(mailError);
          console.error("No se pudo enviar correo de seguimiento:", readable, mailError);
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", enviado: false, error: readable });
        }
      }

      if (aviso.autorizaWhatsApp) {
        const telefonos = resolveWhatsAppPhonesForStudent({
          fechaNacimiento: aviso.fechaNacimiento,
          telefonoEstudiante: aviso.telefonoEstudiante,
          telefonosEncargados: aviso.telefonosEncargados
        });
        for (const telefono of telefonos) {
          const whatsapp = await sendWhatsAppSeguimiento({ telefono, mensaje: bodyFinal });
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "whatsapp", telefono, ...whatsapp });
        }
      }
    }

    const estadoEnvioPorEstudiante = new Map<number, { correoEnviado: boolean; waEnviado: boolean }>();
    for (const notif of resultadosNotificacion) {
      if (notif?.enviado !== true) continue;
      const estudianteId = Number(notif?.estudianteId || 0);
      if (!estudianteId) continue;
      const prev = estadoEnvioPorEstudiante.get(estudianteId) || { correoEnviado: false, waEnviado: false };
      if (notif?.canal === "correo") prev.correoEnviado = true;
      if (notif?.canal === "whatsapp") prev.waEnviado = true;
      estadoEnvioPorEstudiante.set(estudianteId, prev);
    }
    for (const aviso of notificacionesPendientes) {
      const estadoEnvio = estadoEnvioPorEstudiante.get(Number(aviso.estudianteId)) || { correoEnviado: false, waEnviado: false };
      const esTareas = normalizeKey(tipoUso).includes("TAREA");
      await upsertReporteEnvioBitacora(pool, {
        modulo: esTareas ? "TAREAS_INDICADOR" : "COTIDIANO_INDICADOR",
        registroClave: `COTI_IND|${actividadId}|${indicadorGrupoId}|${aviso.estudianteId}`,
        grupoId: Number(estructura?.GrupoId || 0) || null,
        materiaId: Number(estructura?.MateriaId || 0) || null,
        periodoId: Number(estructura?.PeriodoId || 0) || null,
        anioLectivoId: Number(estructura?.AnioLectivoId || 0) || null,
        estudianteId: Number(aviso.estudianteId || 0) || null,
        fecha: new Date().toISOString().slice(0, 10),
        correoEnviado: estadoEnvio.correoEnviado,
        waEnviado: estadoEnvio.waEnviado
      });
    }

    return ok(res, { actividadId, notificaciones: resultadosNotificacion }, "Evaluación guardada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error guardando seguimiento de indicador Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar el seguimiento del indicador" });
  }
});

router.post("/seguimiento/guardar-actividad", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;
    await ensureReporteEnvioBitacoraTable(pool);

    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];

    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;
    if (!registros.length) return badRequest(res, "No hay registros para guardar");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;

    const actividadResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_Actividad
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
          AND ActividadId = @actividadId
          AND ISNULL(Activo, 1) = 1
      `);

    const actividad = actividadResult.recordset[0];
    if (!actividad) return badRequest(res, "No se encontrÃ³ la actividad seleccionada");

    const puntosMaximos = Number(req.body.puntosMaximos ?? actividad.PuntosMaximos ?? 0);
    if (!Number.isFinite(puntosMaximos) || puntosMaximos <= 0) return badRequest(res, "Indicï¿½ la cantidad de puntos que vale la actividad");

    const notificacionesPendientes: Array<{
      estudianteId: number;
      estudianteNombre: string;
      fechaNacimiento?: string | null;
      telefonoEstudiante?: string | null;
      correoEstudiante?: string | null;
      telefonosEncargados?: string[];
      autorizaWhatsApp?: boolean;
      observacion?: string | null;
      puntosObtenidos?: number | null;
      puntosMaximos: number;
    }> = [];

    await transaction.begin();

    await new sql.Request(transaction)
      .input("actividadId", sql.Int, actividadId)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
      .query(`
        UPDATE dbo.Eval360_Actividad
        SET PuntosMaximos = @puntosMaximos,
            UpdatedAt = SYSDATETIME()
        WHERE ActividadId = @actividadId
          AND EstructuraGrupoId = @estructuraGrupoId
          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
          AND ISNULL(Activo, 1) = 1
      `);

    const porcentajeEvaluacion = Number(actividad.PorcentajeDentroRubro || 0);

    // Mantiene consistencia global: si cambia puntos máximos en la actividad,
    // todas las notas existentes de esa actividad quedan sincronizadas.
    await new sql.Request(transaction)
      .input("actividadId", sql.Int, actividadId)
      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
      .input("porcentajeEvaluacion", sql.Decimal(10, 2), porcentajeEvaluacion)
      .query(`
        UPDATE na
        SET na.PuntosMaximos = @puntosMaximos,
            na.PorcentajeObtenido =
              CASE
                WHEN na.PuntosObtenidos IS NULL THEN NULL
                WHEN @puntosMaximos <= 0 THEN NULL
                ELSE ROUND((CAST(na.PuntosObtenidos AS decimal(10,2)) / @puntosMaximos) * @porcentajeEvaluacion, 2)
              END,
            na.UpdatedAt = SYSDATETIME()
        FROM dbo.Eval360_NotaActividad na
        WHERE na.ActividadId = @actividadId
      `);

    let guardados = 0;
    for (const registro of registros) {
      const estudianteId = Number(registro.estudianteId || registro.EstudianteId || 0);
      if (!estudianteId) continue;

      const rawPuntos = registro.puntosObtenidos;
      const puntosObtenidos = rawPuntos === null || rawPuntos === undefined || String(rawPuntos).trim() === "" ? null : Number(rawPuntos);
      if (puntosObtenidos !== null && (!Number.isFinite(puntosObtenidos) || !Number.isInteger(puntosObtenidos) || puntosObtenidos < 0 || puntosObtenidos > puntosMaximos)) {
        await transaction.rollback();
        return badRequest(res, "Los puntos obtenidos deben ser enteros entre 0 y los puntos mï¿½ximos de la actividad");
      }

      const porcentajeObtenido = puntosObtenidos === null ? null : Number(((puntosObtenidos / puntosMaximos) * porcentajeEvaluacion).toFixed(2));
      const observacion = normalizeText(registro.observacion || "") || null;
      const informarEncargado = !!registro.informarEncargado;

      const existingNota = await new sql.Request(transaction)
        .input("actividadId", sql.Int, actividadId)
        .input("estudianteId", sql.Int, estudianteId)
        .query(`
          SELECT TOP 1 NotaActividadId
          FROM dbo.Eval360_NotaActividad
          WHERE ActividadId = @actividadId
            AND EstudianteId = @estudianteId
        `);

      if (existingNota.recordset[0]) {
        await new sql.Request(transaction)
          .input("notaActividadId", sql.Int, Number(existingNota.recordset[0].NotaActividadId))
          .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)
          .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
          .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)
          .input("observacion", sql.NVarChar(sql.MAX), observacion)
          .query(`
            UPDATE dbo.Eval360_NotaActividad
            SET PuntosObtenidos = @puntosObtenidos,
                PuntosMaximos = @puntosMaximos,
                PorcentajeObtenido = @porcentajeObtenido,
                Observacion = @observacion,
                UpdatedAt = SYSDATETIME()
            WHERE NotaActividadId = @notaActividadId
          `);
      } else {
        await new sql.Request(transaction)
          .input("actividadId", sql.Int, actividadId)
          .input("estudianteId", sql.Int, estudianteId)
          .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)
          .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
          .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)
          .input("observacion", sql.NVarChar(sql.MAX), observacion)
          .query(`
            INSERT INTO dbo.Eval360_NotaActividad
              (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, Observacion, CreatedAt)
            VALUES
              (@actividadId, @estudianteId, @puntosObtenidos, @puntosMaximos, @porcentajeObtenido, @observacion, SYSDATETIME())
          `);
      }

      guardados += 1;

      if (informarEncargado) {
        const estudianteAviso = await new sql.Request(transaction)
          .input("estudianteId", sql.Int, estudianteId)
          .query(`
            SELECT TOP 1
              e.EstudianteId,
              e.Nombre,
              e.PrimerApellido,
              e.SegundoApellido,
              e.FechaNacimiento,
              e.Telefono AS TelefonoEstudiante,
              e.Correo,
              e.AutorizaWhatsAppEncargado,
              enc.Telefonos AS EncargadosTelefonos,
              encCorreo.Correo AS EncargadoPrincipalCorreo
            FROM dbo.Estudiante e
            OUTER APPLY (
              SELECT TOP 1 en.Correo
              FROM dbo.EstudianteEncargado ee
              INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
              WHERE ee.EstudianteId = e.EstudianteId
                AND ISNULL(ee.Activo, 1) = 1
                AND ISNULL(en.Activo, 1) = 1
              ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC
            ) encCorreo
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
            WHERE e.EstudianteId = @estudianteId
          `);
        const estudiante = estudianteAviso.recordset[0];
        if (estudiante) {
          notificacionesPendientes.push({
            estudianteId,
            estudianteNombre: [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" "),
            fechaNacimiento: estudiante.FechaNacimiento || null,
            telefonoEstudiante: estudiante.TelefonoEstudiante || null,
            correoEstudiante: estudiante.Correo || estudiante.EncargadoPrincipalCorreo,
            telefonosEncargados: String(estudiante.EncargadosTelefonos || "")
              .split("|")
              .map((item: string) => String(item || "").trim())
              .filter((item: string) => item.length > 0),
            autorizaWhatsApp: !!estudiante.AutorizaWhatsAppEncargado,
            observacion,
            puntosObtenidos,
            puntosMaximos
          });
        }
      }
    }

    await sincronizarNotaFormalDesdeActividad(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });

    await transaction.commit();

    const contextoCorreoResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .query(`
        SELECT TOP 1
          eg.InstitucionId,
          i.Nombre AS InstitucionNombre,
          m.Nombre AS MateriaNombre,
          al.Nombre AS AnioNombre,
          profesor.Correo AS ProfesorCorreo
        FROM dbo.Eval360_EstructuraGrupo eg
        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId
        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId
        OUTER APPLY (
          SELECT TOP 1 u.Correo
          FROM dbo.AsignacionDocente ad
          INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
          WHERE ad.Activo = 1
            AND ad.InstitucionId = eg.InstitucionId
            AND ad.GrupoId = eg.GrupoId
            AND ad.MateriaId = eg.MateriaId
            AND ad.AnioLectivoId = eg.AnioLectivoId
            AND ad.PeriodoId = eg.PeriodoId
          ORDER BY CASE WHEN ad.UsuarioId = @usuarioId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC
        ) profesor
        WHERE eg.EstructuraGrupoId = @estructuraGrupoId
      `);
    const contextoCorreo = contextoCorreoResult.recordset[0] || {};
    const resultadosNotificacion: any[] = [];

    for (const aviso of notificacionesPendientes) {
      const plantillaMensaje = await resolverMensajeSeguimiento(pool, Number(contextoCorreo.InstitucionId || 0), "EXAMEN", null);
      const defecto = `Se registra evaluaciï¿½n de ${aviso.estudianteNombre}. Resultado: ${Number(aviso.puntosObtenidos || 0).toFixed(2)} de ${Number(aviso.puntosMaximos || 0).toFixed(2)}.${aviso.observacion ? " Observaciï¿½n: " + aviso.observacion : ""}`;
      const textoFinal = normalizeText(plantillaMensaje?.Cuerpo) || defecto;
      const tituloFinal = normalizeText(plantillaMensaje?.Titulo) || "Seguimiento de evaluaciï¿½n";
      const htmlFinal = `<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;"><h2 style="margin: 0 0 12px; color: #1e3a8a;">${escapeHtml(tituloFinal)}</h2><p>${toHtmlWithLineBreaks(textoFinal)}</p></div>`;

      if (aviso.correoEstudiante) {
        try {
          const correo = await sendEmailWithFallback({
            to: aviso.correoEstudiante,
            cc: contextoCorreo.ProfesorCorreo || undefined,
            subject: tituloFinal,
            html: htmlFinal,
            text: textoFinal
          });
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", ...correo });
        } catch (mailError: any) {
          const readable = getReadableError(mailError);
          console.error("No se pudo enviar correo de seguimiento (actividad):", readable, mailError);
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", enviado: false, error: readable });
        }
      }

      if (aviso.autorizaWhatsApp) {
        const telefonos = resolveWhatsAppPhonesForStudent({
          fechaNacimiento: aviso.fechaNacimiento,
          telefonoEstudiante: aviso.telefonoEstudiante,
          telefonosEncargados: aviso.telefonosEncargados
        });
        for (const telefono of telefonos) {
          const whatsapp = await sendWhatsAppSeguimiento({ telefono, mensaje: textoFinal });
          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "whatsapp", telefono, ...whatsapp });
        }
      }
    }

    const estadoEnvioPorEstudiante = new Map<number, { correoEnviado: boolean; waEnviado: boolean }>();
    for (const notif of resultadosNotificacion) {
      if (notif?.enviado !== true) continue;
      const estudianteId = Number(notif?.estudianteId || 0);
      if (!estudianteId) continue;
      const prev = estadoEnvioPorEstudiante.get(estudianteId) || { correoEnviado: false, waEnviado: false };
      if (notif?.canal === "correo") prev.correoEnviado = true;
      if (notif?.canal === "whatsapp") prev.waEnviado = true;
      estadoEnvioPorEstudiante.set(estudianteId, prev);
    }
    for (const aviso of notificacionesPendientes) {
      const estadoEnvio = estadoEnvioPorEstudiante.get(Number(aviso.estudianteId)) || { correoEnviado: false, waEnviado: false };
      const esTareas = normalizeKey(actividad?.Fuente || actividad?.Nombre || "").includes("TAREA");
      await upsertReporteEnvioBitacora(pool, {
        modulo: esTareas ? "TAREAS_ACTIVIDAD" : "COTIDIANO_ACTIVIDAD",
        registroClave: `COTI_ACT|${actividadId}|${aviso.estudianteId}`,
        grupoId: Number(estructura?.GrupoId || 0) || null,
        materiaId: Number(estructura?.MateriaId || 0) || null,
        periodoId: Number(estructura?.PeriodoId || 0) || null,
        anioLectivoId: Number(estructura?.AnioLectivoId || 0) || null,
        estudianteId: Number(aviso.estudianteId || 0) || null,
        fecha: new Date().toISOString().slice(0, 10),
        correoEnviado: estadoEnvio.correoEnviado,
        waEnviado: estadoEnvio.waEnviado
      });
    }

    return ok(res, { guardados, actividadId, puntosMaximos, notificaciones: resultadosNotificacion }, "Evaluación guardada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error guardando actividad Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la actividad" });
  }
});

router.put("/seguimiento/notas/:notaActividadId/porcentaje", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    if (!assertCanAccess(req, res)) return;
    await ensureNotaEdicionAuditoriaTable(pool);

    const notaActividadId = toRequiredNumber(req.params.notaActividadId, "notaActividadId", res);
    const porcentajeObtenido = Number(req.body?.porcentajeObtenido);
    const justificacion = normalizeText(req.body?.justificacion || "");
    if (notaActividadId === null) return;
    if (!Number.isFinite(porcentajeObtenido) || porcentajeObtenido < 0 || porcentajeObtenido > 100) {
      return badRequest(res, "El % obtenido debe estar entre 0 y 100");
    }
    if (!justificacion) {
      return badRequest(res, "La justificación es obligatoria para editar la calificación");
    }

    await transaction.begin();

    const notaResult = await new sql.Request(transaction)
      .input("notaActividadId", sql.Int, notaActividadId)
      .query(`
        SELECT TOP 1
          na.NotaActividadId,
          na.ActividadId,
          na.EstudianteId,
          na.PuntosObtenidos,
          na.PuntosMaximos,
          na.NotaObtenida,
          na.PorcentajeObtenido,
          a.EstructuraGrupoId,
          a.EstructuraGrupoDetalleId
        FROM dbo.Eval360_NotaActividad na
        INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = na.ActividadId
        WHERE na.NotaActividadId = @notaActividadId
      `);

    const nota = notaResult.recordset[0];
    if (!nota) {
      await transaction.rollback();
      return badRequest(res, "No se encontró la nota a editar");
    }

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(nota.EstructuraGrupoId || 0));
    if (!estructura) {
      await transaction.rollback();
      return forbidden(res, "No tenés permiso para editar esta nota");
    }

    const puntosMaximos = Number(nota.PuntosMaximos || 0);
    const porcentajeAnterior = Number(nota.PorcentajeObtenido || 0);
    const notaAnterior = Number(nota.NotaObtenida || 0);
    const puntosAnterior = Number(nota.PuntosObtenidos || 0);
    const porcentajeNuevo = Number(porcentajeObtenido.toFixed(2));
    const notaNueva = porcentajeNuevo;
    const puntosNuevo = Number(((porcentajeNuevo / 100) * puntosMaximos).toFixed(2));

    await new sql.Request(transaction)
      .input("notaActividadId", sql.Int, notaActividadId)
      .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeNuevo)
      .input("puntosObtenidos", sql.Decimal(10, 2), puntosNuevo)
      .query(`
        UPDATE dbo.Eval360_NotaActividad
        SET PorcentajeObtenido = @porcentajeObtenido,
            PuntosObtenidos = @puntosObtenidos,
            UpdatedAt = SYSDATETIME()
        WHERE NotaActividadId = @notaActividadId
      `);

    await new sql.Request(transaction)
      .input("notaActividadId", sql.Int, notaActividadId)
      .input("actividadId", sql.Int, Number(nota.ActividadId))
      .input("estudianteId", sql.Int, Number(nota.EstudianteId))
      .input("estructuraGrupoId", sql.Int, Number(nota.EstructuraGrupoId))
      .input("estructuraGrupoDetalleId", sql.Int, Number(nota.EstructuraGrupoDetalleId))
      .input("porcentajeAnterior", sql.Decimal(10, 2), porcentajeAnterior)
      .input("porcentajeNuevo", sql.Decimal(10, 2), porcentajeNuevo)
      .input("notaAnterior", sql.Decimal(10, 2), notaAnterior)
      .input("notaNueva", sql.Decimal(10, 2), notaNueva)
      .input("puntosAnterior", sql.Decimal(10, 2), puntosAnterior)
      .input("puntosNuevo", sql.Decimal(10, 2), puntosNuevo)
      .input("justificacion", sql.NVarChar(1000), justificacion)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .query(`
        INSERT INTO dbo.Eval360_NotaEdicionAuditoria
          (NotaActividadId, ActividadId, EstudianteId, EstructuraGrupoId, EstructuraGrupoDetalleId,
           PorcentajeAnterior, PorcentajeNuevo, NotaAnterior, NotaNueva, PuntosAnterior, PuntosNuevo,
           Justificacion, UsuarioId)
        VALUES
          (@notaActividadId, @actividadId, @estudianteId, @estructuraGrupoId, @estructuraGrupoDetalleId,
           @porcentajeAnterior, @porcentajeNuevo, @notaAnterior, @notaNueva, @puntosAnterior, @puntosNuevo,
           @justificacion, @usuarioId)
      `);

    await sincronizarNotaFormalDesdeActividad(transaction, {
      estructuraGrupoId: Number(nota.EstructuraGrupoId),
      estructuraGrupoDetalleId: Number(nota.EstructuraGrupoDetalleId),
      actividadId: Number(nota.ActividadId)
    });

    await transaction.commit();
    return ok(res, {
      notaActividadId,
      porcentajeAnterior,
      porcentajeNuevo,
      justificacion
    }, "Calificación actualizada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error actualizando % obtenido de nota:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la calificación" });
  }
});

router.put("/seguimiento/componentes/ajustar-porcentaje", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    if (!assertCanAccess(req, res)) return;
    await ensureNotaEdicionAuditoriaTable(pool);
    await ensureComponenteAjusteManualTables(pool);

    const estructuraGrupoId = toRequiredNumber(req.body?.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body?.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const estudianteId = toRequiredNumber(req.body?.estudianteId, "estudianteId", res);
    const porcentajeObtenidoComponente = Number(req.body?.porcentajeObtenidoComponente);
    const justificacion = normalizeText(req.body?.justificacion || "");
    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || estudianteId === null) return;
    if (!Number.isFinite(porcentajeObtenidoComponente) || porcentajeObtenidoComponente < 0) {
      return badRequest(res, "El % obtenido debe ser mayor o igual a 0");
    }
    if (!justificacion) return badRequest(res, "La justificación es obligatoria para editar la calificación");

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);
    if (!estructura) return;

    const detalleRes = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .query(`
        SELECT TOP 1 EstructuraGrupoDetalleId, Porcentaje
        FROM dbo.Eval360_EstructuraGrupoDetalle
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
          AND ISNULL(Activo,1) = 1
      `);
    const detalle = detalleRes.recordset[0];
    if (!detalle) return badRequest(res, "No se encontró el rubro seleccionado");

    const porcentajeValor = Number(detalle.Porcentaje || 0);
    if (porcentajeObtenidoComponente > porcentajeValor) {
      return badRequest(res, `El % obtenido no puede ser mayor al % valor del rubro (${porcentajeValor.toFixed(2)}%)`);
    }

    await transaction.begin();

    const ajustePrevioRes = await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        SELECT TOP 1 PorcentajeObtenidoComponente
        FROM dbo.Eval360_ComponenteAjusteManual
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
          AND EstudianteId = @estudianteId
      `);
    const porcentajeAnteriorManual = Number(ajustePrevioRes.recordset[0]?.PorcentajeObtenidoComponente || 0);

    await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("estudianteId", sql.Int, estudianteId)
      .input("porcentajeObtenidoComponente", sql.Decimal(10, 2), Number(porcentajeObtenidoComponente.toFixed(2)))
      .input("justificacion", sql.NVarChar(1000), justificacion)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .query(`
        MERGE dbo.Eval360_ComponenteAjusteManual AS target
        USING (
          SELECT
            @estructuraGrupoId AS EstructuraGrupoId,
            @estructuraGrupoDetalleId AS EstructuraGrupoDetalleId,
            @estudianteId AS EstudianteId
        ) AS source
        ON target.EstructuraGrupoId = source.EstructuraGrupoId
          AND target.EstructuraGrupoDetalleId = source.EstructuraGrupoDetalleId
          AND target.EstudianteId = source.EstudianteId
        WHEN MATCHED THEN
          UPDATE SET
            PorcentajeObtenidoComponente = @porcentajeObtenidoComponente,
            Justificacion = @justificacion,
            UsuarioId = @usuarioId,
            UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, PorcentajeObtenidoComponente, Justificacion, UsuarioId, CreatedAt, UpdatedAt)
          VALUES (@estructuraGrupoId, @estructuraGrupoDetalleId, @estudianteId, @porcentajeObtenidoComponente, @justificacion, @usuarioId, SYSDATETIME(), SYSDATETIME());
      `);

    await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("estudianteId", sql.Int, estudianteId)
      .input("porcentajeAnterior", sql.Decimal(10, 2), porcentajeAnteriorManual)
      .input("porcentajeNuevo", sql.Decimal(10, 2), Number(porcentajeObtenidoComponente.toFixed(2)))
      .input("justificacion", sql.NVarChar(1000), justificacion)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .query(`
        INSERT INTO dbo.Eval360_ComponenteAjusteManualAuditoria
          (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, PorcentajeAnterior, PorcentajeNuevo, Justificacion, UsuarioId)
        VALUES
          (@estructuraGrupoId, @estructuraGrupoDetalleId, @estudianteId, @porcentajeAnterior, @porcentajeNuevo, @justificacion, @usuarioId)
      `);

    await transaction.commit();
    return ok(res, {
      estructuraGrupoDetalleId,
      estudianteId,
      porcentajeValor,
      porcentajeObtenidoComponente: Number(porcentajeObtenidoComponente.toFixed(2))
    }, "Calificación del rubro actualizada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error ajustando % obtenido por rubro:", error);
    return res.status(500).json({ ok: false, message: "No se pudo ajustar la calificación del rubro" });
  }
});

export default router;














