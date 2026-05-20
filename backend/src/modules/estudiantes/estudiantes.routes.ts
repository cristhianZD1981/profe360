import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";
import { hashPassword } from "../../utils/password";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const STUDENT_IMPORT_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "ADMINISTRATIVO"
];

router.use(requireAuth);

type EncargadoPayload = {
  tipoEncargado: "MADRE" | "PADRE" | "ENCARGADO";
  identificacion?: string | null;
  nombre?: string | null;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  correo?: string | null;
  telefono?: string | null;
  direccionExacta?: string | null;
  parentesco?: string | null;
  viveConEstudiante?: boolean;
  esPrincipal?: boolean;
  recibeNotificaciones?: boolean;
};

type ImportResultRow = {
  fila: number;
  identificacion: string;
  estado: "CREADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
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
      identificacion: item?.identificacion || null,
      nombre: item?.nombre || null,
      primerApellido: item?.primerApellido || null,
      segundoApellido: item?.segundoApellido || null,
      correo: item?.correo || null,
      telefono: item?.telefono || null,
      direccionExacta: item?.direccionExacta || null,
      parentesco: item?.parentesco || null,
      viveConEstudiante: !!item?.viveConEstudiante,
      esPrincipal: !!item?.esPrincipal,
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

function toBoolean(value: any, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();

  if (["1", "si", "sí", "true", "x", "yes"].includes(normalized)) return true;
  if (["0", "no", "false", ""].includes(normalized)) return false;

  return defaultValue;
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
      .input("identificacion", sql.NVarChar, item.identificacion || null)
      .input("nombre", sql.NVarChar, item.nombre || "")
      .input("primerApellido", sql.NVarChar, item.primerApellido || null)
      .input("segundoApellido", sql.NVarChar, item.segundoApellido || null)
      .input("correo", sql.NVarChar, item.correo || null)
      .input("telefono", sql.NVarChar, item.telefono || null)
      .input("direccionExacta", sql.NVarChar, item.direccionExacta || null)
      .query(`
        INSERT INTO dbo.Encargado
        (
          InstitucionId,
          TipoEncargado,
          Identificacion,
          Nombre,
          PrimerApellido,
          SegundoApellido,
          Correo,
          Telefono,
          DireccionExacta,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.EncargadoId
        VALUES
        (
          @institucionId,
          @tipoEncargado,
          @identificacion,
          @nombre,
          @primerApellido,
          @segundoApellido,
          @correo,
          @telefono,
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
      .input(
        "recibeNotificaciones",
        sql.Bit,
        item.recibeNotificaciones === false ? false : true
      )
      .input("viveConEstudiante", sql.Bit, !!item.viveConEstudiante)
      .query(`
        INSERT INTO dbo.EstudianteEncargado
        (
          EstudianteId,
          EncargadoId,
          Parentesco,
          EsPrincipal,
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
    sexo,
    fotoUrl,
    nacionalidad,
    tipoEstudianteId,
    rutaTransporteId,
    autorizaWhatsAppEncargado,
    adecuacion,
    discapacidad,
    enfermedad,
    rutaTransporteHabitual,
    observacionMedica,
    encargados = []
  } = payload;

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
    .input("sexo", sql.NVarChar, sexo || null)
    .input("fotoUrl", sql.NVarChar, fotoUrl || null)
    .input("codigoCarnet", sql.NVarChar, codigoCarnet)
    .input("qrContenido", sql.NVarChar, qrContenido)
     .input("nacionalidad", sql.NVarChar, nacionalidad || null)
    .input("tipoEstudianteId", sql.Int, tipoEstudianteId ? Number(tipoEstudianteId) : null)
    .input("rutaTransporteId", sql.Int, rutaTransporteId ? Number(rutaTransporteId) : null)
    .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
    .input("adecuacion", sql.NVarChar, adecuacion || null)
    .input("discapacidad", sql.NVarChar, discapacidad || null)
    .input("enfermedad", sql.NVarChar, enfermedad || null)
    .input(
      "rutaTransporteHabitual",
      sql.NVarChar,
      rutaTransporteHabitual || null
    )
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
        Sexo,
        FotoUrl,
        CodigoCarnet,
        QrContenido,
        Nacionalidad,
        TipoEstudianteId,
        RutaTransporteId,
        AutorizaWhatsAppEncargado,
        Adecuacion,
        Discapacidad,
        Enfermedad,
        RutaTransporteHabitual,
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
        @sexo,
        @fotoUrl,
        @codigoCarnet,
        @qrContenido,
        @nacionalidad,
        @tipoEstudianteId,
        @rutaTransporteId,
        @autorizaWhatsAppEncargado,
        @adecuacion,
        @discapacidad,
        @enfermedad,
        @rutaTransporteHabitual,
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
  if (row && row.Activo !== false && row.Activo !== 0) {
    return {
      estado: "OMITIDO" as const,
      motivo: "El estudiante ya existe activo; no se volvio a incluir"
    };
  }

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
    sexo,
    fotoUrl,
    nacionalidad,
    tipoEstudianteId,
    rutaTransporteId,
    autorizaWhatsAppEncargado,
    adecuacion,
    discapacidad,
    enfermedad,
    rutaTransporteHabitual,
    observacionMedica,
    encargados = []
  } = payload;

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
    .input("sexo", sql.NVarChar, sexo || null)
    .input("fotoUrl", sql.NVarChar, fotoUrl || null)
    .input("codigoCarnet", sql.NVarChar, codigoCarnet)
    .input("qrContenido", sql.NVarChar, qrContenido)
    .input("nacionalidad", sql.NVarChar, nacionalidad || null)
    .input("tipoEstudianteId", sql.Int, tipoEstudianteId ? Number(tipoEstudianteId) : null)
    .input("rutaTransporteId", sql.Int, rutaTransporteId ? Number(rutaTransporteId) : null)
    .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
    .input("adecuacion", sql.NVarChar, adecuacion || null)
    .input("discapacidad", sql.NVarChar, discapacidad || null)
    .input("enfermedad", sql.NVarChar, enfermedad || null)
    .input("rutaTransporteHabitual", sql.NVarChar, rutaTransporteHabitual || null)
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
          Sexo = @sexo,
          FotoUrl = COALESCE(@fotoUrl, FotoUrl),
          CodigoCarnet = @codigoCarnet,
          QrContenido = @qrContenido,
          Nacionalidad = @nacionalidad,
          TipoEstudianteId = @tipoEstudianteId,
          RutaTransporteId = @rutaTransporteId,
          AutorizaWhatsAppEncargado = @autorizaWhatsAppEncargado,
          Adecuacion = @adecuacion,
          Discapacidad = @discapacidad,
          Enfermedad = @enfermedad,
          RutaTransporteHabitual = @rutaTransporteHabitual,
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
    estado: "REACTIVADO" as const,
    motivo: "Registro reactivado y actualizado desde la importacion"
  };
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

  return rows;
}

function buildImportPayloadFromRow(row: any) {
  const identificacion = toNullableString(row.identificacion);
  const nombre = toNullableString(row.nombre);

  if (!identificacion || !nombre) {
    return {
      identificacion: identificacion || "",
      error: "Los campos obligatorios identificacion y nombre son requeridos",
      payload: null
    };
  }

  const encargados = [
    {
      tipoEncargado: "MADRE",
      identificacion: toNullableString(row.madre_identificacion),
      nombre: toNullableString(row.madre_nombre),
      primerApellido: toNullableString(row.madre_primerApellido),
      segundoApellido: toNullableString(row.madre_segundoApellido),
      correo: toNullableString(row.madre_correo),
      telefono: toNullableString(row.madre_telefono),
      direccionExacta: toNullableString(row.madre_direccionExacta),
      parentesco: "Madre",
      viveConEstudiante: toBoolean(row.madre_viveConEstudiante),
      esPrincipal: toBoolean(row.madre_esPrincipal),
      recibeNotificaciones: toBoolean(row.madre_recibeNotificaciones, true)
    },
    {
      tipoEncargado: "PADRE",
      identificacion: toNullableString(row.padre_identificacion),
      nombre: toNullableString(row.padre_nombre),
      primerApellido: toNullableString(row.padre_primerApellido),
      segundoApellido: toNullableString(row.padre_segundoApellido),
      correo: toNullableString(row.padre_correo),
      telefono: toNullableString(row.padre_telefono),
      direccionExacta: toNullableString(row.padre_direccionExacta),
      parentesco: "Padre",
      viveConEstudiante: toBoolean(row.padre_viveConEstudiante),
      esPrincipal: toBoolean(row.padre_esPrincipal),
      recibeNotificaciones: toBoolean(row.padre_recibeNotificaciones, true)
    },
    {
      tipoEncargado: "ENCARGADO",
      identificacion: toNullableString(row.encargado_identificacion),
      nombre: toNullableString(row.encargado_nombre),
      primerApellido: toNullableString(row.encargado_primerApellido),
      segundoApellido: toNullableString(row.encargado_segundoApellido),
      correo: toNullableString(row.encargado_correo),
      telefono: toNullableString(row.encargado_telefono),
      direccionExacta: toNullableString(row.encargado_direccionExacta),
      parentesco: toNullableString(row.encargado_parentesco) || "Encargado",
      viveConEstudiante: toBoolean(row.encargado_viveConEstudiante),
      esPrincipal: toBoolean(row.encargado_esPrincipal),
      recibeNotificaciones: toBoolean(row.encargado_recibeNotificaciones, true)
    }
  ];

  return {
    identificacion,
    error: null,
    payload: {
      identificacion,
      nombre,
      primerApellido: toNullableString(row.primerApellido),
      segundoApellido: toNullableString(row.segundoApellido),
      fechaNacimiento: toExcelDate(row.fechaNacimiento),
      sexo: toNullableString(row.sexo),
      correo: toNullableString(row.correo),
      telefono: toNullableString(row.telefono),
      fotoUrl: null,
      nacionalidad: toNullableString(row.nacionalidad),
      tipoEstudianteId: row.tipoEstudianteId ? Number(row.tipoEstudianteId) : null,
      rutaTransporteId: row.rutaTransporteId ? Number(row.rutaTransporteId) : null,
      autorizaWhatsAppEncargado: toBoolean(row.autorizaWhatsAppEncargado),
      adecuacion: toNullableString(row.adecuacion),
      discapacidad: toNullableString(row.discapacidad),
      enfermedad: toNullableString(row.enfermedad),
      rutaTransporteHabitual: toNullableString(row.rutaTransporteHabitual),
      observacionMedica: toNullableString(row.observacionMedica),
      encargados
    }
  };
}

async function processStudentImportRows(params: { rows: any[]; institucionId: number; job?: ImportJob }) {
  const { rows, institucionId, job } = params;
  const pool = await getPool();

  const resultados: ImportResultRow[] = [];
  let totalOk = 0;
  let totalError = 0;
  let totalCreados = 0;
  let totalReactivados = 0;
  let totalOmitidos = 0;

  if (job) {
    job.status = "PROCESANDO";
    job.updatedAt = Date.now();
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
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
            e.FotoUrl,
            e.CodigoCarnet,
            e.QrContenido,
            e.Nacionalidad,
            e.TipoEstudianteId,
            te.Descripcion AS TipoEstudianteDescripcion,
            e.RutaTransporteId,
            rt.Descripcion AS RutaTransporteDescripcion,
            e.AutorizaWhatsAppEncargado,
            e.Adecuacion,
            e.Discapacidad,
            e.Enfermedad,
            e.RutaTransporteHabitual,
            e.ObservacionMedica,
            e.Activo
          FROM dbo.Estudiante e
          LEFT JOIN dbo.TipoEstudiante te
            ON te.TipoEstudianteId = e.TipoEstudianteId
          LEFT JOIN dbo.RutaTransporte rt
            ON rt.RutaTransporteId = e.RutaTransporteId
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

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, req.auth.institucionId)
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

        SELECT TOP 12 Grupo AS Label, COUNT(DISTINCT EstudianteId) AS Total
        FROM @matriculasBase
        GROUP BY Grupo
        ORDER BY Total DESC, Label;

        SELECT TOP 18 Seccion AS Label, COUNT(DISTINCT EstudianteId) AS Total
        FROM @matriculasBase
        GROUP BY Seccion
        ORDER BY Total DESC, Label;

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

    const totales = result.recordsets[0]?.[0] || {};
    const otros = result.recordsets[7]?.[0] || {};

    return ok(res, {
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
    });
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
  async (_req, res) => {
    try {
      const wb = XLSX.utils.book_new();

      const instrucciones = [
        {
          Campo: "identificacion",
          Obligatorio: "Sí",
          Descripcion: "Identificación del estudiante"
        },
        { Campo: "nombre", Obligatorio: "Sí", Descripcion: "Nombre del estudiante" },
        { Campo: "primerApellido", Obligatorio: "No", Descripcion: "Primer apellido" },
        { Campo: "segundoApellido", Obligatorio: "No", Descripcion: "Segundo apellido" },
        {
          Campo: "fechaNacimiento",
          Obligatorio: "No",
          Descripcion: "Formato recomendado YYYY-MM-DD"
        },
        { Campo: "sexo", Obligatorio: "No", Descripcion: "Masculino, Femenino u Otro" },
        { Campo: "correo", Obligatorio: "No", Descripcion: "Se genera automáticamente con identificación + dominio institucional" },
        { Campo: "telefono", Obligatorio: "No", Descripcion: "Teléfono del estudiante" },
        { Campo: "tipoEstudianteId", Obligatorio: "No", Descripcion: "Id del tipo de estudiante configurado en Académico" },
        { Campo: "nacionalidad", Obligatorio: "No", Descripcion: "Nacionalidad" },
        { Campo: "adecuacion", Obligatorio: "No", Descripcion: "Adecuación" },
        { Campo: "discapacidad", Obligatorio: "No", Descripcion: "Discapacidad" },
        { Campo: "enfermedad", Obligatorio: "No", Descripcion: "Enfermedad" },
        { Campo: "rutaTransporteId", Obligatorio: "No", Descripcion: "Id de la ruta de transporte configurada en Académico" },
        {
          Campo: "rutaTransporteHabitual",
          Obligatorio: "No",
          Descripcion: "Nombre o referencia de ruta de transporte"
        },
        { Campo: "autorizaWhatsAppEncargado", Obligatorio: "No", Descripcion: "Sí o No. Indica si padre, madre o encargado autoriza recibir información por WhatsApp" },
        {
          Campo: "observacionMedica",
          Obligatorio: "No",
          Descripcion: "Observación médica"
        },
        {
          Campo: "madre_nombre",
          Obligatorio: "No",
          Descripcion: "Nombre de la madre"
        },
        {
          Campo: "madre_primerApellido",
          Obligatorio: "No",
          Descripcion: "Primer apellido de la madre"
        },
        {
          Campo: "madre_segundoApellido",
          Obligatorio: "No",
          Descripcion: "Segundo apellido de la madre"
        },
        {
          Campo: "madre_identificacion",
          Obligatorio: "No",
          Descripcion: "Identificación de la madre"
        },
        {
          Campo: "madre_correo",
          Obligatorio: "No",
          Descripcion: "Correo de la madre"
        },
        {
          Campo: "madre_telefono",
          Obligatorio: "No",
          Descripcion: "Teléfono de la madre"
        },
        {
          Campo: "madre_direccionExacta",
          Obligatorio: "No",
          Descripcion: "Dirección exacta de la madre"
        },
        {
          Campo: "madre_viveConEstudiante",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "madre_esPrincipal",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "madre_recibeNotificaciones",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "padre_nombre",
          Obligatorio: "No",
          Descripcion: "Nombre del padre"
        },
        {
          Campo: "padre_primerApellido",
          Obligatorio: "No",
          Descripcion: "Primer apellido del padre"
        },
        {
          Campo: "padre_segundoApellido",
          Obligatorio: "No",
          Descripcion: "Segundo apellido del padre"
        },
        {
          Campo: "padre_identificacion",
          Obligatorio: "No",
          Descripcion: "Identificación del padre"
        },
        {
          Campo: "padre_correo",
          Obligatorio: "No",
          Descripcion: "Correo del padre"
        },
        {
          Campo: "padre_telefono",
          Obligatorio: "No",
          Descripcion: "Teléfono del padre"
        },
        {
          Campo: "padre_direccionExacta",
          Obligatorio: "No",
          Descripcion: "Dirección exacta del padre"
        },
        {
          Campo: "padre_viveConEstudiante",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "padre_esPrincipal",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "padre_recibeNotificaciones",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "encargado_nombre",
          Obligatorio: "No",
          Descripcion: "Nombre del encargado"
        },
        {
          Campo: "encargado_primerApellido",
          Obligatorio: "No",
          Descripcion: "Primer apellido del encargado"
        },
        {
          Campo: "encargado_segundoApellido",
          Obligatorio: "No",
          Descripcion: "Segundo apellido del encargado"
        },
        {
          Campo: "encargado_identificacion",
          Obligatorio: "No",
          Descripcion: "Identificación del encargado"
        },
        {
          Campo: "encargado_correo",
          Obligatorio: "No",
          Descripcion: "Correo del encargado"
        },
        {
          Campo: "encargado_telefono",
          Obligatorio: "No",
          Descripcion: "Teléfono del encargado"
        },
        {
          Campo: "encargado_direccionExacta",
          Obligatorio: "No",
          Descripcion: "Dirección exacta del encargado"
        },
        {
          Campo: "encargado_parentesco",
          Obligatorio: "No",
          Descripcion: "Ejemplo: Tía, abuelo, tutor"
        },
        {
          Campo: "encargado_viveConEstudiante",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "encargado_esPrincipal",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        },
        {
          Campo: "encargado_recibeNotificaciones",
          Obligatorio: "No",
          Descripcion: "Sí o No"
        }
      ];

      const ejemplo = [
        {
          identificacion: "123456789",
          nombre: "Ana",
          primerApellido: "Pérez",
          segundoApellido: "Rojas",
          fechaNacimiento: "2012-03-15",
          sexo: "Femenino",
          correo: "ana@email.com",
          telefono: "88888888",
          nacionalidad: "Costarricense",
          adecuacion: "No",
          discapacidad: "",
          enfermedad: "",
          rutaTransporteId: "",
          rutaTransporteHabitual: "Ruta 1",
          autorizaWhatsAppEncargado: "Sí",
          observacionMedica: "",
          madre_nombre: "Laura",
          madre_primerApellido: "Pérez",
          madre_segundoApellido: "Solano",
          madre_identificacion: "111111111",
          madre_correo: "laura@email.com",
          madre_telefono: "70000000",
          madre_direccionExacta: "San Vito",
          madre_viveConEstudiante: "Sí",
          madre_esPrincipal: "Sí",
          madre_recibeNotificaciones: "Sí",
          padre_nombre: "Carlos",
          padre_primerApellido: "Rojas",
          padre_segundoApellido: "Vega",
          padre_identificacion: "222222222",
          padre_correo: "carlos@email.com",
          padre_telefono: "71111111",
          padre_direccionExacta: "San Vito",
          padre_viveConEstudiante: "No",
          padre_esPrincipal: "No",
          padre_recibeNotificaciones: "Sí",
          encargado_nombre: "",
          encargado_primerApellido: "",
          encargado_segundoApellido: "",
          encargado_identificacion: "",
          encargado_correo: "",
          encargado_telefono: "",
          encargado_direccionExacta: "",
          encargado_parentesco: "",
          encargado_viveConEstudiante: "No",
          encargado_esPrincipal: "No",
          encargado_recibeNotificaciones: "Sí"
        }
      ];

      const wsInstrucciones = XLSX.utils.json_to_sheet(instrucciones);
      const wsEjemplo = XLSX.utils.json_to_sheet(ejemplo);

      XLSX.utils.book_append_sheet(wb, wsInstrucciones, "Instrucciones");
      XLSX.utils.book_append_sheet(wb, wsEjemplo, "Estudiantes");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="plantilla_estudiantes.xlsx"'
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      return res.send(buffer);
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
        return badRequest(res, "El usuario no tiene instituciÃ³n asignada");
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
          console.error("Error procesando importaciÃ³n de estudiantes:", error);
          job.status = "ERROR";
          job.error = error?.message || "No se pudo procesar el archivo Excel";
          job.updatedAt = Date.now();
        });
      });

      return ok(res, serializeImportJob(job), "ImportaciÃ³n iniciada");
    } catch (error: any) {
      if (error?.status === 400) return badRequest(res, error.message);
      console.error("Error iniciando importaciÃ³n de estudiantes:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo iniciar la importaciÃ³n"
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
        return badRequest(res, "El usuario no tiene instituciÃ³n asignada");
      }

      cleanupImportJobs();
      const job = importJobs.get(String(req.params.jobId || ""));

      if (!job || job.institucionId !== req.auth.institucionId) {
        return res.status(404).json({
          ok: false,
          message: "No se encontrÃ³ la importaciÃ³n solicitada"
        });
      }

      return ok(res, serializeImportJob(job));
    } catch (error) {
      console.error("Error consultando progreso de importaciÃ³n:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo consultar el progreso de la importaciÃ³n"
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
        return badRequest(res, "El usuario no tiene instituciÃƒÂ³n asignada");
      }

      cleanupImportJobs();
      const job = importJobs.get(String(req.params.jobId || ""));

      if (!job || job.institucionId !== req.auth.institucionId) {
        return res.status(404).json({
          ok: false,
          message: "No se encontrÃƒÂ³ la importaciÃƒÂ³n solicitada"
        });
      }

      const wb = XLSX.utils.book_new();
      const resumen = [
        { Concepto: "Total registros", Valor: job.totalRegistros },
        { Concepto: "Procesados", Valor: job.procesados },
        { Concepto: "Creados", Valor: job.totalCreados },
        { Concepto: "Reactivados y actualizados", Valor: job.totalReactivados },
        { Concepto: "Omitidos por existir activos", Valor: job.totalOmitidos },
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
      console.error("Error exportando resumen de importaciÃƒÂ³n:", error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo exportar el resumen de importaciÃƒÂ³n"
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

      if (!rows.length) {
        return badRequest(res, "El archivo no contiene registros para importar");
      }

      const pool = await getPool();

      const resultados: Array<{
        fila: number;
        identificacion: string;
        estado: "OK" | "ERROR";
        motivo: string;
      }> = [];

      let totalOk = 0;
      let totalError = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fila = i + 2;

        const identificacion = toNullableString(row.identificacion);
        const nombre = toNullableString(row.nombre);

        if (!identificacion || !nombre) {
          resultados.push({
            fila,
            identificacion: identificacion || "",
            estado: "ERROR",
            motivo: "Los campos obligatorios identificacion y nombre son requeridos"
          });
          totalError++;
          continue;
        }

        const encargados = [
          {
            tipoEncargado: "MADRE",
            identificacion: toNullableString(row.madre_identificacion),
            nombre: toNullableString(row.madre_nombre),
            primerApellido: toNullableString(row.madre_primerApellido),
            segundoApellido: toNullableString(row.madre_segundoApellido),
            correo: toNullableString(row.madre_correo),
            telefono: toNullableString(row.madre_telefono),
            direccionExacta: toNullableString(row.madre_direccionExacta),
            parentesco: "Madre",
            viveConEstudiante: toBoolean(row.madre_viveConEstudiante),
            esPrincipal: toBoolean(row.madre_esPrincipal),
            recibeNotificaciones: toBoolean(row.madre_recibeNotificaciones, true)
          },
          {
            tipoEncargado: "PADRE",
            identificacion: toNullableString(row.padre_identificacion),
            nombre: toNullableString(row.padre_nombre),
            primerApellido: toNullableString(row.padre_primerApellido),
            segundoApellido: toNullableString(row.padre_segundoApellido),
            correo: toNullableString(row.padre_correo),
            telefono: toNullableString(row.padre_telefono),
            direccionExacta: toNullableString(row.padre_direccionExacta),
            parentesco: "Padre",
            viveConEstudiante: toBoolean(row.padre_viveConEstudiante),
            esPrincipal: toBoolean(row.padre_esPrincipal),
            recibeNotificaciones: toBoolean(row.padre_recibeNotificaciones, true)
          },
          {
            tipoEncargado: "ENCARGADO",
            identificacion: toNullableString(row.encargado_identificacion),
            nombre: toNullableString(row.encargado_nombre),
            primerApellido: toNullableString(row.encargado_primerApellido),
            segundoApellido: toNullableString(row.encargado_segundoApellido),
            correo: toNullableString(row.encargado_correo),
            telefono: toNullableString(row.encargado_telefono),
            direccionExacta: toNullableString(row.encargado_direccionExacta),
            parentesco: toNullableString(row.encargado_parentesco) || "Encargado",
            viveConEstudiante: toBoolean(row.encargado_viveConEstudiante),
            esPrincipal: toBoolean(row.encargado_esPrincipal),
            recibeNotificaciones: toBoolean(row.encargado_recibeNotificaciones, true)
          }
        ];

        const payload = {
          identificacion,
          nombre,
          primerApellido: toNullableString(row.primerApellido),
          segundoApellido: toNullableString(row.segundoApellido),
          fechaNacimiento: toExcelDate(row.fechaNacimiento),
          sexo: toNullableString(row.sexo),
          correo: toNullableString(row.correo),
          telefono: toNullableString(row.telefono),
          fotoUrl: null,
          nacionalidad: toNullableString(row.nacionalidad),
          adecuacion: toNullableString(row.adecuacion),
          discapacidad: toNullableString(row.discapacidad),
          enfermedad: toNullableString(row.enfermedad),
          rutaTransporteHabitual: toNullableString(row.rutaTransporteHabitual),
          observacionMedica: toNullableString(row.observacionMedica),
          encargados
        };

        const transaction = new sql.Transaction(pool);

        try {
          await transaction.begin();
          await createStudentWithTransaction({
            transaction,
            institucionId: req.auth.institucionId,
            payload
          });
          await transaction.commit();

          resultados.push({
            fila,
            identificacion,
            estado: "OK",
            motivo: "Registro cargado correctamente"
          });
          totalOk++;
        } catch (error: any) {
          try {
            await transaction.rollback();
          } catch {}

          resultados.push({
            fila,
            identificacion,
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
          e.FotoUrl,
          e.CodigoCarnet,
          e.QrContenido,
          e.Nacionalidad,
          e.TipoEstudianteId,
          te.Descripcion AS TipoEstudianteDescripcion,
          e.RutaTransporteId,
          rt.Descripcion AS RutaTransporteDescripcion,
          e.AutorizaWhatsAppEncargado,
          e.Adecuacion,
          e.Discapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.ObservacionMedica,
          e.Activo
        FROM dbo.Estudiante e
        LEFT JOIN dbo.TipoEstudiante te
          ON te.TipoEstudianteId = e.TipoEstudianteId
        LEFT JOIN dbo.RutaTransporte rt
          ON rt.RutaTransporteId = e.RutaTransporteId
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
          ee.RecibeNotificaciones,
          ee.ViveConEstudiante,
          ee.VigenciaDesde,
          ee.VigenciaHasta,
          ee.Activo,
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
          e.FotoUrl,
          e.CodigoCarnet,
          e.QrContenido,
          e.Nacionalidad,
          e.RutaTransporteId,
          e.AutorizaWhatsAppEncargado,
          e.Adecuacion,
          e.Discapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
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
        tipoEstudianteId,
        rutaTransporteId,
        autorizaWhatsAppEncargado,
        sexo,
        fotoUrl,
        nacionalidad,
        adecuacion,
        discapacidad,
        enfermedad,
        rutaTransporteHabitual,
        observacionMedica,
        encargados = []
      } = req.body;

      if (!identificacion || !nombre) {
        return badRequest(res, "identificacion y nombre son obligatorios");
      }

      if (!req.auth?.institucionId) {
        return badRequest(res, "El usuario no tiene institución asignada");
      }

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
          telefono,
          tipoEstudianteId,
          rutaTransporteId,
          autorizaWhatsAppEncargado,
          sexo,
          fotoUrl,
          nacionalidad,
          adecuacion,
          discapacidad,
          enfermedad,
          rutaTransporteHabitual,
          observacionMedica,
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
        tipoEstudianteId,
        rutaTransporteId,
        autorizaWhatsAppEncargado,
        sexo,
        fotoUrl,
        nacionalidad,
        adecuacion,
        discapacidad,
        enfermedad,
        rutaTransporteHabitual,
        observacionMedica,
        encargados
      } = req.body;

      if (!id) {
        return badRequest(res, "Id inválido");
      }

      if (!identificacion || !nombre) {
        return badRequest(res, "identificacion y nombre son obligatorios");
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
                .input("telefono", sql.NVarChar, telefono || null)
        .input("tipoEstudianteId", sql.Int, tipoEstudianteId ? Number(tipoEstudianteId) : null)
        .input("rutaTransporteId", sql.Int, rutaTransporteId ? Number(rutaTransporteId) : null)
        .input("autorizaWhatsAppEncargado", sql.Bit, !!autorizaWhatsAppEncargado)
        .input("sexo", sql.NVarChar, sexo || null)
        .input("fotoUrl", sql.NVarChar, fotoUrl || null)
        .input("codigoCarnet", sql.NVarChar, codigoCarnet)
        .input("qrContenido", sql.NVarChar, qrContenido)
        .input("nacionalidad", sql.NVarChar, nacionalidad || null)
        .input("adecuacion", sql.NVarChar, adecuacion || null)
        .input("discapacidad", sql.NVarChar, discapacidad || null)
        .input("enfermedad", sql.NVarChar, enfermedad || null)
        .input(
          "rutaTransporteHabitual",
          sql.NVarChar,
          rutaTransporteHabitual || null
        )
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
            TipoEstudianteId = @tipoEstudianteId,
            RutaTransporteId = @rutaTransporteId,
            AutorizaWhatsAppEncargado = @autorizaWhatsAppEncargado,
            Sexo = @sexo,
            FotoUrl = @fotoUrl,
            CodigoCarnet = @codigoCarnet,
            QrContenido = @qrContenido,
            Nacionalidad = @nacionalidad,
            Adecuacion = @adecuacion,
            Discapacidad = @discapacidad,
            Enfermedad = @enfermedad,
            RutaTransporteHabitual = @rutaTransporteHabitual,
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
