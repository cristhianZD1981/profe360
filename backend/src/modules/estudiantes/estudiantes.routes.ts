import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";
import { hashPassword } from "../../utils/password";
import {
  MOTIVOS_SUSPENSION_ESTUDIANTE,
  getSuspensionVigenteApplySql,
  normalizeSuspensionMotivo,
  suspensionVigenteSelectSql
} from "./estudiante-suspension.utils";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const DASHBOARD_CACHE_TTL_MS = 20000;
const dashboardCache = new Map<string, { at: number; data: any }>();
const dashboardInFlight = new Map<string, Promise<any>>();
const STUDENT_IMPORT_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "ADMINISTRATIVO"
];

router.use(requireAuth);

type EncargadoPayload = {
  tipoEncargado: "MADRE" | "PADRE" | "ENCARGADO";
  titulo?: string | null;
  identificacion?: string | null;
  nombre?: string | null;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  correo?: string | null;
  telefono?: string | null;
  telefonoSecundario?: string | null;
  direccionExacta?: string | null;
  parentesco?: string | null;
  viveConEstudiante?: boolean;
  esPrincipal?: boolean;
  aceptaWhatsApp?: boolean;
  aceptaCorreo?: boolean;
  recibeNotificaciones?: boolean;
};

type ImportResultRow = {
  fila: number;
  identificacion: string;
  estado: "CREADO" | "ACTUALIZADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
  motivo: string;
};

type ImportJobStatus = "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";

type ImportJob = {
  id: string;
  institucionId: number;
  usuarioId: number | null;
  status: ImportJobStatus;
  totalRegistros: number;
  procesados: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalActualizados: number;
  totalReactivados: number;
  totalOmitidos: number;
  resultados: ImportResultRow[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const importJobs = new Map<string, ImportJob>();
const IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

function buildCodigoCarnet(institucionId: number, identificacion: string) {
  const limpio = String(identificacion || "").replace(/\s+/g, "").trim();
  return `STU-${institucionId}-${limpio}`;
}


async function getCorreoEstudianteDominio(transactionOrPool: any, institucionId: number) {
  const result = await transactionOrPool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1 ISNULL(DominioCorreoEstudiantil, N'@est.mep.go.cr') AS DominioCorreoEstudiantil
      FROM dbo.Institucion
      WHERE InstitucionId = @institucionId
    `);
  return String(result.recordset[0]?.DominioCorreoEstudiantil || "@est.mep.go.cr").trim();
}

function buildStudentEmail(identificacion: string, dominio: string) {
  const limpio = String(identificacion || "").replace(/\s+/g, "").trim();
  let dominioFinal = String(dominio || "@est.mep.go.cr").trim();
  if (dominioFinal && !dominioFinal.startsWith("@")) dominioFinal = `@${dominioFinal}`;
  return `${limpio}${dominioFinal}`.toLowerCase();
}

async function ensurePadreFamiliaRoleId(transaction: any) {
  const result = await transaction.request().query(`SELECT TOP 1 RolId FROM dbo.Rol WHERE Nombre = N'PADRE_FAMILIA'`);
  return result.recordset[0]?.RolId || null;
}

async function ensureParentPortalUser(params: { transaction: any; institucionId: number; correoUsuario: string; nombre: string; primerApellido?: string | null; segundoApellido?: string | null; telefono?: string | null; passwordInicial: string; oldCorreo?: string | null; }) {
  const { transaction, institucionId, correoUsuario, nombre, primerApellido, segundoApellido, telefono, passwordInicial, oldCorreo = null } = params;
  const rolId = await ensurePadreFamiliaRoleId(transaction);
  if (!rolId) return null;

  const existing = await transaction.request()
    .input("correoUsuario", sql.NVarChar, correoUsuario)
    .input("oldCorreo", sql.NVarChar, oldCorreo || null)
    .query(`
      SELECT TOP 1 UsuarioId, Correo, ISNULL(DebeCambiarPassword, 0) AS DebeCambiarPassword
      FROM dbo.Usuario
      WHERE Correo = @correoUsuario OR (@oldCorreo IS NOT NULL AND Correo = @oldCorreo)
      ORDER BY CASE WHEN Correo = @correoUsuario THEN 0 ELSE 1 END, UsuarioId DESC
    `);

  if (existing.recordset.length) {
    const row = existing.recordset[0];
    await transaction.request()
      .input("usuarioId", sql.Int, row.UsuarioId)
      .input("correoUsuario", sql.NVarChar, correoUsuario)
      .input("nombre", sql.NVarChar, nombre)
      .input("primerApellido", sql.NVarChar, primerApellido || null)
      .input("segundoApellido", sql.NVarChar, segundoApellido || null)
      .input("telefono", sql.NVarChar, telefono || null)
      .query(`
        UPDATE dbo.Usuario
        SET Correo = @correoUsuario,
            Nombre = @nombre,
            PrimerApellido = @primerApellido,
            SegundoApellido = @segundoApellido,
            Telefono = @telefono,
            UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);

    await transaction.request()
      .input("usuarioId", sql.Int, row.UsuarioId)
      .input("rolId", sql.Int, rolId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.UsuarioRol WHERE UsuarioId = @usuarioId AND RolId = @rolId)
        BEGIN
          INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
          VALUES (@usuarioId, @rolId, 1)
        END
        ELSE
        BEGIN
          UPDATE dbo.UsuarioRol
          SET Activo = 1
          WHERE UsuarioId = @usuarioId
            AND RolId = @rolId
        END
      `);
    return row.UsuarioId;
  }

  const hash = await hashPassword(passwordInicial);
  const createdUser = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("correoUsuario", sql.NVarChar, correoUsuario)
    .input("hashPassword", sql.NVarChar, hash)
    .input("nombre", sql.NVarChar, nombre)
    .input("primerApellido", sql.NVarChar, primerApellido || null)
    .input("segundoApellido", sql.NVarChar, segundoApellido || null)
    .input("telefono", sql.NVarChar, telefono || null)
    .query(`
      INSERT INTO dbo.Usuario (InstitucionId, Correo, HashPassword, Nombre, PrimerApellido, SegundoApellido, Telefono, Activo, DebeCambiarPassword, CreatedAt)
      OUTPUT INSERTED.UsuarioId
      VALUES (@institucionId, @correoUsuario, @hashPassword, @nombre, @primerApellido, @segundoApellido, @telefono, 1, 1, SYSDATETIME())
    `);

  const usuarioId = createdUser.recordset[0]?.UsuarioId;
  await transaction.request()
    .input("usuarioId", sql.Int, usuarioId)
    .input("rolId", sql.Int, rolId)
    .query(`
      INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
      VALUES (@usuarioId, @rolId, 1)
    `);
  return usuarioId;
}

function normalizeEncargados(encargados: any[]): EncargadoPayload[] {
  if (!Array.isArray(encargados)) return [];

  return encargados
    .map((item) => ({
      tipoEncargado: String(item?.tipoEncargado || "").toUpperCase() as
        | "MADRE"
        | "PADRE"
        | "ENCARGADO",
      titulo: item?.titulo || null,
      identificacion: item?.identificacion || null,
      nombre: item?.nombre || null,
      primerApellido: item?.primerApellido || null,
      segundoApellido: item?.segundoApellido || null,
      correo: item?.correo || null,
      telefono: normalizePhoneWithDefaultCountryCode(item?.telefono),
      telefonoSecundario: normalizePhoneWithDefaultCountryCode(item?.telefonoSecundario),
      direccionExacta: item?.direccionExacta || null,
      parentesco: item?.parentesco || null,
      viveConEstudiante: !!item?.viveConEstudiante,
      esPrincipal: !!item?.esPrincipal,
      aceptaWhatsApp: !!item?.aceptaWhatsApp,
      aceptaCorreo: !!item?.aceptaCorreo,
      recibeNotificaciones: item?.recibeNotificaciones === false ? false : true
    }))
    .filter((item) => {
      if (!["MADRE", "PADRE", "ENCARGADO"].includes(item.tipoEncargado)) {
        return false;
      }

      const tieneContenido =
        !!item.nombre ||
        !!item.identificacion ||
        !!item.correo ||
        !!item.telefono;

      return tieneContenido;
    });
}

function toNullableString(value: any) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function splitFullName(value: any) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return {
      nombre: null,
      primerApellido: null,
      segundoApellido: null
    };
  }

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return {
      nombre: parts[0],
      primerApellido: null,
      segundoApellido: null
    };
  }
  if (parts.length === 2) {
    return {
      nombre: parts[0],
      primerApellido: parts[1],
      segundoApellido: null
    };
  }

  return {
    nombre: parts.slice(0, -2).join(" "),
    primerApellido: parts.at(-2) || null,
    segundoApellido: parts.at(-1) || null
  };
}

function normalizeComparableText(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isValidAdecuacionValue(value: any) {
  const normalized = normalizeComparableText(value);
  return !!normalized && !["regular", "sin adecuacion", "seleccione", "no"].includes(normalized);
}

function isTruthyText(value: any) {
  return ["1", "si", "true", "x", "yes", "sí"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

function isValidTipoDiscapacidad(value: any) {
  const normalized = normalizeComparableText(value);
  return !!normalized && !["sin discapacidad", "no", "ninguna", "seleccione"].includes(normalized);
}

function normalizePhoneWithDefaultCountryCode(value: any) {
  const raw = toNullableString(value);
  if (!raw) return null;
  if (raw.startsWith("+")) return raw.replace(/\s+/g, "");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `+506${digits}`;
}

function toBoolean(value: any, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();

  if (["1", "si", "Si", "true", "x", "yes"].includes(normalized)) return true;
  if (["0", "no", "false", ""].includes(normalized)) return false;

  return defaultValue;
}

function toNullablePositiveInt(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function toExcelDate(value: any): string | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  const iso = new Date(str);
  if (!Number.isNaN(iso.getTime())) {
    return iso.toISOString().slice(0, 10);
  }

  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) {
      const day = a.padStart(2, "0");
      const month = b.padStart(2, "0");
      return `${c}-${month}-${day}`;
    }
  }

  return null;
}

async function replaceEncargadosHistorico(params: {
  transaction: any;
  institucionId: number;
  estudianteId: number;
  encargados: EncargadoPayload[];
}) {
  const { transaction, institucionId, estudianteId, encargados } = params;

  await transaction
    .request()
    .input("estudianteId", sql.Int, estudianteId)
    .query(`
      UPDATE dbo.EstudianteEncargado
      SET
        Activo = 0,
        VigenciaHasta = CAST(GETDATE() AS DATE),
        UpdatedAt = SYSDATETIME()
      WHERE EstudianteId = @estudianteId
        AND Activo = 1
    `);

  for (const item of encargados) {
    const encargadoInsert = await transaction
      .request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoEncargado", sql.NVarChar, item.tipoEncargado)
      .input("titulo", sql.NVarChar, item.titulo || null)
      .input("identificacion", sql.NVarChar, item.identificacion || null)
      .input("nombre", sql.NVarChar, item.nombre || "")
      .input("primerApellido", sql.NVarChar, item.primerApellido || null)
      .input("segundoApellido", sql.NVarChar, item.segundoApellido || null)
      .input("correo", sql.NVarChar, item.correo || null)
      .input("telefono", sql.NVarChar, item.telefono || null)
      .input("telefonoSecundario", sql.NVarChar, item.telefonoSecundario || null)
      .input("direccionExacta", sql.NVarChar, item.direccionExacta || null)
      .query(`
        INSERT INTO dbo.Encargado
        (
          InstitucionId,
          TipoEncargado,
          Titulo,
          Identificacion,
          Nombre,
          PrimerApellido,
          SegundoApellido,
          Correo,
          Telefono,
          TelefonoSecundario,
          DireccionExacta,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.EncargadoId
        VALUES
        (
          @institucionId,
          @tipoEncargado,
          @titulo,
          @identificacion,
          @nombre,
          @primerApellido,
          @segundoApellido,
          @correo,
          @telefono,
          @telefonoSecundario,
          @direccionExacta,
          1,
          SYSDATETIME()
        )
      `);

    const encargadoId = encargadoInsert.recordset[0]?.EncargadoId;

    await transaction
      .request()
      .input("estudianteId", sql.Int, estudianteId)
      .input("encargadoId", sql.Int, encargadoId)
      .input("parentesco", sql.NVarChar, item.parentesco || null)
      .input("esPrincipal", sql.Bit, !!item.esPrincipal)
      .input("aceptaWhatsApp", sql.Bit, !!item.aceptaWhatsApp)
      .input("aceptaCorreo", sql.Bit, !!item.aceptaCorreo)
      .input(
        "recibeNotificaciones",
        sql.Bit,
        item.aceptaWhatsApp || item.aceptaCorreo
          ? true
          : item.recibeNotificaciones === false
            ? false
            : true
      )
      .input("viveConEstudiante", sql.Bit, !!item.viveConEstudiante)
      .query(`
        INSERT INTO dbo.EstudianteEncargado
        (
          EstudianteId,
          EncargadoId,
          Parentesco,
          EsPrincipal,
          AceptaWhatsApp,
          AceptaCorreo,
          RecibeNotificaciones,
          ViveConEstudiante,
          Activo,
          VigenciaDesde,
          CreatedAt
        )
        VALUES
        (
          @estudianteId,
          @encargadoId,
          @parentesco,
          @esPrincipal,
          @aceptaWhatsApp,
          @aceptaCorreo,
          @recibeNotificaciones,
          @viveConEstudiante,
          1,
          CAST(GETDATE() AS DATE),
          SYSDATETIME()
        )
      `);
  }
}

async function createStudentWithTransaction(params: {
  transaction: any;
  institucionId: number;
  payload: any;
  oldCorreo?: string | null;
}) {
  const { transaction, institucionId, payload, oldCorreo = null } = params;

  const {
    identificacion,
    nombre,
    primerApellido,
    segundoApellido,
    fechaNacimiento,
    correo,
    telefono,
    tipoIdentificacion,
    sexo,
    fotoUrl,
    nacionalidad,
    tipoEstudianteId,
    rutaTransporteId,
    autorizaWhatsAppEncargado,
    repitente,
    refugiado,
    tieneAdecuacion,
    adecuacion,
    nivelFuncionamiento,
    discapacidad,
    tipoDiscapacidad,
    enfermedad,
    rutaTransporteHabitual,
    observaciones,
    observacionMedica,
    especialidad,
    movimiento,
    encargados = []
  } = payload;
  const tipoEstudianteIdResolved = await resolveTipoEstudianteId(transaction, institucionId, tipoEstudianteId);
  const rutaTransporteIdResolved = await resolveRutaTransporteId(transaction, institucionId, rutaTransporteId);
  const tieneAdecuacionNormalizada = !!tieneAdecuacion && isValidAdecuacionValue(adecuacion);
  const adecuacionNormalizada = tieneAdecuacionNormalizada ? toNullableString(adecuacion) : null;

  const existe = await transaction
    .request()
    .input("institucionId", sql.Int, institucionId)
    .input("identificacion", sql.NVarChar, identificacion)
    .query(`
      SELECT TOP 1 EstudianteId, Activo
      FROM dbo.Estudiante
      WHERE InstitucionId = @institucionId
        AND Identificacion = @identificacion
    `);

  if (existe.recordset.length > 0) {
    const existente = existe.recordset[0];
    if (existente.Activo === false || existente.Activo === 0) {
      const error: any = new Error(
        "Ya existe un estudiante inactivo con esa identificación. Podés reactivarlo."
      );
      error.code = "ESTUDIANTE_INACTIVO";
      error.estudianteId = existente.EstudianteId;
      throw error;
    }

    const error: any = new Error(
      "Ya existe un estudiante con esa identificación en esta institución"
    );
    error.code = "ESTUDIANTE_DUPLICADO";
    throw error;
  }

  const codigoCarnet = buildCodigoCarnet(institucionId, identificacion);
  const qrContenido = codigoCarnet;
  const dominioCorreo = await getCorreoEstudianteDominio(transaction, institucionId);
  const correoGenerado = buildStudentEmail(identificacion, dominioCorreo);

  const result = await transaction
    .request()
    .input("institucionId", sql.Int, institucionId)
    .input("identificacion", sql.NVarChar, identificacion)
    .input("nombre", sql.NVarChar, nombre)
    .input("primerApellido", sql.NVarChar, primerApellido || null)
    .input("segundoApellido", sql.NVarChar, segundoApellido || null)
    .input("fechaNacimiento", sql.Date, fechaNacimiento || null)
    .input("correo", sql.NVarChar, correoGenerado)
    .input("telefono", sql.NVarChar, telefono || null)
    .input("tipoIdentificacion", sql.NVarChar, tipoIdentificacion || null)
    .input("sexo", sql.NVarChar, sexo || null)
    .input("fotoUrl", sql.NVarChar, fotoUrl || null)
    .input("codigoCarnet", sql.NVarChar, codigoCarnet)
     .input("qrContenido", sql.NVarChar, qrContenido)
     .input("nacionalidad", sql.NVarChar, nacionalidad || null)
    .input("tipoEstudianteId", sql.Int, tipoEstudianteIdResolved)
    .input("rutaTransporteId", sql.Int, rutaTransporteIdResolved)
    .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
    .input("repitente", sql.Bit, !!repitente)
    .input("refugiado", sql.Bit, !!refugiado)
    .input("tieneAdecuacion", sql.Bit, tieneAdecuacionNormalizada)
    .input("adecuacion", sql.NVarChar, adecuacionNormalizada)
    .input("nivelFuncionamiento", sql.NVarChar, nivelFuncionamiento || null)
    .input("discapacidad", sql.NVarChar, discapacidad || null)
    .input("tipoDiscapacidad", sql.NVarChar, tipoDiscapacidad || null)
    .input("enfermedad", sql.NVarChar, enfermedad || null)
    .input(
      "rutaTransporteHabitual",
      sql.NVarChar,
      rutaTransporteHabitual || null
    )
    .input("observaciones", sql.NVarChar(sql.MAX), observaciones || null)
    .input("observacionMedica", sql.NVarChar, observacionMedica || null)
    .query(`
      INSERT INTO dbo.Estudiante
      (
        InstitucionId,
        Identificacion,
        Nombre,
        PrimerApellido,
        SegundoApellido,
        FechaNacimiento,
        Correo,
        Telefono,
        TipoIdentificacion,
        Sexo,
        FotoUrl,
        CodigoCarnet,
        QrContenido,
        Nacionalidad,
        TipoEstudianteId,
        RutaTransporteId,
        AutorizaWhatsAppEncargado,
        Repitente,
        Refugiado,
        TieneAdecuacion,
        Adecuacion,
        NivelFuncionamiento,
        Discapacidad,
        TipoDiscapacidad,
        Enfermedad,
        RutaTransporteHabitual,
        Observaciones,
        ObservacionMedica
      )
      OUTPUT INSERTED.*
      VALUES
      (
        @institucionId,
        @identificacion,
        @nombre,
        @primerApellido,
        @segundoApellido,
        @fechaNacimiento,
        @correo,
        @telefono,
        @tipoIdentificacion,
        @sexo,
        @fotoUrl,
        @codigoCarnet,
        @qrContenido,
        @nacionalidad,
        @tipoEstudianteId,
        @rutaTransporteId,
        @autorizaWhatsAppEncargado,
        @repitente,
        @refugiado,
        @tieneAdecuacion,
        @adecuacion,
        @nivelFuncionamiento,
        @discapacidad,
        @tipoDiscapacidad,
        @enfermedad,
        @rutaTransporteHabitual,
        @observaciones,
        @observacionMedica
      )
    `);

  const estudiante = result.recordset[0];
  const encargadosNormalizados = normalizeEncargados(encargados);

  if (encargadosNormalizados.length > 0) {
    await replaceEncargadosHistorico({
      transaction,
      institucionId,
      estudianteId: estudiante.EstudianteId,
      encargados: encargadosNormalizados
    });
  }

  await syncStudentMovement({
    transaction,
    institucionId,
    estudianteId: estudiante.EstudianteId,
    movimiento
  });

  await syncActiveMatriculaDetailFromStudentImport({
    transaction,
    institucionId,
    estudianteId: estudiante.EstudianteId,
    especialidad,
    repitente: !!repitente
  });

  await ensureParentPortalUser({
    transaction,
    institucionId,
    correoUsuario: correoGenerado,
    nombre,
    primerApellido,
    segundoApellido,
    telefono,
    passwordInicial: identificacion,
    oldCorreo
  });

  estudiante.Correo = correoGenerado;
  return estudiante;
}

async function importStudentWithTransaction(params: {
  transaction: any;
  institucionId: number;
  payload: any;
}) {
  const { transaction, institucionId, payload } = params;
  const identificacionNormalizada = String(payload.identificacion || "").replace(/[-\s]/g, "").trim();

  const existing = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("identificacion", sql.NVarChar, identificacionNormalizada)
    .query(`
      SELECT TOP 1 EstudianteId, Identificacion, Correo, Activo
      FROM dbo.Estudiante
      WHERE InstitucionId = @institucionId
        AND REPLACE(REPLACE(LTRIM(RTRIM(Identificacion)), N'-', N''), N' ', N'') = @identificacion
      ORDER BY CASE WHEN ISNULL(Activo, 1) = 1 THEN 0 ELSE 1 END, EstudianteId DESC
    `);

  const row = existing.recordset[0];
  if (!row) {
    await createStudentWithTransaction({ transaction, institucionId, payload });
    return {
      estado: "CREADO" as const,
      motivo: "Registro creado correctamente"
    };
  }

  const {
    identificacion,
    nombre,
    primerApellido,
    segundoApellido,
    fechaNacimiento,
    telefono,
    tipoIdentificacion,
    sexo,
    fotoUrl,
    nacionalidad,
    tipoEstudianteId,
    rutaTransporteId,
    autorizaWhatsAppEncargado,
    repitente,
    refugiado,
    tieneAdecuacion,
    adecuacion,
    nivelFuncionamiento,
    discapacidad,
    tipoDiscapacidad,
    enfermedad,
    rutaTransporteHabitual,
    observaciones,
    observacionMedica,
    especialidad,
    movimiento,
    encargados = []
  } = payload;
  const tipoEstudianteIdResolved = await resolveTipoEstudianteId(transaction, institucionId, tipoEstudianteId);
  const rutaTransporteIdResolved = await resolveRutaTransporteId(transaction, institucionId, rutaTransporteId);
  const tieneAdecuacionNormalizada = !!tieneAdecuacion && isValidAdecuacionValue(adecuacion);
  const adecuacionNormalizada = tieneAdecuacionNormalizada ? toNullableString(adecuacion) : null;

  const codigoCarnet = buildCodigoCarnet(institucionId, identificacion);
  const qrContenido = codigoCarnet;
  const dominioCorreo = await getCorreoEstudianteDominio(transaction, institucionId);
  const correoGenerado = buildStudentEmail(identificacion, dominioCorreo);

  await transaction.request()
    .input("estudianteId", sql.Int, row.EstudianteId)
    .input("identificacion", sql.NVarChar, identificacion)
    .input("nombre", sql.NVarChar, nombre)
    .input("primerApellido", sql.NVarChar, primerApellido || null)
    .input("segundoApellido", sql.NVarChar, segundoApellido || null)
    .input("fechaNacimiento", sql.Date, fechaNacimiento || null)
    .input("correo", sql.NVarChar, correoGenerado)
    .input("telefono", sql.NVarChar, telefono || null)
    .input("tipoIdentificacion", sql.NVarChar, tipoIdentificacion || null)
    .input("sexo", sql.NVarChar, sexo || null)
    .input("fotoUrl", sql.NVarChar, fotoUrl || null)
    .input("codigoCarnet", sql.NVarChar, codigoCarnet)
    .input("qrContenido", sql.NVarChar, qrContenido)
    .input("nacionalidad", sql.NVarChar, nacionalidad || null)
    .input("tipoEstudianteId", sql.Int, tipoEstudianteIdResolved)
    .input("rutaTransporteId", sql.Int, rutaTransporteIdResolved)
    .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
    .input("repitente", sql.Bit, !!repitente)
    .input("refugiado", sql.Bit, !!refugiado)
    .input("tieneAdecuacion", sql.Bit, tieneAdecuacionNormalizada)
    .input("adecuacion", sql.NVarChar, adecuacionNormalizada)
    .input("nivelFuncionamiento", sql.NVarChar, nivelFuncionamiento || null)
    .input("discapacidad", sql.NVarChar, discapacidad || null)
    .input("tipoDiscapacidad", sql.NVarChar, tipoDiscapacidad || null)
    .input("enfermedad", sql.NVarChar, enfermedad || null)
    .input("rutaTransporteHabitual", sql.NVarChar, rutaTransporteHabitual || null)
    .input("observaciones", sql.NVarChar(sql.MAX), observaciones || null)
    .input("observacionMedica", sql.NVarChar, observacionMedica || null)
    .query(`
      UPDATE dbo.Estudiante
      SET Identificacion = @identificacion,
          Nombre = @nombre,
          PrimerApellido = @primerApellido,
          SegundoApellido = @segundoApellido,
          FechaNacimiento = @fechaNacimiento,
          Correo = @correo,
          Telefono = @telefono,
          TipoIdentificacion = @tipoIdentificacion,
          Sexo = @sexo,
          FotoUrl = COALESCE(@fotoUrl, FotoUrl),
          CodigoCarnet = @codigoCarnet,
          QrContenido = @qrContenido,
          Nacionalidad = @nacionalidad,
          TipoEstudianteId = @tipoEstudianteId,
          RutaTransporteId = @rutaTransporteId,
          AutorizaWhatsAppEncargado = @autorizaWhatsAppEncargado,
          Repitente = @repitente,
          Refugiado = @refugiado,
          TieneAdecuacion = @tieneAdecuacion,
          Adecuacion = @adecuacion,
          NivelFuncionamiento = @nivelFuncionamiento,
          Discapacidad = @discapacidad,
          TipoDiscapacidad = @tipoDiscapacidad,
          Enfermedad = @enfermedad,
          RutaTransporteHabitual = @rutaTransporteHabitual,
          Observaciones = @observaciones,
          ObservacionMedica = @observacionMedica,
          Activo = 1,
          UpdatedAt = SYSDATETIME()
      WHERE EstudianteId = @estudianteId
    `);

  const encargadosNormalizados = normalizeEncargados(encargados);
  if (encargadosNormalizados.length > 0) {
    await replaceEncargadosHistorico({
      transaction,
      institucionId,
      estudianteId: row.EstudianteId,
      encargados: encargadosNormalizados
    });
  }

  await syncStudentMovement({
    transaction,
    institucionId,
    estudianteId: row.EstudianteId,
    movimiento
  });

  await syncActiveMatriculaDetailFromStudentImport({
    transaction,
    institucionId,
    estudianteId: row.EstudianteId,
    especialidad,
    repitente: !!repitente
  });

  await ensureParentPortalUser({
    transaction,
    institucionId,
    correoUsuario: correoGenerado,
    nombre,
    primerApellido,
    segundoApellido,
    telefono,
    passwordInicial: identificacion,
    oldCorreo: row.Correo || null
  });

  return {
    estado: row.Activo !== false && row.Activo !== 0 ? ("ACTUALIZADO" as const) : ("REACTIVADO" as const),
    motivo:
      row.Activo !== false && row.Activo !== 0
        ? "Registro existente actualizado desde la importacion"
        : "Registro reactivado y actualizado desde la importacion"
  };
}

async function resolveTipoEstudianteId(transaction: any, institucionId: number, tipoEstudianteId: any) {
  const normalizedId = toNullablePositiveInt(tipoEstudianteId);
  if (normalizedId) {
    const result = await transaction.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoEstudianteId", sql.Int, normalizedId)
      .query(`
        SELECT TOP 1 TipoEstudianteId
        FROM dbo.TipoEstudiante
        WHERE InstitucionId = @institucionId
          AND TipoEstudianteId = @tipoEstudianteId
      `);

    return result.recordset[0]?.TipoEstudianteId || null;
  }

  const result = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("descripcion", sql.NVarChar, toNullableString(tipoEstudianteId))
    .query(`
      SELECT TOP 1 TipoEstudianteId
      FROM dbo.TipoEstudiante
      WHERE InstitucionId = @institucionId
        AND (
          UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
          OR UPPER(LTRIM(RTRIM(REPLACE(Descripcion, N'  ', N' ')))) = UPPER(LTRIM(RTRIM(REPLACE(@descripcion, N'  ', N' '))))
        )
    `);

  return result.recordset[0]?.TipoEstudianteId || null;
}

async function resolveRutaTransporteId(transaction: any, institucionId: number, rutaTransporteId: any) {
  const normalizedId = toNullablePositiveInt(rutaTransporteId);
  if (normalizedId) {
    const result = await transaction.request()
      .input("institucionId", sql.Int, institucionId)
      .input("rutaTransporteId", sql.Int, normalizedId)
      .query(`
        SELECT TOP 1 RutaTransporteId
        FROM dbo.RutaTransporte
        WHERE InstitucionId = @institucionId
          AND RutaTransporteId = @rutaTransporteId
      `);

    return result.recordset[0]?.RutaTransporteId || null;
  }

  const result = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("descripcion", sql.NVarChar, toNullableString(rutaTransporteId))
    .query(`
      SELECT TOP 1 RutaTransporteId
      FROM dbo.RutaTransporte
      WHERE InstitucionId = @institucionId
        AND (
          UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
          OR UPPER(LTRIM(RTRIM(REPLACE(Descripcion, N'  ', N' ')))) = UPPER(LTRIM(RTRIM(REPLACE(@descripcion, N'  ', N' '))))
        )
    `);

  return result.recordset[0]?.RutaTransporteId || null;
}

function classifyStudentMovementType(value: any) {
  const normalized = normalizeComparableText(value);
  if (!normalized) return null;
  if (normalized.includes("traslado")) return "TRASLADO";
  if (normalized.includes("retiro")) return "RETIRO";
  if (normalized.includes("reingreso")) return "REINGRESO";
  if (normalized.includes("matricula")) return "MATRICULA";
  return "OTRO";
}

async function syncStudentMovement(params: {
  transaction: any;
  institucionId: number;
  estudianteId: number;
  movimiento?: any;
}) {
  const descripcionMovimiento = toNullableString(params.movimiento);
  if (!descripcionMovimiento) return;

  const latest = await params.transaction.request()
    .input("institucionId", sql.Int, params.institucionId)
    .input("estudianteId", sql.Int, params.estudianteId)
    .query(`
      SELECT TOP 1 DescripcionMovimiento
      FROM dbo.EstudianteMovimiento
      WHERE InstitucionId = @institucionId
        AND EstudianteId = @estudianteId
      ORDER BY FechaMovimiento DESC, EstudianteMovimientoId DESC
    `);

  if (normalizeComparableText(latest.recordset[0]?.DescripcionMovimiento) === normalizeComparableText(descripcionMovimiento)) {
    return;
  }

  await params.transaction.request()
    .input("institucionId", sql.Int, params.institucionId)
    .input("estudianteId", sql.Int, params.estudianteId)
    .input("tipoMovimiento", sql.NVarChar, classifyStudentMovementType(descripcionMovimiento))
    .input("descripcionMovimiento", sql.NVarChar, descripcionMovimiento)
    .query(`
      INSERT INTO dbo.EstudianteMovimiento
      (
        InstitucionId,
        EstudianteId,
        TipoMovimiento,
        DescripcionMovimiento,
        Fuente,
        FechaMovimiento,
        CreatedAt
      )
      VALUES
      (
        @institucionId,
        @estudianteId,
        @tipoMovimiento,
        @descripcionMovimiento,
        N'IMPORTACION_ESTUDIANTES',
        CAST(GETDATE() AS DATE),
        SYSDATETIME()
      )
    `);
}

function isSinEspecialidad(value: any) {
  const normalized = normalizeComparableText(value);
  return !normalized || ["sin especialidad", "ninguna", "no aplica", "na"].includes(normalized);
}

async function resolveEspecialidadIdByDescription(transaction: any, institucionId: number, especialidad: any) {
  const descripcion = toNullableString(especialidad);
  if (!descripcion || isSinEspecialidad(descripcion)) return null;

  const result = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("descripcion", sql.NVarChar, descripcion)
    .query(`
      SELECT TOP 1 EspecialidadId, Descripcion
      FROM dbo.Especialidad
      WHERE InstitucionId = @institucionId
        AND Activo = 1
        AND (
          UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
          OR UPPER(LTRIM(RTRIM(REPLACE(Descripcion, N'  ', N' ')))) = UPPER(LTRIM(RTRIM(REPLACE(@descripcion, N'  ', N' '))))
        )
      ORDER BY Descripcion
    `);

  return result.recordset[0] || null;
}

async function syncActiveMatriculaDetailFromStudentImport(params: {
  transaction: any;
  institucionId: number;
  estudianteId: number;
  especialidad?: any;
  repitente?: boolean;
}) {
  const { transaction, institucionId, estudianteId, especialidad, repitente } = params;
  const especialidadInfo = await resolveEspecialidadIdByDescription(transaction, institucionId, especialidad);
  const especialidadTexto = isSinEspecialidad(especialidad)
    ? null
    : toNullableString(especialidadInfo?.Descripcion || especialidad);

  const activeMatricula = await transaction.request()
    .input("institucionId", sql.Int, institucionId)
    .input("estudianteId", sql.Int, estudianteId)
    .query(`
      DECLARE @anioLectivoActualId INT;

      SELECT TOP 1 @anioLectivoActualId = AnioLectivoId
      FROM dbo.AnioLectivo
      WHERE InstitucionId = @institucionId
        AND Activo = 1
      ORDER BY FechaInicio DESC, AnioLectivoId DESC;

      SELECT TOP 1
        m.MatriculaId,
        md.MatriculaDetalleId
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = m.EstudianteId
      LEFT JOIN dbo.MatriculaDetalle md
        ON md.MatriculaId = m.MatriculaId
      WHERE e.InstitucionId = @institucionId
        AND m.EstudianteId = @estudianteId
        AND m.Estado = N'Activa'
        AND (@anioLectivoActualId IS NULL OR m.AnioLectivoId = @anioLectivoActualId)
      ORDER BY m.MatriculaId DESC
    `);

  const matricula = activeMatricula.recordset[0];
  if (!matricula?.MatriculaId) return;

  const request = transaction.request()
    .input("matriculaId", sql.Int, matricula.MatriculaId)
    .input("especialidadId", sql.Int, especialidadInfo?.EspecialidadId || null)
    .input("especialidad", sql.NVarChar, especialidadTexto)
    .input("esRepitente", sql.Bit, !!repitente);

  if (matricula.MatriculaDetalleId) {
    await request.query(`
      UPDATE dbo.MatriculaDetalle
      SET
        EspecialidadId = @especialidadId,
        Especialidad = @especialidad,
        EsRepitente = @esRepitente,
        UpdatedAt = SYSDATETIME()
      WHERE MatriculaId = @matriculaId
    `);
    return;
  }

  await request.query(`
    INSERT INTO dbo.MatriculaDetalle
    (
      MatriculaId,
      EspecialidadId,
      Especialidad,
      EsRepitente,
      CreatedAt
    )
    VALUES
    (
      @matriculaId,
      @especialidadId,
      @especialidad,
      @esRepitente,
      SYSDATETIME()
    )
  `);
}

function cleanupImportJobs() {
  const now = Date.now();
  for (const [id, job] of importJobs.entries()) {
    const finished = job.status === "COMPLETADO" || job.status === "ERROR";
    if (finished && now - job.updatedAt > IMPORT_JOB_TTL_MS) {
      importJobs.delete(id);
    }
  }
}

function createImportJob(params: { institucionId: number; usuarioId: number | null; totalRegistros: number }) {
  cleanupImportJobs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: ImportJob = {
    id,
    institucionId: params.institucionId,
    usuarioId: params.usuarioId,
    status: "PENDIENTE",
    totalRegistros: params.totalRegistros,
    procesados: 0,
    totalOk: 0,
    totalError: 0,
    totalCreados: 0,
    totalActualizados: 0,
    totalReactivados: 0,
    totalOmitidos: 0,
    resultados: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  importJobs.set(id, job);
  return job;
}

function serializeImportJob(job: ImportJob) {
  return {
    jobId: job.id,
    status: job.status,
    totalRegistros: job.totalRegistros,
    procesados: job.procesados,
    totalOk: job.totalOk,
    totalError: job.totalError,
    totalCreados: job.totalCreados,
    totalActualizados: job.totalActualizados,
    totalReactivados: job.totalReactivados,
    totalOmitidos: job.totalOmitidos,
    porcentaje: job.totalRegistros ? Math.round((job.procesados / job.totalRegistros) * 100) : 0,
    error: job.error || null,
    resultados: job.status === "COMPLETADO" || job.status === "ERROR" ? job.resultados : job.resultados.slice(-20)
  };
}

function parseImportRowsFromFile(file?: Express.Multer.File) {
  if (!file?.buffer) {
    const error: any = new Error("Debés adjuntar un archivo Excel");
    error.status = 400;
    throw error;
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Estudiantes")
    ? "Estudiantes"
    : workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

  if (!rows.length) {
    const error: any = new Error("El archivo no contiene registros para importar");
    error.status = 400;
    throw error;
  }

  return rows.map((row) => normalizeStudentImportRowKeys(row));
}

function normalizeImportHeaderKey(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeStudentImportRowKeys(row: any) {
  const source = row && typeof row === "object" ? row : {};
  const entries = Object.entries(source);
  const byKey = new Map<string, any>();
  for (const [key, value] of entries) {
    byKey.set(normalizeImportHeaderKey(key), value);
  }

  const aliases: Record<string, string[]> = {
    identificacion: ["identificacion", "identificacionestudiante", "cedula", "numeroidentificacion"],
    tipoIdentificacion: ["tipoidentificacionestudiante", "tipoidentificacion"],
    nombre: ["nombre", "nombres"],
    primerApellido: ["primerapellido", "apellido1", "primerapellidodelestudiante"],
    segundoApellido: ["segundoapellido", "apellido2", "segundoapellidodelestudiante"],
    fechaNacimiento: ["fechanacimiento", "fecnacimiento", "nacimiento"],
    sexo: ["sexo", "genero"],
    correo: ["correo", "email", "correoelectronico", "correoestuduante"],
    telefono: ["telefono", "celular", "telefono1", "celularestudiante"],
    tipoEstudianteId: ["tipoestudianteid", "tipoestudiante"],
    nacionalidad: ["nacionalidad"],
    repitente: ["repitente"],
    refugiado: ["refugiado"],
    tieneAdecuacion: ["tieneadecuacion", "adecuacionhabilitada", "conadecuacion", "adecuacion"],
    adecuacion: ["tipoadecuacion", "adecuaciondetalle"],
    nivelFuncionamiento: ["nivelfuncionamiento", "niveldefuncionamiento"],
    discapacidad: ["discapacidad"],
    tipoDiscapacidad: ["tipodiscapacidad"],
    enfermedad: ["enfermedad", "tipoenfermedad"],
    especialidad: ["especialidad"],
    rutaTransporteId: ["rutatransporteid", "idrutatransporte", "rutatransporte"],
    rutaTransporteHabitual: ["rutatransportehabitual", "rutahabitual", "ruta"],
    autorizaWhatsAppEncargado: ["autorizawhatsappencargado", "autorizaencargadowhatsapp", "autorizawhatsapp"],
    observaciones: ["observaciones", "observaciongeneral", "observacionestudiante", "observacionesnivelfuncionamieto", "observacionesnivelfuncionamiento"],
    observacionMedica: ["observacionmedica", "observacionesmedicas", "observacion"],
    encargado1_titulo: ["titulo"],
    encargado1_nombreCompleto: ["encargado1", "encargado_1"],
    encargado1_identificacion: ["cedula1"],
    encargado1_telefono: ["celular1"],
    encargado1_parentesco: ["parentesco1"],
    encargado1_viveConEstudiante: ["viveconestudiante1"],
    encargado1_direccionExacta: ["direccionexacta1"],
    encargado1_aceptaWhatsApp: ["aceptawa1"],
    encargado1_aceptaCorreo: ["aceptacorreo1"],
    encargado2_nombreCompleto: ["encargado2"],
    encargado2_identificacion: ["cedula2"],
    encargado2_telefono: ["celular2"],
    encargado2_parentesco: ["parentezco2", "parentesco2"],
    encargado2_viveConEstudiante: ["viveconestudiante2"],
    encargado2_telefonoSecundario: ["otrocel"],
    encargado2_direccionExacta: ["direccion2"],
    encargado2_aceptaWhatsApp: ["aceptawa2"],
    encargado2_aceptaCorreo: ["aceptacorreo2"],
    movimiento: ["movimiento"],
    fotoUrl: ["fotoestudiante"]
  };

  const normalized: Record<string, any> = { ...source };
  for (const [targetKey, keys] of Object.entries(aliases)) {
    const found = keys.find((k) => byKey.has(k));
    if (found) normalized[targetKey] = byKey.get(found);
  }
  return normalized;
}

function buildImportPayloadFromRow(row: any) {
  const identificacion = toNullableString(row.identificacion);
  const nombre = toNullableString(row.nombre);
  const primerApellido = toNullableString(row.primerApellido);
  const segundoApellido = toNullableString(row.segundoApellido);
  const fechaNacimiento = toExcelDate(row.fechaNacimiento);
  const adecuacionImportada = toNullableString(row.adecuacion);
  const adecuacionValida = isValidAdecuacionValue(adecuacionImportada);
  const tieneAdecuacionSolicitada = toBoolean(row.tieneAdecuacion, adecuacionValida);
  const tieneAdecuacion = tieneAdecuacionSolicitada && adecuacionValida;
  const adecuacion = tieneAdecuacion ? adecuacionImportada : null;
  const discapacidadSolicitada = isTruthyText(row.discapacidad);
  const tipoDiscapacidad = discapacidadSolicitada && isValidTipoDiscapacidad(row.tipoDiscapacidad)
    ? toNullableString(row.tipoDiscapacidad)
    : null;
  const discapacidad = discapacidadSolicitada ? "Sí" : "No";

  if (!identificacion || !nombre || !primerApellido || !segundoApellido || !fechaNacimiento) {
    return {
      identificacion: identificacion || "",
      error: "Completá los campos obligatorios: identificación, nombre, primer apellido, segundo apellido y fecha de nacimiento.",
      payload: null
    };
  }

  if (tieneAdecuacionSolicitada && !adecuacionValida) {
    return {
      identificacion,
      error: "Seleccioná una adecuación válida. Regular, Sin adecuación y Seleccione no son adecuaciones.",
      payload: null
    };
  }

  if (tieneAdecuacion && !adecuacion) {
    return {
      identificacion,
      error: "Marcaste Adecuación en Si, pero no completaste la adecuación correspondiente.",
      payload: null
    };
  }

  const buildEncargadoFromFullName = (params: {
    nombreCompleto: any;
    identificacion: any;
    telefono: any;
    telefonoSecundario?: any;
    direccionExacta?: any;
    parentesco?: any;
    viveConEstudiante?: any;
    aceptaWhatsApp?: any;
    aceptaCorreo?: any;
    esPrincipal?: boolean;
    titulo?: any;
  }) => {
    const parsed = splitFullName(params.nombreCompleto);
    return {
      tipoEncargado: "ENCARGADO" as const,
      titulo: toNullableString(params.titulo),
      identificacion: toNullableString(params.identificacion),
      nombre: parsed.nombre,
      primerApellido: parsed.primerApellido,
      segundoApellido: parsed.segundoApellido,
      correo: null,
      telefono: normalizePhoneWithDefaultCountryCode(params.telefono),
      telefonoSecundario: normalizePhoneWithDefaultCountryCode(params.telefonoSecundario),
      direccionExacta: toNullableString(params.direccionExacta),
      parentesco: toNullableString(params.parentesco) || "Encargado",
      viveConEstudiante: toBoolean(params.viveConEstudiante),
      esPrincipal: !!params.esPrincipal,
      aceptaWhatsApp: isTruthyText(params.aceptaWhatsApp),
      aceptaCorreo: isTruthyText(params.aceptaCorreo),
      recibeNotificaciones: isTruthyText(params.aceptaWhatsApp) || isTruthyText(params.aceptaCorreo)
    };
  };

  const encargado1 = buildEncargadoFromFullName({
    nombreCompleto: row.encargado1_nombreCompleto,
    identificacion: row.encargado1_identificacion,
    telefono: row.encargado1_telefono,
    direccionExacta: row.encargado1_direccionExacta,
    parentesco: row.encargado1_parentesco,
    viveConEstudiante: row.encargado1_viveConEstudiante,
    aceptaWhatsApp: row.encargado1_aceptaWhatsApp,
    aceptaCorreo: row.encargado1_aceptaCorreo,
    esPrincipal: true,
    titulo: row.encargado1_titulo
  });
  const encargado2 = buildEncargadoFromFullName({
    nombreCompleto: row.encargado2_nombreCompleto,
    identificacion: row.encargado2_identificacion,
    telefono: row.encargado2_telefono,
    telefonoSecundario: row.encargado2_telefonoSecundario,
    direccionExacta: row.encargado2_direccionExacta,
    parentesco: row.encargado2_parentesco,
    viveConEstudiante: row.encargado2_viveConEstudiante,
    aceptaWhatsApp: row.encargado2_aceptaWhatsApp,
    aceptaCorreo: row.encargado2_aceptaCorreo,
    esPrincipal: false
  });

  const encargados = [encargado1, encargado2].filter(
    (item) => item.identificacion || item.nombre || item.telefono || item.telefonoSecundario
  );

  const autorizaWhatsAppEncargado =
    toBoolean(row.autorizaWhatsAppEncargado) ||
    isTruthyText(row.encargado1_aceptaWhatsApp) ||
    isTruthyText(row.encargado2_aceptaWhatsApp);

  return {
    identificacion,
    error: null,
    payload: {
      identificacion,
      tipoIdentificacion: toNullableString(row.tipoIdentificacion),
      nombre,
      primerApellido,
      segundoApellido,
      fechaNacimiento,
      sexo: toNullableString(row.sexo),
      correo: toNullableString(row.correo),
      telefono: normalizePhoneWithDefaultCountryCode(row.telefono),
      fotoUrl: toNullableString(row.fotoUrl),
      nacionalidad: toNullableString(row.nacionalidad),
      tipoEstudianteId: toNullableString(row.tipoEstudianteId),
      rutaTransporteId: toNullableString(row.rutaTransporteId),
      autorizaWhatsAppEncargado,
      repitente: toBoolean(row.repitente),
      refugiado: toBoolean(row.refugiado),
      tieneAdecuacion,
      adecuacion,
      nivelFuncionamiento: toNullableString(row.nivelFuncionamiento),
      discapacidad,
      tipoDiscapacidad,
      enfermedad: toNullableString(row.enfermedad),
      rutaTransporteHabitual: toNullableString(row.rutaTransporteHabitual) || toNullableString(row.rutaTransporteId),
      observaciones: toNullableString(row.observaciones),
      observacionMedica: toNullableString(row.observacionMedica),
      especialidad: toNullableString(row.especialidad),
      movimiento: toNullableString(row.movimiento),
      encargados
    }
  };
}

function shouldSkipStudentImportRow(row: any) {
  const identificacion = normalizeImportHeaderKey(row?.identificacion);
  if (identificacion === "guiavisual" || identificacion === "consejo") {
    return true;
  }

  const values = Object.values(row || {}).map((value) => String(value ?? "").trim());
  return values.every((value) => value === "");
}

async function processStudentImportRows(params: { rows: any[]; institucionId: number; job?: ImportJob }) {
  const { rows, institucionId, job } = params;
  const pool = await getPool();

  const resultados: ImportResultRow[] = [];
  let totalOk = 0;
  let totalError = 0;
  let totalCreados = 0;
  let totalActualizados = 0;
  let totalReactivados = 0;
  let totalOmitidos = 0;

  if (job) {
    job.status = "PROCESANDO";
    job.updatedAt = Date.now();
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (shouldSkipStudentImportRow(row)) {
      continue;
    }
    const fila = i + 2;
    const built = buildImportPayloadFromRow(row);

    if (built.error || !built.payload) {
      resultados.push({
        fila,
        identificacion: built.identificacion || "",
        estado: "ERROR",
        motivo: built.error || "No se pudo preparar el registro"
      });
      totalError++;
    } else {
      const transaction = new sql.Transaction(pool);

      try {
        await transaction.begin();
        const importResult = await importStudentWithTransaction({
          transaction,
          institucionId,
          payload: built.payload
        });
        await transaction.commit();

        resultados.push({
          fila,
          identificacion: built.identificacion || "",
          estado: importResult.estado,
          motivo: importResult.motivo
        });
        if (importResult.estado === "CREADO") {
          totalOk++;
          totalCreados++;
        } else if (importResult.estado === "ACTUALIZADO") {
          totalOk++;
          totalActualizados++;
        } else if (importResult.estado === "REACTIVADO") {
          totalOk++;
          totalReactivados++;
        } else if (importResult.estado === "OMITIDO") {
          totalOmitidos++;
        }
      } catch (error: any) {
        try {
          await transaction.rollback();
        } catch {}

        resultados.push({
          fila,
          identificacion: built.identificacion || "",
          estado: "ERROR",
          motivo: error?.message || "No se pudo cargar el registro"
        });
        totalError++;
      }
    }

    if (job) {
      job.procesados = i + 1;
      job.totalOk = totalOk;
      job.totalError = totalError;
      job.totalCreados = totalCreados;
      job.totalActualizados = totalActualizados;
      job.totalReactivados = totalReactivados;
      job.totalOmitidos = totalOmitidos;
      job.resultados = resultados;
      job.updatedAt = Date.now();
    }
  }

  if (job) {
    job.status = "COMPLETADO";
    job.procesados = rows.length;
    job.totalOk = totalOk;
    job.totalError = totalError;
    job.totalCreados = totalCreados;
    job.totalActualizados = totalActualizados;
    job.totalReactivados = totalReactivados;
    job.totalOmitidos = totalOmitidos;
    job.resultados = resultados;
    job.updatedAt = Date.now();
  }

  return {
    totalRegistros: rows.length,
    totalOk,
    totalError,
    totalCreados,
    totalActualizados,
    totalReactivados,
    totalOmitidos,
    resultados
  };
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const incluirInactivos =
      String(req.query.incluirInactivos || "false") === "true";
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(500, Math.max(25, Number(req.query.pageSize || 100) || 100));
    const offset = (page - 1) * pageSize;

    if (!req.auth?.institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("institucionId", sql.Int, req.auth.institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .input("offset", sql.Int, offset)
      .input("pageSize", sql.Int, pageSize)
      .query(`
        WITH base AS (
          SELECT
            e.EstudianteId,
            e.Identificacion,
            e.Nombre,
            e.PrimerApellido,
            e.SegundoApellido,
            e.FechaNacimiento,
            e.Sexo,
            e.Correo,
            e.Telefono,
            e.TipoIdentificacion,
            e.FotoUrl,
            e.CodigoCarnet,
            e.QrContenido,
            e.Nacionalidad,
            e.TipoEstudianteId,
            te.Descripcion AS TipoEstudianteDescripcion,
            e.RutaTransporteId,
            rt.Descripcion AS RutaTransporteDescripcion,
            e.AutorizaWhatsAppEncargado,
            e.Repitente,
            e.Refugiado,
            e.TieneAdecuacion,
            e.Adecuacion,
            e.NivelFuncionamiento,
            e.Discapacidad,
            e.TipoDiscapacidad,
            e.Enfermedad,
            e.RutaTransporteHabitual,
            e.Observaciones,
            e.ObservacionMedica,
            e.Activo,
            ${suspensionVigenteSelectSql}
          FROM dbo.Estudiante e
          LEFT JOIN dbo.TipoEstudiante te
            ON te.TipoEstudianteId = e.TipoEstudianteId
          LEFT JOIN dbo.RutaTransporte rt
            ON rt.RutaTransporteId = e.RutaTransporteId
          ${getSuspensionVigenteApplySql("e")}
          WHERE e.InstitucionId = @institucionId
            AND (@incluirInactivos = 1 OR e.Activo = 1)
            AND (
              @q = '%%'
              OR e.Identificacion LIKE @q
              OR e.Nombre LIKE @q
              OR e.PrimerApellido LIKE @q
              OR e.SegundoApellido LIKE @q
              OR e.Correo LIKE @q
              OR e.Telefono LIKE @q
              OR e.Nacionalidad LIKE @q
              OR te.Descripcion LIKE @q
              OR rt.Descripcion LIKE @q
            )
          )
        SELECT
          base.*,
          COUNT(1) OVER() AS TotalRegistros
        FROM base
        ORDER BY PrimerApellido, SegundoApellido, Nombre, EstudianteId
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);

    const total = Number(result.recordset[0]?.TotalRegistros || 0);
    const items = result.recordset.map(({ TotalRegistros, ...row }: any) => row);

    return ok(res, { items, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar estudiantes:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar estudiantes"
    });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    if (!req.auth?.institucionId) {
      return badRequest(res, "El usuario no tiene institucion asignada");
    }
    const institucionId = Number(req.auth.institucionId);
    const cacheKey = `estudiantes.dashboard|inst:${institucionId}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= DASHBOARD_CACHE_TTL_MS) {
      return ok(res, cached.data);
    }
    const inFlight = dashboardInFlight.get(cacheKey);
    if (inFlight) {
      const shared = await inFlight;
      return ok(res, shared);
    }

    const pool = await getPool();
    const queryPromise = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        DECLARE @anioLectivoActualId INT;

        SELECT TOP 1 @anioLectivoActualId = AnioLectivoId
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND Activo = 1
        ORDER BY FechaInicio DESC, AnioLectivoId DESC;

        DECLARE @matriculasBase TABLE (
          EstudianteId INT,
          Grupo NVARCHAR(200),
          Seccion NVARCHAR(200),
          Especialidad NVARCHAR(200)
        );

        INSERT INTO @matriculasBase (EstudianteId, Grupo, Seccion, Especialidad)
        SELECT
          e.EstudianteId,
          COALESCE(NULLIF(LTRIM(RTRIM(g.Nivel)), ''), N'Sin grupo') AS Grupo,
          COALESCE(NULLIF(LTRIM(RTRIM(md.SeccionTexto)), ''), NULLIF(LTRIM(RTRIM(g.Nombre)), ''), N'Sin seccion') AS Seccion,
          COALESCE(NULLIF(LTRIM(RTRIM(esp.Descripcion)), ''), NULLIF(LTRIM(RTRIM(md.Especialidad)), ''), NULLIF(LTRIM(RTRIM(g.Especialidad)), ''), N'Sin especialidad') AS Especialidad
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        LEFT JOIN dbo.MatriculaDetalle md
          ON md.MatriculaId = m.MatriculaId
        LEFT JOIN dbo.Especialidad esp
          ON esp.EspecialidadId = md.EspecialidadId
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
          AND m.Estado = N'Activa'
          AND (@anioLectivoActualId IS NULL OR m.AnioLectivoId = @anioLectivoActualId);

        SELECT
          SUM(CASE WHEN e.Activo = 1 THEN 1 ELSE 0 END) AS TotalActivos,
          SUM(CASE WHEN e.Activo = 0 THEN 1 ELSE 0 END) AS TotalInactivos,
          COUNT(1) AS TotalGeneral,
          (SELECT COUNT(DISTINCT EstudianteId) FROM @matriculasBase) AS TotalMatriculados
        FROM dbo.Estudiante e
        WHERE e.InstitucionId = @institucionId;

        SELECT Grupo AS Label, COUNT(DISTINCT EstudianteId) AS Total
        FROM @matriculasBase
        WHERE NULLIF(LTRIM(RTRIM(Grupo)), '') IS NOT NULL
          AND LTRIM(RTRIM(Grupo)) <> N'Sin grupo'
        GROUP BY Grupo
        ORDER BY Label;

        SELECT Seccion AS Label, COUNT(DISTINCT EstudianteId) AS Total
        FROM @matriculasBase
        WHERE NULLIF(LTRIM(RTRIM(Seccion)), '') IS NOT NULL
          AND LTRIM(RTRIM(Seccion)) <> N'Sin seccion'
        GROUP BY Seccion
        ORDER BY Label;

        SELECT
          COALESCE(NULLIF(LTRIM(RTRIM(e.Sexo)), ''), N'Sin especificar') AS Label,
          COUNT(1) AS Total
        FROM dbo.Estudiante e
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(e.Sexo)), ''), N'Sin especificar')
        ORDER BY Total DESC, Label;

        SELECT TOP 12 Especialidad AS Label, COUNT(DISTINCT EstudianteId) AS Total
        FROM @matriculasBase
        WHERE NULLIF(LTRIM(RTRIM(Especialidad)), '') IS NOT NULL
        GROUP BY Especialidad
        ORDER BY Total DESC, Label;

        SELECT TOP 12
          COALESCE(NULLIF(LTRIM(RTRIM(e.Nacionalidad)), ''), N'Sin especificar') AS Label,
          COUNT(1) AS Total
        FROM dbo.Estudiante e
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(e.Nacionalidad)), ''), N'Sin especificar')
        ORDER BY Total DESC, Label;

        SELECT TOP 12
          COALESCE(NULLIF(LTRIM(RTRIM(te.Descripcion)), ''), N'Sin tipo') AS Label,
          COUNT(1) AS Total
        FROM dbo.Estudiante e
        LEFT JOIN dbo.TipoEstudiante te
          ON te.TipoEstudianteId = e.TipoEstudianteId
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(te.Descripcion)), ''), N'Sin tipo')
        ORDER BY Total DESC, Label;

        SELECT
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(e.Adecuacion)), '') IS NOT NULL THEN 1 ELSE 0 END) AS ConAdecuacion,
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(e.Discapacidad)), '') IS NOT NULL THEN 1 ELSE 0 END) AS ConDiscapacidad,
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(e.Enfermedad)), '') IS NOT NULL THEN 1 ELSE 0 END) AS ConCondicionMedica,
          SUM(CASE WHEN e.AutorizaWhatsAppEncargado = 1 THEN 1 ELSE 0 END) AS WhatsAppAutorizado,
          SUM(CASE WHEN e.RutaTransporteId IS NOT NULL OR NULLIF(LTRIM(RTRIM(e.RutaTransporteHabitual)), '') IS NOT NULL THEN 1 ELSE 0 END) AS ConRutaTransporte
        FROM dbo.Estudiante e
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1;
      `);
    dashboardInFlight.set(cacheKey, queryPromise.then((result) => {
      const totales = result.recordsets[0]?.[0] || {};
      const otros = result.recordsets[7]?.[0] || {};
      return {
        totalActivos: Number(totales.TotalActivos || 0),
        totalInactivos: Number(totales.TotalInactivos || 0),
        totalGeneral: Number(totales.TotalGeneral || 0),
        totalMatriculados: Number(totales.TotalMatriculados || 0),
        porGrupo: result.recordsets[1] || [],
        porSeccion: result.recordsets[2] || [],
        porGenero: result.recordsets[3] || [],
        porEspecialidad: result.recordsets[4] || [],
        porNacionalidad: result.recordsets[5] || [],
        porTipo: result.recordsets[6] || [],
        otros: [
          { Label: "Con adecuacion", Total: Number(otros.ConAdecuacion || 0) },
          { Label: "Con discapacidad", Total: Number(otros.ConDiscapacidad || 0) },
          { Label: "Con condicion medica", Total: Number(otros.ConCondicionMedica || 0) },
          { Label: "WhatsApp autorizado", Total: Number(otros.WhatsAppAutorizado || 0) },
          { Label: "Con ruta de transporte", Total: Number(otros.ConRutaTransporte || 0) }
        ]
      };
    }));
    let payload: any;
    try {
      payload = await dashboardInFlight.get(cacheKey);
    } finally {
      dashboardInFlight.delete(cacheKey);
    }
    dashboardCache.set(cacheKey, { at: Date.now(), data: payload });
    return ok(res, payload);
  } catch (error) {
    console.error("Error cargando dashboard de estudiantes:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al cargar dashboard de estudiantes"
    });
  }
});

router.get(
  "/plantilla-excel",
  requireRoles(...STUDENT_IMPORT_ROLES),
  async (req, res) => {
    try {
      const institucionId = Number(req.auth?.institucionId || 0);
      const pool = await getPool();
      const [
        tiposEstudianteResult,
        tiposAdecuacionResult,
        rutasResult
      ] = institucionId
        ? await Promise.all([
            pool.request()
              .input("institucionId", sql.Int, institucionId)
              .query(`
                SELECT TipoEstudianteId, Descripcion
                FROM dbo.TipoEstudiante
                WHERE InstitucionId = @institucionId
                  AND Activo = 1
                ORDER BY Descripcion
              `),
            pool.request()
              .input("institucionId", sql.Int, institucionId)
              .query(`
                SELECT TipoAdecuacionId, Descripcion
                FROM dbo.TipoAdecuacion
                WHERE InstitucionId = @institucionId
                  AND Activo = 1
                  AND UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) NOT IN (N'REGULAR', N'SIN ADECUACION', N'SIN ADECUACIÓN', N'SELECCIONE', N'NO')
                ORDER BY Descripcion
              `),
            pool.request()
              .input("institucionId", sql.Int, institucionId)
              .query(`
                SELECT RutaTransporteId, Descripcion
                FROM dbo.RutaTransporte
                WHERE InstitucionId = @institucionId
                  AND Activo = 1
                ORDER BY Descripcion
              `)
          ])
        : [
            { recordset: [] as Array<{ TipoEstudianteId: number; Descripcion: string }> },
            { recordset: [] as Array<{ TipoAdecuacionId: number; Descripcion: string }> },
            { recordset: [] as Array<{ RutaTransporteId: number; Descripcion: string }> }
          ];

      const adecuacionEjemplo =
        String(tiposAdecuacionResult.recordset?.[0]?.Descripcion || "").trim() ||
        "Adecuación curricular no significativa";

      const instrucciones = [
        { Campo: "identificación_estudiante", Obligatorio: "Si", Descripcion: "Identificación del estudiante" },
        { Campo: "Tipo_ identificacion_estudiante", Obligatorio: "No", Descripcion: "Ejemplo: Cédula nacional, DIMEX o Pasaporte" },
        { Campo: "Apellido1", Obligatorio: "Si", Descripcion: "Primer apellido" },
        { Campo: "Apellido2", Obligatorio: "Si", Descripcion: "Segundo apellido" },
        { Campo: "Nombre", Obligatorio: "Si", Descripcion: "Nombre del estudiante" },
        { Campo: "Fecha_Nacimiento", Obligatorio: "Si", Descripcion: "Formato recomendado YYYY-MM-DD" },
        { Campo: "Sexo", Obligatorio: "No", Descripcion: "Masculino, Femenino u Otro" },
        { Campo: "Nacionalidad", Obligatorio: "No", Descripcion: "Nacionalidad" },
        { Campo: "Repitente", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Refugiado", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Discapacidad", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Tipo_Discapacidad", Obligatorio: "Condicional", Descripcion: "Se usa solo cuando Discapacidad = Si" },
        { Campo: "Adecuacion", Obligatorio: "No", Descripcion: "Si o No. Marque Si solo cuando el estudiante tenga adecuación" },
        { Campo: "Tipo_Adecuacion", Obligatorio: "Condicional", Descripcion: "Seleccione la adecuación cuando Adecuacion sea Si" },
        { Campo: "Tipo_Enfermedad", Obligatorio: "No", Descripcion: "Detalle de enfermedad o condición médica" },
        { Campo: "Especialidad", Obligatorio: "No", Descripcion: "Dato de matrícula. Se conserva en la plantilla para procesos posteriores." },
        { Campo: "correo_estuduante", Obligatorio: "No", Descripcion: "Referencia. El sistema genera el correo institucional automáticamente con identificación + dominio del colegio." },
        { Campo: "Ruta_ transporte", Obligatorio: "No", Descripcion: "Descripción o código de la ruta configurada en Académico" },
        { Campo: "Titulo", Obligatorio: "No", Descripcion: "Tratamiento del encargado principal. Ejemplo: Sr., Sra." },
        { Campo: "Celular_estudiante", Obligatorio: "No", Descripcion: "Teléfono del estudiante. Si no inicia con + se antepone +506 automáticamente" },
        { Campo: "Nivel_funcionamiento", Obligatorio: "No", Descripcion: "Nivel de funcionamiento del estudiante" },
        { Campo: "Observaciones_nivel Funcionamieto", Obligatorio: "No", Descripcion: "Observaciones del nivel de funcionamiento y seguimiento de la adecuación" },
        { Campo: "Encargado_1", Obligatorio: "No", Descripcion: "Nombre completo del encargado principal" },
        { Campo: "cedula1", Obligatorio: "No", Descripcion: "Identificación del encargado 1" },
        { Campo: "Celular1", Obligatorio: "No", Descripcion: "Teléfono del encargado 1. Si no inicia con + se antepone +506 automáticamente" },
        { Campo: "Parentesco1", Obligatorio: "No", Descripcion: "Ejemplo: Madre, Padre, Tía, Tutor" },
        { Campo: "Vive_con_estudiante1", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Direccion_exacta1", Obligatorio: "No", Descripcion: "Dirección exacta del encargado 1" },
        { Campo: "Acepta_WA1", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Acepta_Correo1", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Encargado2", Obligatorio: "No", Descripcion: "Nombre completo del segundo encargado" },
        { Campo: "Cedula2", Obligatorio: "No", Descripcion: "Identificación del encargado 2" },
        { Campo: "Celular2", Obligatorio: "No", Descripcion: "Teléfono del encargado 2. Si no inicia con + se antepone +506 automáticamente" },
        { Campo: "Parentezco2", Obligatorio: "No", Descripcion: "Ejemplo: Madre, Padre, Tía, Tutor" },
        { Campo: "Vive_con_estudiante2", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Otro_Cel", Obligatorio: "No", Descripcion: "Teléfono adicional del encargado 2. Si no inicia con + se antepone +506 automáticamente" },
        { Campo: "Dirección2", Obligatorio: "No", Descripcion: "Dirección exacta del encargado 2" },
        { Campo: "Acepta_WA2", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "Acepta_Correo2", Obligatorio: "No", Descripcion: "Si o No" },
        { Campo: "MOVIMIENTO", Obligatorio: "No", Descripcion: "Ejemplo: Nueva matrícula, Traslado, Reingreso" },
        { Campo: "Tipo_estudiante", Obligatorio: "No", Descripcion: "Descripción del tipo de estudiante configurado en Académico" },
        { Campo: "Foto_Estudiante", Obligatorio: "No", Descripcion: "URL de la foto si ya existe en línea" }
      ];

      const ejemplo = [
        {
          identificación_estudiante: "123456789",
          "Tipo_ identificacion_estudiante": "Cédula nacional",
          Apellido1: "Pérez",
          Apellido2: "Rojas",
          Nombre: "Ana",
          Fecha_Nacimiento: "2012-03-15",
          Sexo: "Femenino",
          Nacionalidad: "Costarricense",
          Repitente: "No",
          Refugiado: "No",
          Discapacidad: "No",
          Tipo_Discapacidad: "",
          Adecuacion: "Si",
          Tipo_Adecuacion: adecuacionEjemplo,
          Tipo_Enfermedad: "",
          Especialidad: "Sin especialidad",
          correo_estuduante: "",
          "Ruta_ transporte": rutasResult.recordset?.[0]?.Descripcion || "",
          Titulo: "Sra.",
          Celular_estudiante: "88888888",
          Nivel_funcionamiento: "Intermedio",
          "Observaciones_nivel Funcionamieto": "Requiere seguimiento pedagógico y apoyos específicos en clase.",
          Encargado_1: "Laura Pérez Solano",
          cedula1: "111111111",
          Celular1: "70000000",
          Parentesco1: "Madre",
          Vive_con_estudiante1: "Si",
          Direccion_exacta1: "San Vito",
          Acepta_WA1: "Si",
          Acepta_Correo1: "Si",
          Encargado2: "Carlos Rojas Salazar",
          Cedula2: "222222222",
          Celular2: "71111111",
          Parentezco2: "Padre",
          Vive_con_estudiante2: "No",
          Otro_Cel: "72222222",
          "Dirección2": "Sabalito",
          Acepta_WA2: "No",
          Acepta_Correo2: "Si",
          MOVIMIENTO: "NUEVA MATRÍCULA 2026",
          Tipo_estudiante: tiposEstudianteResult.recordset?.[0]?.Descripcion || "",
          Foto_Estudiante: ""
        }
      ];
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Profe360";
      workbook.created = new Date();

      const colores = {
        encabezado: "0F172A",
        encabezadoTexto: "FFFFFF",
        requerido: "FEF3C7",
        opcional: "EFF6FF",
        catalogo: "DCFCE7",
        borde: "CBD5E1"
      };

      const sheetInstrucciones = workbook.addWorksheet("Instrucciones", {
        views: [{ state: "frozen", ySplit: 1 }]
      });
      sheetInstrucciones.columns = [
        { header: "Campo", key: "Campo", width: 28 },
        { header: "Obligatorio", key: "Obligatorio", width: 14 },
        { header: "Descripción", key: "Descripcion", width: 80 }
      ];
      instrucciones.forEach((item) => sheetInstrucciones.addRow(item));

      const sheetCatalogos = workbook.addWorksheet("Catalogos", {
        views: [{ state: "frozen", ySplit: 1 }]
      });
      sheetCatalogos.columns = [
        { header: "TipoEstudianteId", key: "tipoEstudianteId", width: 18 },
        { header: "Tipo de estudiante", key: "tipoEstudianteDescripcion", width: 34 },
        { header: "TipoAdecuacionId", key: "tipoAdecuacionId", width: 18 },
        { header: "Tipo de adecuación", key: "tipoAdecuacionDescripcion", width: 38 },
        { header: "RutaTransporteId", key: "rutaTransporteId", width: 18 },
        { header: "Ruta de transporte", key: "rutaTransporteDescripcion", width: 38 }
      ];
      const maxCatalogRows = Math.max(
        tiposEstudianteResult.recordset.length,
        tiposAdecuacionResult.recordset.length,
        rutasResult.recordset.length,
        1
      );
      for (let index = 0; index < maxCatalogRows; index++) {
        const tipo = tiposEstudianteResult.recordset[index];
        const adecuacion = tiposAdecuacionResult.recordset[index];
        const ruta = rutasResult.recordset[index];
        sheetCatalogos.addRow({
          tipoEstudianteId: tipo?.TipoEstudianteId || "",
          tipoEstudianteDescripcion: tipo?.Descripcion || "",
          tipoAdecuacionId: adecuacion?.TipoAdecuacionId || "",
          tipoAdecuacionDescripcion: adecuacion?.Descripcion || "",
          rutaTransporteId: ruta?.RutaTransporteId || "",
          rutaTransporteDescripcion: ruta?.Descripcion || ""
        });
      }

      const sheetEstudiantes = workbook.addWorksheet("Estudiantes", {
        views: [{ state: "frozen", ySplit: 1 }]
      });
      const headers = Object.keys(ejemplo[0]);
      sheetEstudiantes.columns = headers.map((header) => ({
        header,
        key: header,
        width: header.length > 18 ? 24 : 18
      }));
      ejemplo.forEach((item) => sheetEstudiantes.addRow(item));
      sheetEstudiantes.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length }
      };

      const styleHeaderRow = (sheet: ExcelJS.Worksheet, fillColor: string) => {
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: colores.encabezadoTexto } };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fillColor }
        };
        headerRow.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: colores.borde } },
            left: { style: "thin", color: { argb: colores.borde } },
            bottom: { style: "thin", color: { argb: colores.borde } },
            right: { style: "thin", color: { argb: colores.borde } }
          };
        });
      };

      styleHeaderRow(sheetInstrucciones, colores.encabezado);
      styleHeaderRow(sheetCatalogos, "166534");
      styleHeaderRow(sheetEstudiantes, colores.encabezado);

      const requiredFields = new Set([
        "identificación_estudiante",
        "Apellido1",
        "Apellido2",
        "Nombre",
        "Fecha_Nacimiento"
      ]);

      headers.forEach((header, index) => {
        const column = sheetEstudiantes.getColumn(index + 1);
        const fillColor = requiredFields.has(header) ? colores.requerido : colores.opcional;
        for (let rowIndex = 2; rowIndex <= 300; rowIndex++) {
          const cell = sheetEstudiantes.getCell(rowIndex, index + 1);
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fillColor }
          };
          cell.border = {
            top: { style: "thin", color: { argb: colores.borde } },
            left: { style: "thin", color: { argb: colores.borde } },
            bottom: { style: "thin", color: { argb: colores.borde } },
            right: { style: "thin", color: { argb: colores.borde } }
          };
        }
      });

      sheetEstudiantes.getColumn("Fecha_Nacimiento").numFmt = "yyyy-mm-dd";

      const addListValidation = (columnKey: string, formulae: string[], promptTitle: string, prompt: string) => {
        const colNumber = headers.findIndex((item) => item === columnKey) + 1;
        if (!colNumber) return;
        for (let rowIndex = 2; rowIndex <= 300; rowIndex++) {
          sheetEstudiantes.getCell(rowIndex, colNumber).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae,
            showErrorMessage: true,
            errorStyle: "error",
            errorTitle: "Valor no permitido",
            error: "Seleccione uno de los valores permitidos en la lista.",
            showInputMessage: true,
            promptTitle,
            prompt
          };
        }
      };

      addListValidation(
        "Sexo",
        ['"Masculino,Femenino,Otro"'],
        "Sexo",
        "Seleccione Masculino, Femenino u Otro."
      );
      addListValidation(
        "Repitente",
        ['"Si,No"'],
        "Repitente",
        "Seleccione Si o No."
      );
      addListValidation("Refugiado", ['"Si,No"'], "Refugiado", "Seleccione Si o No.");
      addListValidation("Discapacidad", ['"Si,No"'], "Discapacidad", "Seleccione Si o No.");
      addListValidation("Adecuacion", ['"Si,No"'], "Adecuación", "Seleccione Si o No.");
      addListValidation("Vive_con_estudiante1", ['"Si,No"'], "Vive con estudiante", "Seleccione Si o No.");
      addListValidation("Vive_con_estudiante2", ['"Si,No"'], "Vive con estudiante", "Seleccione Si o No.");
      addListValidation("Acepta_WA1", ['"Si,No"'], "Acepta WhatsApp", "Seleccione Si o No.");
      addListValidation("Acepta_WA2", ['"Si,No"'], "Acepta WhatsApp", "Seleccione Si o No.");
      addListValidation("Acepta_Correo1", ['"Si,No"'], "Acepta correo", "Seleccione Si o No.");
      addListValidation("Acepta_Correo2", ['"Si,No"'], "Acepta correo", "Seleccione Si o No.");

      const tiposEstudianteEnd = Math.max(2, tiposEstudianteResult.recordset.length + 1);
      const tiposAdecuacionEnd = Math.max(2, tiposAdecuacionResult.recordset.length + 1);
      const rutasEnd = Math.max(2, rutasResult.recordset.length + 1);

      addListValidation(
        "Tipo_estudiante",
        [`Catalogos!$B$2:$B$${tiposEstudianteEnd}`],
        "Tipo de estudiante",
        "Use una descripción existente de la hoja Catalogos."
      );
      addListValidation(
        "Tipo_Adecuacion",
        [`Catalogos!$D$2:$D$${tiposAdecuacionEnd}`],
        "Tipo de adecuación",
        "Seleccione una adecuación activa desde Catalogos cuando Adecuacion sea Si."
      );
      addListValidation(
        "Ruta_ transporte",
        [`Catalogos!$F$2:$F$${rutasEnd}`],
        "Ruta de transporte",
        "Use una descripción existente de la hoja Catalogos."
      );

      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="plantilla_estudiantes.xlsx"'
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      return res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error) {
      console.error("Error generando plantilla de estudiantes:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo generar la plantilla"
      });
    }
  }
);

router.post(
  "/importar-excel/iniciar",
  requireRoles(...STUDENT_IMPORT_ROLES),
  upload.single("archivo"),
  async (req, res) => {
    try {
      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      const rows = parseImportRowsFromFile(req.file);
      const job = createImportJob({
        institucionId: req.auth.institucionId,
        usuarioId: req.auth.usuarioId || req.auth.userId || null,
        totalRegistros: rows.length
      });

      setImmediate(() => {
        processStudentImportRows({
          rows,
          institucionId: req.auth!.institucionId!,
          job
        }).catch((error) => {
          console.error("Error procesando importación de estudiantes:", error);
          job.status = "ERROR";
          job.error = error?.message || "No se pudo procesar el archivo Excel";
          job.updatedAt = Date.now();
        });
      });

      return ok(res, serializeImportJob(job), "Importación iniciada");
    } catch (error: any) {
      if (error?.status === 400) return badRequest(res, error.message);
      console.error("Error iniciando importación de estudiantes:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo iniciar la importación"
      });
    }
  }
);

router.get(
  "/importar-excel/progreso/:jobId",
  requireRoles(...STUDENT_IMPORT_ROLES),
  async (req, res) => {
    try {
      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      cleanupImportJobs();
      const job = importJobs.get(String(req.params.jobId || ""));

      if (!job || job.institucionId !== req.auth.institucionId) {
        return res.status(404).json({
          ok: false,
          message: "No se encontró la importación solicitada"
        });
      }

      return ok(res, serializeImportJob(job));
    } catch (error) {
      console.error("Error consultando progreso de importación:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo consultar el progreso de la importación"
      });
    }
  }
);

router.get(
  "/importar-excel/resumen/:jobId/excel",
  requireRoles(...STUDENT_IMPORT_ROLES),
  async (req, res) => {
    try {
      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      cleanupImportJobs();
      const job = importJobs.get(String(req.params.jobId || ""));

      if (!job || job.institucionId !== req.auth.institucionId) {
        return res.status(404).json({
          ok: false,
          message: "No se encontró la importación solicitada"
        });
      }

      const wb = XLSX.utils.book_new();
      const resumen = [
        { Concepto: "Total registros", Valor: job.totalRegistros },
        { Concepto: "Procesados", Valor: job.procesados },
        { Concepto: "Creados", Valor: job.totalCreados },
        { Concepto: "Actualizados", Valor: job.totalActualizados },
        { Concepto: "Reactivados y actualizados", Valor: job.totalReactivados },
        { Concepto: "Omitidos", Valor: job.totalOmitidos },
        { Concepto: "Errores", Valor: job.totalError },
        { Concepto: "Estado", Valor: job.status }
      ];
      const detalle = job.resultados.map((item) => ({
        Fila: item.fila,
        Identificacion: item.identificacion,
        Estado: item.estado,
        Motivo: item.motivo
      }));

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="resumen_importacion_estudiantes_${job.id}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buffer);
    } catch (error) {
      console.error("Error exportando resumen de importación:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo exportar el resumen de importación"
      });
    }
  }
);

router.post(
  "/importar-excel",
  requireRoles(...STUDENT_IMPORT_ROLES),
  upload.single("archivo"),
  async (req, res) => {
    try {
      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      if (!req.file?.buffer) {
        return badRequest(res, "Debés adjuntar un archivo Excel");
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames.includes("Estudiantes")
        ? "Estudiantes"
        : workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      const filteredRows = rows.filter((row) => !shouldSkipStudentImportRow(row));

      if (!filteredRows.length) {
        return badRequest(res, "El archivo no contiene registros para importar");
      }

      const pool = await getPool();

      const resultados: Array<{
        fila: number;
        identificacion: string;
        estado: "CREADO" | "ACTUALIZADO" | "REACTIVADO" | "ERROR";
        motivo: string;
      }> = [];

      let totalOk = 0;
      let totalError = 0;
      let totalCreados = 0;
      let totalActualizados = 0;
      let totalReactivados = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (shouldSkipStudentImportRow(row)) {
          continue;
        }
        const fila = i + 2;

        const built = buildImportPayloadFromRow(row);

        if (built.error || !built.payload) {
          resultados.push({
            fila,
            identificacion: built.identificacion || "",
            estado: "ERROR",
            motivo: built.error || "No se pudo preparar el registro"
          });
          totalError++;
          continue;
        }

        const transaction = new sql.Transaction(pool);

        try {
          await transaction.begin();
          const importResult = await importStudentWithTransaction({
            transaction,
            institucionId: req.auth.institucionId,
            payload: built.payload
          });
          await transaction.commit();

          resultados.push({
            fila,
            identificacion: built.identificacion || "",
            estado: importResult.estado,
            motivo: importResult.motivo
          });
          totalOk++;
          if (importResult.estado === "CREADO") {
            totalCreados++;
          } else if (importResult.estado === "ACTUALIZADO") {
            totalActualizados++;
          } else if (importResult.estado === "REACTIVADO") {
            totalReactivados++;
          }
        } catch (error: any) {
          try {
            await transaction.rollback();
          } catch {}

          resultados.push({
            fila,
            identificacion: built.identificacion || "",
            estado: "ERROR",
            motivo: error?.message || "No se pudo cargar el registro"
          });
          totalError++;
        }
      }

      return ok(res, {
        totalRegistros: rows.length,
        totalOk,
        totalError,
        totalCreados,
        totalActualizados,
        totalReactivados,
        resultados
      }, "Importación procesada");
    } catch (error) {
      console.error("Error importando estudiantes desde Excel:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo procesar el archivo Excel"
      });
    }
  }
);

router.post(
  "/:id/suspension",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      const estudianteId = Number(req.params.id);
      const institucionId = Number(req.auth?.institucionId || 0);
      const motivo = normalizeSuspensionMotivo(req.body?.motivo);
      const fechaInicio = String(req.body?.fechaInicio || "").slice(0, 10);
      const fechaFin = String(req.body?.fechaFin || "").slice(0, 10);
      const observacion = String(req.body?.observacion || "").trim().slice(0, 500) || null;

      if (!institucionId) return badRequest(res, "El usuario no tiene institución asignada");
      if (!estudianteId) return badRequest(res, "Id inválido");
      if (!MOTIVOS_SUSPENSION_ESTUDIANTE.has(motivo)) return badRequest(res, "Motivo de suspensión inválido");
      if (!fechaInicio || !fechaFin) return badRequest(res, "Indicá fecha de inicio y fecha fin de suspensión");
      if (new Date(fechaInicio) > new Date(fechaFin)) return badRequest(res, "La fecha fin no puede ser menor que la fecha inicio");

      const estudianteResult = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteId)
        .query(`
          SELECT TOP 1 EstudianteId
          FROM dbo.Estudiante
          WHERE InstitucionId = @institucionId
            AND EstudianteId = @estudianteId
        `);

      if (!estudianteResult.recordset.length) {
        return res.status(404).json({ ok: false, message: "Estudiante no encontrado" });
      }

      await transaction.begin();

      await new sql.Request(transaction)
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("usuarioId", sql.Int, req.auth?.userId || null)
        .query(`
          UPDATE dbo.EstudianteSuspension
          SET Activo = 0,
              UsuarioLevantaId = @usuarioId,
              FechaLevantamiento = SYSDATETIME(),
              UpdatedAt = SYSDATETIME()
          WHERE InstitucionId = @institucionId
            AND EstudianteId = @estudianteId
            AND Activo = 1
        `);

      const result = await new sql.Request(transaction)
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("motivo", sql.NVarChar(50), motivo)
        .input("fechaInicio", sql.Date, fechaInicio)
        .input("fechaFin", sql.Date, fechaFin)
        .input("observacion", sql.NVarChar(500), observacion)
        .input("usuarioId", sql.Int, req.auth?.userId || null)
        .query(`
          INSERT INTO dbo.EstudianteSuspension
            (InstitucionId, EstudianteId, Motivo, FechaInicio, FechaFin, Observacion, Activo, UsuarioCreaId, CreatedAt)
          OUTPUT INSERTED.*
          VALUES
            (@institucionId, @estudianteId, @motivo, @fechaInicio, @fechaFin, @observacion, 1, @usuarioId, SYSDATETIME())
        `);

      await transaction.commit();

      return created(res, result.recordset[0], "Suspensión registrada correctamente");
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      console.error("Error registrando suspensión de estudiante:", error);
      return res.status(500).json({ ok: false, message: "No se pudo registrar la suspensión" });
    }
  }
);

router.put(
  "/:id/suspension/:suspensionId",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    try {
      const estudianteId = Number(req.params.id);
      const suspensionId = Number(req.params.suspensionId);
      const institucionId = Number(req.auth?.institucionId || 0);
      const motivo = normalizeSuspensionMotivo(req.body?.motivo);
      const fechaInicio = String(req.body?.fechaInicio || "").slice(0, 10);
      const fechaFin = String(req.body?.fechaFin || "").slice(0, 10);
      const observacion = String(req.body?.observacion || "").trim().slice(0, 500) || null;

      if (!institucionId) return badRequest(res, "El usuario no tiene institución asignada");
      if (!estudianteId || !suspensionId) return badRequest(res, "Id inválido");
      if (!MOTIVOS_SUSPENSION_ESTUDIANTE.has(motivo)) return badRequest(res, "Motivo de suspensión inválido");
      if (!fechaInicio || !fechaFin) return badRequest(res, "Indicá fecha de inicio y fecha fin de suspensión");
      if (new Date(fechaInicio) > new Date(fechaFin)) return badRequest(res, "La fecha fin no puede ser menor que la fecha inicio");

      const pool = await getPool();
      const result = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("suspensionId", sql.Int, suspensionId)
        .input("motivo", sql.NVarChar(50), motivo)
        .input("fechaInicio", sql.Date, fechaInicio)
        .input("fechaFin", sql.Date, fechaFin)
        .input("observacion", sql.NVarChar(500), observacion)
        .input("usuarioId", sql.Int, req.auth?.userId || null)
        .query(`
          UPDATE dbo.EstudianteSuspension
          SET Motivo = @motivo,
              FechaInicio = @fechaInicio,
              FechaFin = @fechaFin,
              Observacion = @observacion,
              UsuarioActualizaId = @usuarioId,
              UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.*
          WHERE EstudianteSuspensionId = @suspensionId
            AND InstitucionId = @institucionId
            AND EstudianteId = @estudianteId
            AND Activo = 1
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ ok: false, message: "Suspensión no encontrada" });
      }

      return ok(res, result.recordset[0], "Suspensión actualizada correctamente");
    } catch (error) {
      console.error("Error actualizando suspensión de estudiante:", error);
      return res.status(500).json({ ok: false, message: "No se pudo actualizar la suspensión" });
    }
  }
);

router.delete(
  "/:id/suspension/:suspensionId",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    try {
      const estudianteId = Number(req.params.id);
      const suspensionId = Number(req.params.suspensionId);
      const institucionId = Number(req.auth?.institucionId || 0);

      if (!institucionId) return badRequest(res, "El usuario no tiene institución asignada");
      if (!estudianteId || !suspensionId) return badRequest(res, "Id inválido");

      const pool = await getPool();
      const result = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("suspensionId", sql.Int, suspensionId)
        .input("usuarioId", sql.Int, req.auth?.userId || null)
        .query(`
          UPDATE dbo.EstudianteSuspension
          SET Activo = 0,
              UsuarioLevantaId = @usuarioId,
              FechaLevantamiento = SYSDATETIME(),
              UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.*
          WHERE EstudianteSuspensionId = @suspensionId
            AND InstitucionId = @institucionId
            AND EstudianteId = @estudianteId
            AND Activo = 1
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ ok: false, message: "Suspensión no encontrada" });
      }

      return ok(res, result.recordset[0], "Suspensión levantada correctamente");
    } catch (error) {
      console.error("Error levantando suspensión de estudiante:", error);
      return res.status(500).json({ ok: false, message: "No se pudo levantar la suspensión" });
    }
  }
);

router.get("/:id/boletas-conducta", async (req, res) => {
  try {
    const estudianteId = Number(req.params.id);
    const institucionId = Number(req.auth?.institucionId || 0);

    if (!Number.isFinite(estudianteId) || estudianteId <= 0) return badRequest(res, "Id de estudiante inválido");
    if (!institucionId) return badRequest(res, "El usuario no tiene institución asignada");

    const pool = await getPool();
    const result = await pool.request()
      .input("estudianteId", sql.Int, estudianteId)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          b.BoletaConductaId,
          b.CodigoBoleta,
          b.Consecutivo,
          b.Fecha,
          CONVERT(varchar(10), b.Fecha, 103) AS FechaTexto,
          b.Seccion,
          b.DetalleHechos,
          b.LugarAcontecimiento,
          b.NombreFuncionario,
          ISNULL(envio.CorreoEnviado, 0) AS CorreoEnviado,
          ISNULL(envio.WhatsAppEnviado, 0) AS WhatsAppEnviado
        FROM dbo.BoletaConducta b
        OUTER APPLY (
          SELECT TOP 1
            CorreoEnviado = CASE
              WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'CorreoEnviado') IS NOT NULL THEN ISNULL(be.CorreoEnviado, 0)
              WHEN ISNULL(be.Enviado, 0) = 1 THEN 1
              ELSE 0
            END,
            WhatsAppEnviado = CASE
              WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'WhatsAppEnviado') IS NOT NULL THEN ISNULL(be.WhatsAppEnviado, 0)
              ELSE 0
            END
          FROM dbo.BoletaConductaEnvio be
          WHERE be.BoletaConductaId = b.BoletaConductaId
          ORDER BY be.CreatedAt DESC, be.BoletaConductaEnvioId DESC
        ) envio
        WHERE b.EstudianteId = @estudianteId
          AND b.InstitucionId = @institucionId
        ORDER BY b.Fecha DESC, b.Consecutivo DESC, b.BoletaConductaId DESC
      `);

    return ok(res, result.recordset.map((item: any) => ({
      boletaConductaId: Number(item.BoletaConductaId || 0),
      numeroBoleta: String(item.CodigoBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(3, "0"),
      fecha: String(item.FechaTexto || ""),
      seccion: String(item.Seccion || ""),
      detalleHechos: String(item.DetalleHechos || ""),
      lugarAcontecimiento: String(item.LugarAcontecimiento || ""),
      nombreFuncionario: String(item.NombreFuncionario || ""),
      envioCorreo: Boolean(item.CorreoEnviado),
      envioWhatsApp: Boolean(item.WhatsAppEnviado)
    })));
  } catch (error) {
    console.error("Error consultando boletas del estudiante:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las boletas del estudiante" });
  }
});

router.get("/:id/detalle", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    if (!req.auth?.institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();

    const estudianteResult = await pool
      .request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, req.auth.institucionId)
      .query(`
        SELECT TOP 1
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.FechaNacimiento,
          e.Sexo,
          e.Correo,
          e.Telefono,
          e.TipoIdentificacion,
          e.FotoUrl,
          e.CodigoCarnet,
          e.QrContenido,
          e.Nacionalidad,
          e.TipoEstudianteId,
          te.Descripcion AS TipoEstudianteDescripcion,
          e.RutaTransporteId,
          rt.Descripcion AS RutaTransporteDescripcion,
          e.AutorizaWhatsAppEncargado,
          e.Repitente,
          e.Refugiado,
          e.TieneAdecuacion,
          e.Adecuacion,
          e.NivelFuncionamiento,
          e.Discapacidad,
          e.TipoDiscapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.Observaciones,
          e.ObservacionMedica,
          e.Activo,
          ${suspensionVigenteSelectSql}
        FROM dbo.Estudiante e
        LEFT JOIN dbo.TipoEstudiante te
          ON te.TipoEstudianteId = e.TipoEstudianteId
        LEFT JOIN dbo.RutaTransporte rt
          ON rt.RutaTransporteId = e.RutaTransporteId
        ${getSuspensionVigenteApplySql("e")}
        WHERE e.EstudianteId = @id
          AND e.InstitucionId = @institucionId
      `);

    if (!estudianteResult.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Estudiante no encontrado"
      });
    }

    const encargadosResult = await pool
      .request()
      .input("estudianteId", sql.Int, id)
      .query(`
        SELECT
          ee.EstudianteEncargadoId,
          ee.Parentesco,
          ee.EsPrincipal,
          ee.AceptaWhatsApp,
          ee.AceptaCorreo,
          ee.RecibeNotificaciones,
          ee.ViveConEstudiante,
          ee.VigenciaDesde,
          ee.VigenciaHasta,
          ee.Activo,
          e.EncargadoId,
          e.TipoEncargado,
          e.Identificacion,
          e.Titulo,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Correo,
          e.Telefono,
          e.TelefonoSecundario,
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

    return ok(res, {
      estudiante: estudianteResult.recordset[0],
      encargados: encargadosResult.recordset
    });
  } catch (error) {
    console.error("Error al cargar detalle del estudiante:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al cargar el detalle del estudiante"
    });
  }
});

router.get("/:id/carnet", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    if (!req.auth?.institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, req.auth.institucionId)
      .query(`
        SELECT TOP 1
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.FechaNacimiento,
          e.Sexo,
          e.Correo,
          e.Telefono,
          e.TipoIdentificacion,
          e.FotoUrl,
          e.CodigoCarnet,
          e.QrContenido,
          e.Nacionalidad,
          e.RutaTransporteId,
          e.AutorizaWhatsAppEncargado,
          e.Repitente,
          e.Refugiado,
          e.TieneAdecuacion,
          e.Adecuacion,
          e.NivelFuncionamiento,
          e.Discapacidad,
          e.TipoDiscapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.Observaciones,
          e.ObservacionMedica,
          e.Activo,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.LogoUrl AS InstitucionLogoUrl,
          i.MembreteUrl AS InstitucionMembreteUrl,
          i.NombreOficialBoleta AS InstitucionNombreOficialBoleta,
          i.RegionalEducativa,
          i.CircuitoEducativo,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.NivelAcademico,
          g.Especialidad AS GrupoEspecialidad
        FROM dbo.Estudiante e
        INNER JOIN dbo.Institucion i
          ON i.InstitucionId = e.InstitucionId
        LEFT JOIN dbo.Matricula m
          ON m.EstudianteId = e.EstudianteId
         AND m.Estado = N'Activa'
        LEFT JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        WHERE e.EstudianteId = @id
          AND e.InstitucionId = @institucionId
        ORDER BY m.MatriculaId DESC
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Estudiante no encontrado"
      });
    }

    const item = result.recordset[0];

    return ok(res, {
      ...item,
      GrupoSeccion: item.GrupoNombre || item.GrupoNivel || ""
    });
  } catch (error) {
    console.error("Error al cargar carnet del estudiante:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al cargar el carnet"
    });
  }
});

router.post(
  "/",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      const {
        identificacion,
        nombre,
        primerApellido,
        segundoApellido,
        fechaNacimiento,
        correo,
        telefono,
        tipoIdentificacion,
        tipoEstudianteId,
        rutaTransporteId,
        autorizaWhatsAppEncargado,
        repitente,
        refugiado,
        tieneAdecuacion,
        sexo,
        fotoUrl,
        nacionalidad,
        adecuacion,
        nivelFuncionamiento,
        discapacidad,
        tipoDiscapacidad,
        enfermedad,
        rutaTransporteHabitual,
        observaciones,
        observacionMedica,
        movimiento,
        encargados = []
      } = req.body;

      if (!identificacion || !nombre || !primerApellido || !segundoApellido || !fechaNacimiento) {
        return badRequest(res, "Completá los campos obligatorios: identificación, nombre, primer apellido, segundo apellido y fecha de nacimiento.");
      }

      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }
      const tieneAdecuacionNormalizada = !!tieneAdecuacion && isValidAdecuacionValue(adecuacion);
      const adecuacionNormalizada = tieneAdecuacionNormalizada ? toNullableString(adecuacion) : null;
      if (!!tieneAdecuacion && !adecuacionNormalizada) {
        return badRequest(res, "Seleccioná una adecuación válida. Regular, Sin adecuación y Seleccione no son adecuaciones.");
      }
      const telefonoNormalizado = normalizePhoneWithDefaultCountryCode(telefono);

      await transaction.begin();

      const estudiante = await createStudentWithTransaction({
        transaction,
        institucionId: req.auth.institucionId,
        payload: {
          identificacion,
          nombre,
          primerApellido,
          segundoApellido,
          fechaNacimiento,
          correo,
          telefono: telefonoNormalizado,
          tipoIdentificacion,
          tipoEstudianteId,
          rutaTransporteId,
          autorizaWhatsAppEncargado,
          repitente,
          refugiado,
          tieneAdecuacion: tieneAdecuacionNormalizada,
          sexo,
          fotoUrl,
          nacionalidad,
          adecuacion: adecuacionNormalizada,
          nivelFuncionamiento,
          discapacidad,
          tipoDiscapacidad,
          enfermedad,
          rutaTransporteHabitual,
          observaciones,
          observacionMedica,
          movimiento,
          encargados
        }
      });

      await transaction.commit();
      return created(res, estudiante);
    } catch (error: any) {
      console.error("Error al crear estudiante:", error);

      try {
        await transaction.rollback();
      } catch {}

      if (error?.code === "ESTUDIANTE_INACTIVO") {
        return res.status(409).json({
          ok: false,
          code: "ESTUDIANTE_INACTIVO",
          estudianteId: error.estudianteId,
          message: error.message
        });
      }

      if (
        error?.code === "ESTUDIANTE_DUPLICADO" ||
        error?.number === 2627 ||
        error?.number === 2601
      ) {
        return res.status(409).json({
          ok: false,
          code: "ESTUDIANTE_DUPLICADO",
          message:
            "Ya existe un estudiante con esa identificación en esta institución"
        });
      }

      return res.status(500).json({
        ok: false,
        message: "Error interno al crear estudiante"
      });
    }
  }
);

router.put(
  "/:id",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      const id = Number(req.params.id);
      const {
        identificacion,
        nombre,
        primerApellido,
        segundoApellido,
        fechaNacimiento,
        correo,
        telefono,
        tipoIdentificacion,
        tipoEstudianteId,
        rutaTransporteId,
        autorizaWhatsAppEncargado,
        repitente,
        refugiado,
        tieneAdecuacion,
        sexo,
        fotoUrl,
        nacionalidad,
        adecuacion,
        nivelFuncionamiento,
        discapacidad,
        tipoDiscapacidad,
        enfermedad,
        rutaTransporteHabitual,
        observaciones,
        observacionMedica,
        encargados
      } = req.body;

      if (!id) {
        return badRequest(res, "Id inválido");
      }

      if (!identificacion || !nombre || !primerApellido || !segundoApellido || !fechaNacimiento) {
        return badRequest(res, "Completá los campos obligatorios: identificación, nombre, primer apellido, segundo apellido y fecha de nacimiento.");
      }

      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      await transaction.begin();

      const existe = await transaction
        .request()
        .input("institucionId", sql.Int, req.auth.institucionId)
        .input("identificacion", sql.NVarChar, identificacion)
        .input("id", sql.Int, id)
        .query(`
          SELECT TOP 1 EstudianteId
          FROM dbo.Estudiante
          WHERE InstitucionId = @institucionId
            AND Identificacion = @identificacion
            AND EstudianteId <> @id
        `);

      if (existe.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({
          ok: false,
          code: "ESTUDIANTE_DUPLICADO",
          message:
            "Ya existe otro estudiante con esa identificación en esta institución"
        });
      }

      const codigoCarnet = buildCodigoCarnet(
        req.auth.institucionId,
        identificacion
      );
      const qrContenido = codigoCarnet;
      const dominioCorreo = await getCorreoEstudianteDominio(
        transaction,
        req.auth.institucionId
      );
      const correoGenerado = buildStudentEmail(identificacion, dominioCorreo);
      const userRoles = Array.isArray(req.auth?.roles) ? req.auth.roles : [];
      const canManualInstitutionalUserCorreo =
        userRoles.includes("SUPER_ADMIN") ||
        userRoles.includes("ADMIN_INSTITUCIONAL") ||
        userRoles.includes("ADMINISTRATIVO");
      const correoManualNormalizado = String(correo || "")
        .trim()
        .toLowerCase();
      const correoFinal =
        canManualInstitutionalUserCorreo && correoManualNormalizado
          ? correoManualNormalizado
          : correoGenerado;
      const telefonoNormalizado = normalizePhoneWithDefaultCountryCode(telefono);
      const tieneAdecuacionNormalizada = !!tieneAdecuacion && isValidAdecuacionValue(adecuacion);
      const adecuacionNormalizada = tieneAdecuacionNormalizada ? toNullableString(adecuacion) : null;
      if (!!tieneAdecuacion && !adecuacionNormalizada) {
        await transaction.rollback();
        return badRequest(res, "Seleccioná una adecuación válida. Regular, Sin adecuación y Seleccione no son adecuaciones.");
      }

      const currentStudent = await transaction
        .request()
        .input("id", sql.Int, id)
        .input("institucionId", sql.Int, req.auth.institucionId)
        .query(`SELECT TOP 1 Correo FROM dbo.Estudiante WHERE EstudianteId = @id AND InstitucionId = @institucionId`);

      const result = await transaction
        .request()
        .input("id", sql.Int, id)
        .input("institucionId", sql.Int, req.auth.institucionId)
        .input("identificacion", sql.NVarChar, identificacion)
        .input("nombre", sql.NVarChar, nombre)
        .input("primerApellido", sql.NVarChar, primerApellido || null)
        .input("segundoApellido", sql.NVarChar, segundoApellido || null)
        .input("fechaNacimiento", sql.Date, fechaNacimiento || null)
        .input("correo", sql.NVarChar, correoFinal)
        .input("telefono", sql.NVarChar, telefonoNormalizado || null)
        .input("tipoIdentificacion", sql.NVarChar, tipoIdentificacion || null)
        .input("tipoEstudianteId", sql.Int, tipoEstudianteId ? Number(tipoEstudianteId) : null)
        .input("rutaTransporteId", sql.Int, rutaTransporteId ? Number(rutaTransporteId) : null)
        .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
        .input("repitente", sql.Bit, !!repitente)
        .input("refugiado", sql.Bit, !!refugiado)
        .input("tieneAdecuacion", sql.Bit, tieneAdecuacionNormalizada)
        .input("sexo", sql.NVarChar, sexo || null)
        .input("fotoUrl", sql.NVarChar, fotoUrl || null)
        .input("codigoCarnet", sql.NVarChar, codigoCarnet)
        .input("qrContenido", sql.NVarChar, qrContenido)
        .input("nacionalidad", sql.NVarChar, nacionalidad || null)
        .input("adecuacion", sql.NVarChar, adecuacionNormalizada)
        .input("nivelFuncionamiento", sql.NVarChar, nivelFuncionamiento || null)
        .input("discapacidad", sql.NVarChar, discapacidad || null)
        .input("tipoDiscapacidad", sql.NVarChar, tipoDiscapacidad || null)
        .input("enfermedad", sql.NVarChar, enfermedad || null)
        .input(
          "rutaTransporteHabitual",
          sql.NVarChar,
          rutaTransporteHabitual || null
        )
        .input("observaciones", sql.NVarChar(sql.MAX), observaciones || null)
        .input("observacionMedica", sql.NVarChar, observacionMedica || null)
        .query(`
          UPDATE dbo.Estudiante
          SET
            Identificacion = @identificacion,
            Nombre = @nombre,
            PrimerApellido = @primerApellido,
            SegundoApellido = @segundoApellido,
            FechaNacimiento = @fechaNacimiento,
            Correo = @correo,
            Telefono = @telefono,
            TipoIdentificacion = @tipoIdentificacion,
            TipoEstudianteId = @tipoEstudianteId,
            RutaTransporteId = @rutaTransporteId,
            AutorizaWhatsAppEncargado = @autorizaWhatsAppEncargado,
            Repitente = @repitente,
            Refugiado = @refugiado,
            TieneAdecuacion = @tieneAdecuacion,
            Sexo = @sexo,
            FotoUrl = @fotoUrl,
            CodigoCarnet = @codigoCarnet,
            QrContenido = @qrContenido,
            Nacionalidad = @nacionalidad,
            Adecuacion = @adecuacion,
            NivelFuncionamiento = @nivelFuncionamiento,
            Discapacidad = @discapacidad,
            TipoDiscapacidad = @tipoDiscapacidad,
            Enfermedad = @enfermedad,
            RutaTransporteHabitual = @rutaTransporteHabitual,
            Observaciones = @observaciones,
            ObservacionMedica = @observacionMedica,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.*
          WHERE EstudianteId = @id
            AND InstitucionId = @institucionId
        `);

      if (!result.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({
          ok: false,
          message: "Estudiante no encontrado"
        });
      }

      if (Array.isArray(encargados)) {
        const encargadosNormalizados = normalizeEncargados(encargados);

        await replaceEncargadosHistorico({
          transaction,
          institucionId: req.auth.institucionId,
          estudianteId: id,
          encargados: encargadosNormalizados
        });
      }

      await syncStudentMovement({
        transaction,
        institucionId: req.auth.institucionId,
        estudianteId: id,
        movimiento: req.body?.movimiento
      });

      await ensureParentPortalUser({
        transaction,
        institucionId: req.auth.institucionId,
        correoUsuario: correoFinal,
        nombre,
        primerApellido,
        segundoApellido,
        telefono,
        passwordInicial: identificacion,
        oldCorreo: currentStudent.recordset[0]?.Correo || null
      });

      result.recordset[0].Correo = correoFinal;
      await transaction.commit();
      return ok(res, result.recordset[0]);
    } catch (error: any) {
      console.error("Error al actualizar estudiante:", error);

      try {
        await transaction.rollback();
      } catch {}

      if (error?.number === 2627 || error?.number === 2601) {
        return res.status(409).json({
          ok: false,
          code: "ESTUDIANTE_DUPLICADO",
          message:
            "Ya existe otro estudiante con esa identificación en esta institución"
        });
      }

      return res.status(500).json({
        ok: false,
        message: "Error interno al actualizar estudiante"
      });
    }
  }
);

router.delete(
  "/:id",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return badRequest(res, "Id inválido");
      }

      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      const pool = await getPool();

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("institucionId", sql.Int, req.auth.institucionId)
        .query(`
          UPDATE dbo.Estudiante
          SET
            Activo = 0,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.EstudianteId
          WHERE EstudianteId = @id
            AND InstitucionId = @institucionId
        `);

      if (!result.recordset.length) {
        return res.status(404).json({
          ok: false,
          message: "Estudiante no encontrado"
        });
      }

      return ok(res, {
          message: "Estudiante eliminado correctamente"
      });
    } catch (error) {
      console.error("Error al eliminar estudiante:", error);
      return res.status(500).json({
        ok: false,
        message: "Error interno al eliminar estudiante"
      });
    }
  }
);

router.patch(
  "/:id/reactivar",
  requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return badRequest(res, "Id inválido");
      }

      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

      const pool = await getPool();

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("institucionId", sql.Int, req.auth.institucionId)
        .query(`
          UPDATE dbo.Estudiante
          SET
            Activo = 1,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.*
          WHERE EstudianteId = @id
            AND InstitucionId = @institucionId
        `);

      if (!result.recordset.length) {
        return res.status(404).json({
          ok: false,
          message: "Estudiante no encontrado"
        });
      }

      return ok(res, {
        message: "Estudiante reactivado correctamente",
        estudiante: result.recordset[0]
      });
    } catch (error) {
      console.error("Error al reactivar estudiante:", error);
      return res.status(500).json({
        ok: false,
        message: "Error interno al reactivar estudiante"
      });
    }
  }
);

export default router;

