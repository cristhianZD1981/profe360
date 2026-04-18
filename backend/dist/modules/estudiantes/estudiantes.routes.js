"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const password_1 = require("../../utils/password");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.use(auth_middleware_1.requireAuth);
function buildCodigoCarnet(institucionId, identificacion) {
    const limpio = String(identificacion || "").replace(/\s+/g, "").trim();
    return `STU-${institucionId}-${limpio}`;
}
async function getCorreoEstudianteDominio(transactionOrPool, institucionId) {
    const result = await transactionOrPool.request()
        .input("institucionId", database_1.sql.Int, institucionId)
        .query(`
      SELECT TOP 1 ISNULL(DominioCorreoEstudiantil, N'@est.mep.go.cr') AS DominioCorreoEstudiantil
      FROM dbo.Institucion
      WHERE InstitucionId = @institucionId
    `);
    return String(result.recordset[0]?.DominioCorreoEstudiantil || "@est.mep.go.cr").trim();
}
function buildStudentEmail(identificacion, dominio) {
    const limpio = String(identificacion || "").replace(/\s+/g, "").trim();
    let dominioFinal = String(dominio || "@est.mep.go.cr").trim();
    if (dominioFinal && !dominioFinal.startsWith("@"))
        dominioFinal = `@${dominioFinal}`;
    return `${limpio}${dominioFinal}`.toLowerCase();
}
async function ensurePadreFamiliaRoleId(transaction) {
    const result = await transaction.request().query(`SELECT TOP 1 RolId FROM dbo.Rol WHERE Nombre = N'PADRE_FAMILIA'`);
    return result.recordset[0]?.RolId || null;
}
async function ensureParentPortalUser(params) {
    const { transaction, institucionId, correoUsuario, nombre, primerApellido, segundoApellido, telefono, passwordInicial, oldCorreo = null } = params;
    const rolId = await ensurePadreFamiliaRoleId(transaction);
    if (!rolId)
        return null;
    const existing = await transaction.request()
        .input("correoUsuario", database_1.sql.NVarChar, correoUsuario)
        .input("oldCorreo", database_1.sql.NVarChar, oldCorreo || null)
        .query(`
      SELECT TOP 1 UsuarioId, Correo, ISNULL(DebeCambiarPassword, 0) AS DebeCambiarPassword
      FROM dbo.Usuario
      WHERE Correo = @correoUsuario OR (@oldCorreo IS NOT NULL AND Correo = @oldCorreo)
      ORDER BY CASE WHEN Correo = @correoUsuario THEN 0 ELSE 1 END, UsuarioId DESC
    `);
    if (existing.recordset.length) {
        const row = existing.recordset[0];
        await transaction.request()
            .input("usuarioId", database_1.sql.Int, row.UsuarioId)
            .input("correoUsuario", database_1.sql.NVarChar, correoUsuario)
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
            .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
            .input("telefono", database_1.sql.NVarChar, telefono || null)
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
            .input("usuarioId", database_1.sql.Int, row.UsuarioId)
            .input("rolId", database_1.sql.Int, rolId)
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
    const hash = await (0, password_1.hashPassword)(passwordInicial);
    const createdUser = await transaction.request()
        .input("institucionId", database_1.sql.Int, institucionId)
        .input("correoUsuario", database_1.sql.NVarChar, correoUsuario)
        .input("hashPassword", database_1.sql.NVarChar, hash)
        .input("nombre", database_1.sql.NVarChar, nombre)
        .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
        .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
        .input("telefono", database_1.sql.NVarChar, telefono || null)
        .query(`
      INSERT INTO dbo.Usuario (InstitucionId, Correo, HashPassword, Nombre, PrimerApellido, SegundoApellido, Telefono, Activo, DebeCambiarPassword, CreatedAt)
      OUTPUT INSERTED.UsuarioId
      VALUES (@institucionId, @correoUsuario, @hashPassword, @nombre, @primerApellido, @segundoApellido, @telefono, 1, 1, SYSDATETIME())
    `);
    const usuarioId = createdUser.recordset[0]?.UsuarioId;
    await transaction.request()
        .input("usuarioId", database_1.sql.Int, usuarioId)
        .input("rolId", database_1.sql.Int, rolId)
        .query(`
      INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
      VALUES (@usuarioId, @rolId, 1)
    `);
    return usuarioId;
}
function normalizeEncargados(encargados) {
    if (!Array.isArray(encargados))
        return [];
    return encargados
        .map((item) => ({
        tipoEncargado: String(item?.tipoEncargado || "").toUpperCase(),
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
        const tieneContenido = !!item.nombre ||
            !!item.identificacion ||
            !!item.correo ||
            !!item.telefono;
        return tieneContenido;
    });
}
function toNullableString(value) {
    if (value === undefined || value === null)
        return null;
    const str = String(value).trim();
    return str ? str : null;
}
function toBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === "")
        return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "si", "sí", "true", "x", "yes"].includes(normalized))
        return true;
    if (["0", "no", "false", ""].includes(normalized))
        return false;
    return defaultValue;
}
function toExcelDate(value) {
    if (!value)
        return null;
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
    if (!str)
        return null;
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
async function replaceEncargadosHistorico(params) {
    const { transaction, institucionId, estudianteId, encargados } = params;
    await transaction
        .request()
        .input("estudianteId", database_1.sql.Int, estudianteId)
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
            .input("institucionId", database_1.sql.Int, institucionId)
            .input("tipoEncargado", database_1.sql.NVarChar, item.tipoEncargado)
            .input("identificacion", database_1.sql.NVarChar, item.identificacion || null)
            .input("nombre", database_1.sql.NVarChar, item.nombre || "")
            .input("primerApellido", database_1.sql.NVarChar, item.primerApellido || null)
            .input("segundoApellido", database_1.sql.NVarChar, item.segundoApellido || null)
            .input("correo", database_1.sql.NVarChar, item.correo || null)
            .input("telefono", database_1.sql.NVarChar, item.telefono || null)
            .input("direccionExacta", database_1.sql.NVarChar, item.direccionExacta || null)
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
            .input("estudianteId", database_1.sql.Int, estudianteId)
            .input("encargadoId", database_1.sql.Int, encargadoId)
            .input("parentesco", database_1.sql.NVarChar, item.parentesco || null)
            .input("esPrincipal", database_1.sql.Bit, !!item.esPrincipal)
            .input("recibeNotificaciones", database_1.sql.Bit, item.recibeNotificaciones === false ? false : true)
            .input("viveConEstudiante", database_1.sql.Bit, !!item.viveConEstudiante)
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
async function createStudentWithTransaction(params) {
    const { transaction, institucionId, payload, oldCorreo = null } = params;
    const { identificacion, nombre, primerApellido, segundoApellido, fechaNacimiento, correo, telefono, sexo, fotoUrl, nacionalidad, adecuacion, discapacidad, enfermedad, rutaTransporteHabitual, observacionMedica, encargados = [] } = payload;
    const existe = await transaction
        .request()
        .input("institucionId", database_1.sql.Int, institucionId)
        .input("identificacion", database_1.sql.NVarChar, identificacion)
        .query(`
      SELECT TOP 1 EstudianteId, Activo
      FROM dbo.Estudiante
      WHERE InstitucionId = @institucionId
        AND Identificacion = @identificacion
    `);
    if (existe.recordset.length > 0) {
        const existente = existe.recordset[0];
        if (existente.Activo === false || existente.Activo === 0) {
            const error = new Error("Ya existe un estudiante inactivo con esa identificación. Podés reactivarlo.");
            error.code = "ESTUDIANTE_INACTIVO";
            error.estudianteId = existente.EstudianteId;
            throw error;
        }
        const error = new Error("Ya existe un estudiante con esa identificación en esta institución");
        error.code = "ESTUDIANTE_DUPLICADO";
        throw error;
    }
    const codigoCarnet = buildCodigoCarnet(institucionId, identificacion);
    const qrContenido = codigoCarnet;
    const dominioCorreo = await getCorreoEstudianteDominio(transaction, institucionId);
    const correoGenerado = buildStudentEmail(identificacion, dominioCorreo);
    const result = await transaction
        .request()
        .input("institucionId", database_1.sql.Int, institucionId)
        .input("identificacion", database_1.sql.NVarChar, identificacion)
        .input("nombre", database_1.sql.NVarChar, nombre)
        .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
        .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
        .input("fechaNacimiento", database_1.sql.Date, fechaNacimiento || null)
        .input("correo", database_1.sql.NVarChar, correoGenerado)
        .input("telefono", database_1.sql.NVarChar, telefono || null)
        .input("sexo", database_1.sql.NVarChar, sexo || null)
        .input("fotoUrl", database_1.sql.NVarChar, fotoUrl || null)
        .input("codigoCarnet", database_1.sql.NVarChar, codigoCarnet)
        .input("qrContenido", database_1.sql.NVarChar, qrContenido)
        .input("nacionalidad", database_1.sql.NVarChar, nacionalidad || null)
        .input("adecuacion", database_1.sql.NVarChar, adecuacion || null)
        .input("discapacidad", database_1.sql.NVarChar, discapacidad || null)
        .input("enfermedad", database_1.sql.NVarChar, enfermedad || null)
        .input("rutaTransporteHabitual", database_1.sql.NVarChar, rutaTransporteHabitual || null)
        .input("observacionMedica", database_1.sql.NVarChar, observacionMedica || null)
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
router.get("/", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
            .input("q", database_1.sql.NVarChar, `%${q}%`)
            .input("incluirInactivos", database_1.sql.Bit, incluirInactivos)
            .query(`
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
          e.Adecuacion,
          e.Discapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.ObservacionMedica,
          e.Activo
        FROM dbo.Estudiante e
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
          )
        ORDER BY e.EstudianteId DESC
      `);
        return (0, http_1.ok)(res, result.recordset);
    }
    catch (error) {
        console.error("Error al listar estudiantes:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al listar estudiantes"
        });
    }
});
router.get("/plantilla-excel", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (_req, res) => {
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
            { Campo: "nacionalidad", Obligatorio: "No", Descripcion: "Nacionalidad" },
            { Campo: "adecuacion", Obligatorio: "No", Descripcion: "Adecuación" },
            { Campo: "discapacidad", Obligatorio: "No", Descripcion: "Discapacidad" },
            { Campo: "enfermedad", Obligatorio: "No", Descripcion: "Enfermedad" },
            {
                Campo: "rutaTransporteHabitual",
                Obligatorio: "No",
                Descripcion: "Ruta de transporte"
            },
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
                rutaTransporteHabitual: "Ruta 1",
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
        res.setHeader("Content-Disposition", 'attachment; filename="plantilla_estudiantes.xlsx"');
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buffer);
    }
    catch (error) {
        console.error("Error generando plantilla de estudiantes:", error);
        return res.status(500).json({
            ok: false,
            message: "No se pudo generar la plantilla"
        });
    }
});
router.post("/importar-excel", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), upload.single("archivo"), async (req, res) => {
    try {
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        if (!req.file?.buffer) {
            return (0, http_1.badRequest)(res, "Debés adjuntar un archivo Excel");
        }
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames.includes("Estudiantes")
            ? "Estudiantes"
            : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!rows.length) {
            return (0, http_1.badRequest)(res, "El archivo no contiene registros para importar");
        }
        const pool = await (0, database_1.getPool)();
        const resultados = [];
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
            const transaction = new database_1.sql.Transaction(pool);
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
            }
            catch (error) {
                try {
                    await transaction.rollback();
                }
                catch { }
                resultados.push({
                    fila,
                    identificacion,
                    estado: "ERROR",
                    motivo: error?.message || "No se pudo cargar el registro"
                });
                totalError++;
            }
        }
        return (0, http_1.ok)(res, {
            totalRegistros: rows.length,
            totalOk,
            totalError,
            resultados
        }, "Importación procesada");
    }
    catch (error) {
        console.error("Error importando estudiantes desde Excel:", error);
        return res.status(500).json({
            ok: false,
            message: "No se pudo procesar el archivo Excel"
        });
    }
});
router.get("/:id/detalle", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const estudianteResult = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
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
          e.Adecuacion,
          e.Discapacidad,
          e.Enfermedad,
          e.RutaTransporteHabitual,
          e.ObservacionMedica,
          e.Activo
        FROM dbo.Estudiante e
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
            .input("estudianteId", database_1.sql.Int, id)
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
        return (0, http_1.ok)(res, {
            estudiante: estudianteResult.recordset[0],
            encargados: encargadosResult.recordset
        });
    }
    catch (error) {
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
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
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
        return (0, http_1.ok)(res, {
            ...item,
            GrupoSeccion: item.GrupoNombre || item.GrupoNivel || ""
        });
    }
    catch (error) {
        console.error("Error al cargar carnet del estudiante:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al cargar el carnet"
        });
    }
});
router.post("/", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    const pool = await (0, database_1.getPool)();
    const transaction = new database_1.sql.Transaction(pool);
    try {
        const { identificacion, nombre, primerApellido, segundoApellido, fechaNacimiento, correo, telefono, sexo, fotoUrl, nacionalidad, adecuacion, discapacidad, enfermedad, rutaTransporteHabitual, observacionMedica, encargados = [] } = req.body;
        if (!identificacion || !nombre) {
            return (0, http_1.badRequest)(res, "identificacion y nombre son obligatorios");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
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
        return (0, http_1.created)(res, estudiante);
    }
    catch (error) {
        console.error("Error al crear estudiante:", error);
        try {
            await transaction.rollback();
        }
        catch { }
        if (error?.code === "ESTUDIANTE_INACTIVO") {
            return res.status(409).json({
                ok: false,
                code: "ESTUDIANTE_INACTIVO",
                estudianteId: error.estudianteId,
                message: error.message
            });
        }
        if (error?.code === "ESTUDIANTE_DUPLICADO" ||
            error?.number === 2627 ||
            error?.number === 2601) {
            return res.status(409).json({
                ok: false,
                code: "ESTUDIANTE_DUPLICADO",
                message: "Ya existe un estudiante con esa identificación en esta institución"
            });
        }
        return res.status(500).json({
            ok: false,
            message: "Error interno al crear estudiante"
        });
    }
});
router.put("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    const pool = await (0, database_1.getPool)();
    const transaction = new database_1.sql.Transaction(pool);
    try {
        const id = Number(req.params.id);
        const { identificacion, nombre, primerApellido, segundoApellido, fechaNacimiento, correo, telefono, sexo, fotoUrl, nacionalidad, adecuacion, discapacidad, enfermedad, rutaTransporteHabitual, observacionMedica, encargados } = req.body;
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!identificacion || !nombre) {
            return (0, http_1.badRequest)(res, "identificacion y nombre son obligatorios");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        await transaction.begin();
        const existe = await transaction
            .request()
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
            .input("identificacion", database_1.sql.NVarChar, identificacion)
            .input("id", database_1.sql.Int, id)
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
                message: "Ya existe otro estudiante con esa identificación en esta institución"
            });
        }
        const codigoCarnet = buildCodigoCarnet(req.auth.institucionId, identificacion);
        const qrContenido = codigoCarnet;
        const dominioCorreo = await getCorreoEstudianteDominio(transaction, req.auth.institucionId);
        const correoGenerado = buildStudentEmail(identificacion, dominioCorreo);
        const currentStudent = await transaction
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
            .query(`SELECT TOP 1 Correo FROM dbo.Estudiante WHERE EstudianteId = @id AND InstitucionId = @institucionId`);
        const result = await transaction
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
            .input("identificacion", database_1.sql.NVarChar, identificacion)
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
            .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
            .input("fechaNacimiento", database_1.sql.Date, fechaNacimiento || null)
            .input("correo", database_1.sql.NVarChar, correoGenerado)
            .input("telefono", database_1.sql.NVarChar, telefono || null)
            .input("sexo", database_1.sql.NVarChar, sexo || null)
            .input("fotoUrl", database_1.sql.NVarChar, fotoUrl || null)
            .input("codigoCarnet", database_1.sql.NVarChar, codigoCarnet)
            .input("qrContenido", database_1.sql.NVarChar, qrContenido)
            .input("nacionalidad", database_1.sql.NVarChar, nacionalidad || null)
            .input("adecuacion", database_1.sql.NVarChar, adecuacion || null)
            .input("discapacidad", database_1.sql.NVarChar, discapacidad || null)
            .input("enfermedad", database_1.sql.NVarChar, enfermedad || null)
            .input("rutaTransporteHabitual", database_1.sql.NVarChar, rutaTransporteHabitual || null)
            .input("observacionMedica", database_1.sql.NVarChar, observacionMedica || null)
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
            correoUsuario: correoGenerado,
            nombre,
            primerApellido,
            segundoApellido,
            telefono,
            passwordInicial: identificacion,
            oldCorreo: currentStudent.recordset[0]?.Correo || null
        });
        result.recordset[0].Correo = correoGenerado;
        await transaction.commit();
        return (0, http_1.ok)(res, result.recordset[0]);
    }
    catch (error) {
        console.error("Error al actualizar estudiante:", error);
        try {
            await transaction.rollback();
        }
        catch { }
        if (error?.number === 2627 || error?.number === 2601) {
            return res.status(409).json({
                ok: false,
                code: "ESTUDIANTE_DUPLICADO",
                message: "Ya existe otro estudiante con esa identificación en esta institución"
            });
        }
        return res.status(500).json({
            ok: false,
            message: "Error interno al actualizar estudiante"
        });
    }
});
router.delete("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
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
        return (0, http_1.ok)(res, {
            message: "Estudiante desactivado correctamente"
        });
    }
    catch (error) {
        console.error("Error al desactivar estudiante:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al desactivar estudiante"
        });
    }
});
router.patch("/:id/reactivar", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!req.auth?.institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, req.auth.institucionId)
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
        return (0, http_1.ok)(res, {
            message: "Estudiante reactivado correctamente",
            estudiante: result.recordset[0]
        });
    }
    catch (error) {
        console.error("Error al reactivar estudiante:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al reactivar estudiante"
        });
    }
});
exports.default = router;
