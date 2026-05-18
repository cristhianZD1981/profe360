import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";
import { hashPassword } from "../../utils/password";
import { sendEmail } from "../../services/email.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"));

const ROLES_PERMITIDOS_SUPER_ADMIN = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "PROFESOR",
  "PROFESOR_GUIA",
  "ADMINISTRATIVO",
  "PADRE_FAMILIA"
];

const ROLES_PERMITIDOS_GESTION_INSTITUCIONAL = [
  "PROFESOR",
  "PROFESOR_GUIA",
  "ADMINISTRATIVO",
  "PADRE_FAMILIA"
];

function getRolesPermitidos(currentRoles: string[]) {
  if (currentRoles.includes("SUPER_ADMIN")) {
    return ROLES_PERMITIDOS_SUPER_ADMIN;
  }

  if (
    currentRoles.includes("ADMIN_INSTITUCIONAL") ||
    currentRoles.includes("ADMINISTRATIVO")
  ) {
    return ROLES_PERMITIDOS_GESTION_INSTITUCIONAL;
  }

  return [];
}

function validarRolesAsignables(currentRoles: string[], roleNames: string[]) {
  const permitidos = getRolesPermitidos(currentRoles);
  return roleNames.every((role) => permitidos.includes(String(role)));
}

function normalizeCorreo(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCedula(value: string) {
  return String(value || "").trim();
}

function toNullableString(value: any) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildWelcomeUserHtml(params: {
  nombre: string;
  correo: string;
  numeroCedula: string;
}) {
  const nombre = escapeHtml(params.nombre);
  const correo = escapeHtml(params.correo);
  const numeroCedula = escapeHtml(params.numeroCedula);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Bienvenido a Profe360</h2>
      <p>Hola ${nombre},</p>
      <p>Se creó correctamente tu usuario en la plataforma.</p>
      <p><strong>Dirección:</strong> <a href="https://profe360cr.com">https://profe360cr.com</a></p>
      <p><strong>Usuario:</strong> ${correo}</p>
      <p><strong>Clave inicial:</strong> ${numeroCedula}</p>
      <p>Al ingresar por primera vez, el sistema te solicitará cambiar la clave.</p>
      <p style="margin-top: 24px;">Este correo es automático, por favor no responder.</p>
    </div>
  `;
}

function buildResetToCedulaHtml(params: {
  nombre: string;
  correo: string;
  numeroCedula: string;
}) {
  const nombre = escapeHtml(params.nombre);
  const correo = escapeHtml(params.correo);
  const numeroCedula = escapeHtml(params.numeroCedula);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Restablecimiento de clave - Profe360</h2>
      <p>Hola ${nombre},</p>
      <p>Un administrador restableció la clave de tu cuenta.</p>
      <p><strong>Dirección:</strong> <a href="https://profe360cr.com">https://profe360cr.com</a></p>
      <p><strong>Usuario:</strong> ${correo}</p>
      <p><strong>Clave restablecida:</strong> ${numeroCedula}</p>
      <p>Al ingresar nuevamente, el sistema te solicitará cambiar la clave.</p>
      <p style="margin-top: 24px;">Este correo es automático, por favor no responder.</p>
    </div>
  `;
}

async function enviarCorreoBienvenida(params: {
  correo: string;
  nombre: string;
  numeroCedula: string;
}) {
  try {
    const envio = await sendEmail({
      to: params.correo,
      subject: "Bienvenido a Profe360",
      html: buildWelcomeUserHtml({
        nombre: params.nombre,
        correo: params.correo,
        numeroCedula: params.numeroCedula
      }),
      text: `Hola ${params.nombre}

Se creó correctamente tu usuario en Profe360.

Dirección: https://profe360cr.com
Usuario: ${params.correo}
Clave inicial: ${params.numeroCedula}

Al ingresar por primera vez, el sistema te solicitará cambiar la clave.

Este correo es automático, por favor no responder.`
    });

    return envio;
  } catch (error) {
    console.error("No se pudo enviar el correo de bienvenida:", error);
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(500, Math.max(25, Number(req.query.pageSize || 100) || 100));
    const offset = (page - 1) * pageSize;

    const pool = await getPool();


    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = esSuperAdmin ? null : Number(req.auth?.institucionId || 0);

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("offset", sql.Int, offset)
      .input("pageSize", sql.Int, pageSize);

    const result = await request.query(`
      WITH base AS (
        SELECT
          u.UsuarioId,
          u.InstitucionId,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          u.Correo,
          u.NumeroCedula,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          u.Telefono,
          u.Cargo,
          u.Activo,
          COALESCE(STRING_AGG(r.Nombre, ', '), '') AS Roles
        FROM dbo.Usuario u
        LEFT JOIN dbo.Institucion i
          ON i.InstitucionId = u.InstitucionId
        LEFT JOIN dbo.UsuarioRol ur
          ON ur.UsuarioId = u.UsuarioId
         AND ur.Activo = 1
        LEFT JOIN dbo.Rol r
          ON r.RolId = ur.RolId
        WHERE (@institucionId IS NULL OR u.InstitucionId = @institucionId)
          AND (
            @q = '%%'
            OR u.Correo LIKE @q
            OR u.NumeroCedula LIKE @q
            OR u.Nombre LIKE @q
            OR u.PrimerApellido LIKE @q
            OR u.SegundoApellido LIKE @q
            OR u.Cargo LIKE @q
          )
        GROUP BY
          u.UsuarioId,
          u.InstitucionId,
          i.Nombre,
          i.NombreComercial,
          u.Correo,
          u.NumeroCedula,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          u.Telefono,
          u.Cargo,
          u.Activo
      )
      SELECT
        base.*,
        COUNT(1) OVER() AS TotalRegistros
      FROM base
      ORDER BY PrimerApellido, SegundoApellido, Nombre, UsuarioId
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const total = Number(result.recordset[0]?.TotalRegistros || 0);
    const items = result.recordset.map(({ TotalRegistros, ...row }: any) => row);

    return ok(res, { items, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar usuarios"
    });
  }
});

router.get("/plantilla-excel", async (req, res) => {
  try {
    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");

    const wb = XLSX.utils.book_new();

    const instrucciones = [
      {
        Campo: "correo",
        Obligatorio: "Sí",
        Descripcion: "Correo del usuario, será también el usuario para ingresar"
      },
      {
        Campo: "numeroCedula",
        Obligatorio: "Sí",
        Descripcion: "Número de cédula del usuario, será la clave inicial"
      },
      {
        Campo: "nombre",
        Obligatorio: "Sí",
        Descripcion: "Nombre del usuario"
      },
      {
        Campo: "primerApellido",
        Obligatorio: "No",
        Descripcion: "Primer apellido"
      },
      {
        Campo: "segundoApellido",
        Obligatorio: "No",
        Descripcion: "Segundo apellido"
      },
      {
        Campo: "telefono",
        Obligatorio: "No",
        Descripcion: "Teléfono"
      },
      {
        Campo: "cargo",
        Obligatorio: "No",
        Descripcion: "Cargo del usuario. Ejemplo: Directora, Profesor, Auxiliar Administrativo"
      },
      {
        Campo: "rol",
        Obligatorio: "Sí",
        Descripcion: esSuperAdmin
          ? "SUPER_ADMIN, ADMIN_INSTITUCIONAL, PROFESOR, PROFESOR_GUIA, ADMINISTRATIVO, PADRE_FAMILIA"
          : "PROFESOR, PROFESOR_GUIA, ADMINISTRATIVO, PADRE_FAMILIA"
      },
      {
        Campo: "institucionId",
        Obligatorio: esSuperAdmin ? "Sí" : "No",
        Descripcion: esSuperAdmin
          ? "Solo para SUPER_ADMIN"
          : "Se ignora para roles institucionales"
      }
    ];

    const ejemplo = [
      {
        correo: "usuario1@colegio.edu",
        numeroCedula: "123456789",
        nombre: "María",
        primerApellido: "Pérez",
        segundoApellido: "Rojas",
        telefono: "88888888",
        cargo: "Profesor",
        rol: "PROFESOR",
        institucionId: esSuperAdmin ? "1" : ""
      }
    ];

    const wsInstrucciones = XLSX.utils.json_to_sheet(instrucciones);
    const wsUsuarios = XLSX.utils.json_to_sheet(ejemplo);

    XLSX.utils.book_append_sheet(wb, wsInstrucciones, "Instrucciones");
    XLSX.utils.book_append_sheet(wb, wsUsuarios, "Usuarios");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="plantilla_usuarios.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);
  } catch (error) {
    console.error("Error generando plantilla de usuarios:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo generar la plantilla"
    });
  }
});

router.post("/importar-excel", upload.single("archivo"), async (req, res) => {
  try {
    const pool = await getPool();

    if (!req.file?.buffer) {
      return badRequest(res, "Debés adjuntar un archivo Excel");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const currentRoles = req.auth?.roles || [];
    const authInstitucionId = Number(req.auth?.institucionId || 0);

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames.includes("Usuarios")
      ? "Usuarios"
      : workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

    if (!rows.length) {
      return badRequest(res, "El archivo no contiene registros para importar");
    }

    const resultados: Array<{
      fila: number;
      correo: string;
      estado: "OK" | "ERROR";
      motivo: string;
    }> = [];

    let totalOk = 0;
    let totalError = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fila = i + 2;

      const correo = normalizeCorreo(row.correo);
      const numeroCedula = normalizeCedula(row.numeroCedula);
      const nombre = String(row.nombre || "").trim();
      const primerApellido = toNullableString(row.primerApellido);
      const segundoApellido = toNullableString(row.segundoApellido);
      const telefono = toNullableString(row.telefono);
      const cargo = toNullableString(row.cargo);
      const roleName = String(row.rol || "").trim();

      const targetInstitucionId = esSuperAdmin
        ? Number(row.institucionId || 0)
        : authInstitucionId;

      if (!correo || !numeroCedula || !nombre || !roleName) {
        resultados.push({
          fila,
          correo,
          estado: "ERROR",
          motivo: "correo, numeroCedula, nombre y rol son obligatorios"
        });
        totalError++;
        continue;
      }

      if (!validarRolesAsignables(currentRoles, [roleName])) {
        resultados.push({
          fila,
          correo,
          estado: "ERROR",
          motivo: `No tenés permisos para asignar el rol ${roleName}`
        });
        totalError++;
        continue;
      }

      if (!targetInstitucionId) {
        resultados.push({
          fila,
          correo,
          estado: "ERROR",
          motivo: "institucionId es obligatorio para este registro"
        });
        totalError++;
        continue;
      }

      try {
        const existeCorreo = await pool.request()
          .input("correo", sql.NVarChar, correo)
          .query(`
            SELECT TOP 1 UsuarioId
            FROM dbo.Usuario
            WHERE LOWER(Correo) = @correo
          `);

        if (existeCorreo.recordset.length > 0) {
          resultados.push({
            fila,
            correo,
            estado: "ERROR",
            motivo: "Ya existe un usuario con ese correo"
          });
          totalError++;
          continue;
        }

        const existeCedula = await pool.request()
          .input("numeroCedula", sql.NVarChar, numeroCedula)
          .query(`
            SELECT TOP 1 UsuarioId
            FROM dbo.Usuario
            WHERE NumeroCedula = @numeroCedula
          `);

        if (existeCedula.recordset.length > 0) {
          resultados.push({
            fila,
            correo,
            estado: "ERROR",
            motivo: "Ya existe un usuario con ese número de cédula"
          });
          totalError++;
          continue;
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();

        try {
          const hash = await hashPassword(numeroCedula);

          const insertUser = await new sql.Request(tx)
            .input("institucionId", sql.Int, targetInstitucionId)
            .input("correo", sql.NVarChar, correo)
            .input("numeroCedula", sql.NVarChar, numeroCedula)
            .input("hashPassword", sql.NVarChar, hash)
            .input("nombre", sql.NVarChar, nombre)
            .input("primerApellido", sql.NVarChar, primerApellido)
            .input("segundoApellido", sql.NVarChar, segundoApellido)
            .input("telefono", sql.NVarChar, telefono)
            .input("cargo", sql.NVarChar, cargo)
            .query(`
              INSERT INTO dbo.Usuario
              (
                InstitucionId,
                Correo,
                NumeroCedula,
                HashPassword,
                Nombre,
                PrimerApellido,
                SegundoApellido,
                Telefono,
                Cargo,
                Activo,
                DebeCambiarPassword
              )
              OUTPUT
                INSERTED.UsuarioId,
                INSERTED.Correo,
                INSERTED.NumeroCedula,
                INSERTED.Nombre,
                INSERTED.PrimerApellido
              VALUES
              (
                @institucionId,
                @correo,
                @numeroCedula,
                @hashPassword,
                @nombre,
                @primerApellido,
                @segundoApellido,
                @telefono,
                @cargo,
                1,
                1
              )
            `);

          const createdUser = insertUser.recordset[0];

          const insertRole = await new sql.Request(tx)
            .input("usuarioId", sql.Int, createdUser.UsuarioId)
            .input("roleName", sql.NVarChar, roleName)
            .query(`
              INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
              OUTPUT INSERTED.UsuarioRolId
              SELECT @usuarioId, RolId, 1
              FROM dbo.Rol
              WHERE Nombre = @roleName
            `);

          if (!insertRole.recordset.length) {
            throw new Error(`El rol ${roleName} no existe`);
          }

          await tx.commit();

          const nombreCompleto =
            `${createdUser.Nombre || ""} ${createdUser.PrimerApellido || ""}`.trim() ||
            "Usuario";

          await enviarCorreoBienvenida({
            correo: createdUser.Correo,
            nombre: nombreCompleto,
            numeroCedula: createdUser.NumeroCedula
          });

          resultados.push({
            fila,
            correo,
            estado: "OK",
            motivo: "Usuario importado correctamente"
          });
          totalOk++;
        } catch (innerError: any) {
          try {
            await tx.rollback();
          } catch {}

          resultados.push({
            fila,
            correo,
            estado: "ERROR",
            motivo:
              innerError?.message || "No se pudo importar el usuario"
          });
          totalError++;
        }
      } catch (error: any) {
        resultados.push({
          fila,
          correo,
          estado: "ERROR",
          motivo: error?.message || "No se pudo procesar el registro"
        });
        totalError++;
      }
    }

    return ok(
      res,
      {
        totalRegistros: rows.length,
        totalOk,
        totalError,
        resultados
      },
      "Importación procesada correctamente"
    );
  } catch (error) {
    console.error("Error importando usuarios:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo importar el archivo Excel"
    });
  }
});

router.post("/", async (req, res) => {
  const txPool = await getPool();
  const tx = new sql.Transaction(txPool);

  try {
    const {
      correo,
      numeroCedula,
      nombre,
      primerApellido,
      segundoApellido,
      telefono,
      cargo,
      institucionId,
      roleNames = []
    } = req.body;

    const correoNormalizado = normalizeCorreo(correo);
    const numeroCedulaNormalizado = normalizeCedula(numeroCedula);

    if (!correoNormalizado || !numeroCedulaNormalizado || !nombre) {
      return badRequest(res, "correo, numeroCedula y nombre son obligatorios");
    }

    if (!Array.isArray(roleNames) || roleNames.length === 0) {
      return badRequest(res, "Debe seleccionar al menos un rol");
    }

    if (!validarRolesAsignables(req.auth?.roles || [], roleNames)) {
      return res.status(403).json({
        ok: false,
        message: "No tenés permisos para asignar uno o más de los roles seleccionados"
      });
    }

    const targetInstitucionId = (req.auth?.roles || []).includes("SUPER_ADMIN")
      ? Number(institucionId || req.auth?.institucionId || 0)
      : Number(req.auth?.institucionId || 0);

    if (!targetInstitucionId) {
      return badRequest(res, "institucionId es obligatorio");
    }

    const pool = await getPool();

    const existeCorreo = await pool.request()
      .input("correo", sql.NVarChar, correoNormalizado)
      .query(`
        SELECT TOP 1 UsuarioId
        FROM dbo.Usuario
        WHERE LOWER(Correo) = @correo
      `);

    if (existeCorreo.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "USUARIO_DUPLICADO",
        message: "Ya existe un usuario con ese correo"
      });
    }

    const existeCedula = await pool.request()
      .input("numeroCedula", sql.NVarChar, numeroCedulaNormalizado)
      .query(`
        SELECT TOP 1 UsuarioId
        FROM dbo.Usuario
        WHERE NumeroCedula = @numeroCedula
      `);

    if (existeCedula.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "CEDULA_DUPLICADA",
        message: "Ya existe un usuario con ese número de cédula"
      });
    }

    await tx.begin();

    const hash = await hashPassword(numeroCedulaNormalizado);

    const insertUser = await new sql.Request(tx)
      .input("institucionId", sql.Int, targetInstitucionId)
      .input("correo", sql.NVarChar, correoNormalizado)
      .input("numeroCedula", sql.NVarChar, numeroCedulaNormalizado)
      .input("hashPassword", sql.NVarChar, hash)
      .input("nombre", sql.NVarChar, nombre)
      .input("primerApellido", sql.NVarChar, primerApellido || null)
      .input("segundoApellido", sql.NVarChar, segundoApellido || null)
       .input("telefono", sql.NVarChar, telefono || null)
      .input("cargo", sql.NVarChar, cargo || null)
      .query(`
        INSERT INTO dbo.Usuario
        (
          InstitucionId,
          Correo,
          NumeroCedula,
          HashPassword,
          Nombre,
          PrimerApellido,
          SegundoApellido,
          Telefono,
          Cargo,
          Activo,
          DebeCambiarPassword
        )
        OUTPUT
          INSERTED.UsuarioId,
          INSERTED.InstitucionId,
          INSERTED.Correo,
          INSERTED.NumeroCedula,
          INSERTED.Nombre,
          INSERTED.PrimerApellido,
          INSERTED.Cargo,
          INSERTED.Activo
        VALUES
        (
          @institucionId,
          @correo,
          @numeroCedula,
          @hashPassword,
          @nombre,
          @primerApellido,
          @segundoApellido,
          @telefono,
          @cargo,
          1,
          1
        )
      `);

    const createdUser = insertUser.recordset[0];

    for (const roleName of roleNames) {
      await new sql.Request(tx)
        .input("usuarioId", sql.Int, createdUser.UsuarioId)
        .input("roleName", sql.NVarChar, String(roleName))
        .query(`
          INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
          SELECT @usuarioId, RolId, 1
          FROM dbo.Rol
          WHERE Nombre = @roleName
        `);
    }

    await tx.commit();

    let message = "Usuario creado correctamente";

    const nombreCompleto =
      `${createdUser.Nombre || ""} ${createdUser.PrimerApellido || ""}`.trim() ||
      "Usuario";

    const envio = await enviarCorreoBienvenida({
      correo: createdUser.Correo,
      nombre: nombreCompleto,
      numeroCedula: createdUser.NumeroCedula
    });

    if (envio && (envio as any).modo === "simulado") {
      message =
        "Usuario creado correctamente. El correo quedó en modo simulado porque falta configurar Resend";
    }

    return created(res, createdUser, message);
  } catch (error: any) {
    try {
      if ((tx as any)?._aborted === false || (tx as any)?._aborted == null) {
        await tx.rollback();
      }
    } catch {}

    console.error("Error al crear usuario:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "USUARIO_DUPLICADO",
        message: "Ya existe un usuario con ese correo o número de cédula"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear usuario"
    });
  }
});

router.put("/:id", async (req, res) => {
  const txPool = await getPool();
  const tx = new sql.Transaction(txPool);

  try {
    const id = Number(req.params.id);
    const {
      correo,
      numeroCedula,
      nombre,
      primerApellido,
      segundoApellido,
      telefono,
      cargo,
      roleNames = [],
      institucionId
    } = req.body;

    const correoNormalizado = normalizeCorreo(correo);
    const numeroCedulaNormalizado = normalizeCedula(numeroCedula);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    if (!correoNormalizado || !numeroCedulaNormalizado || !nombre) {
      return badRequest(res, "correo, numeroCedula y nombre son obligatorios");
    }

    if (!Array.isArray(roleNames) || roleNames.length === 0) {
      return badRequest(res, "Debe seleccionar al menos un rol");
    }

    if (!validarRolesAsignables(req.auth?.roles || [], roleNames)) {
      return res.status(403).json({
        ok: false,
        message: "No tenés permisos para asignar uno o más de los roles seleccionados"
      });
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const targetInstitucionId = esSuperAdmin
      ? Number(institucionId || req.auth?.institucionId || 0)
      : Number(req.auth?.institucionId || 0);

    if (!targetInstitucionId) {
      return badRequest(res, "institucionId es obligatorio");
    }

    const pool = await getPool();

    const existeCorreo = await pool.request()
      .input("correo", sql.NVarChar, correoNormalizado)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 UsuarioId
        FROM dbo.Usuario
        WHERE LOWER(Correo) = @correo
          AND UsuarioId <> @id
      `);

    if (existeCorreo.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "USUARIO_DUPLICADO",
        message: "Ya existe otro usuario con ese correo"
      });
    }

    const existeCedula = await pool.request()
      .input("numeroCedula", sql.NVarChar, numeroCedulaNormalizado)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 UsuarioId
        FROM dbo.Usuario
        WHERE NumeroCedula = @numeroCedula
          AND UsuarioId <> @id
      `);

    if (existeCedula.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "CEDULA_DUPLICADA",
        message: "Ya existe otro usuario con ese número de cédula"
      });
    }

    await tx.begin();

    const updateResult = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("institucionFiltro", sql.Int, esSuperAdmin ? null : targetInstitucionId)
      .input("institucionId", sql.Int, targetInstitucionId)
      .input("correo", sql.NVarChar, correoNormalizado)
      .input("numeroCedula", sql.NVarChar, numeroCedulaNormalizado)
      .input("nombre", sql.NVarChar, nombre)
      .input("primerApellido", sql.NVarChar, primerApellido || null)
      .input("segundoApellido", sql.NVarChar, segundoApellido || null)
       .input("telefono", sql.NVarChar, telefono || null)
      .input("cargo", sql.NVarChar, cargo || null)
      .query(`
        UPDATE dbo.Usuario
        SET
          InstitucionId = @institucionId,
          Correo = @correo,
          NumeroCedula = @numeroCedula,
          Nombre = @nombre,
          PrimerApellido = @primerApellido,
          SegundoApellido = @segundoApellido,
          Telefono = @telefono,
          Cargo = @cargo,
          UpdatedAt = SYSDATETIME()
        OUTPUT
          INSERTED.UsuarioId,
          INSERTED.InstitucionId,
          INSERTED.Correo,
          INSERTED.NumeroCedula,
          INSERTED.Nombre,
          INSERTED.PrimerApellido,
          INSERTED.Cargo,
          INSERTED.Activo
        WHERE UsuarioId = @id
          AND (@institucionFiltro IS NULL OR InstitucionId = @institucionFiltro)
      `);

    if (!updateResult.recordset.length) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    await new sql.Request(tx)
      .input("usuarioId", sql.Int, id)
      .query(`
        DELETE FROM dbo.UsuarioRol
        WHERE UsuarioId = @usuarioId
      `);

    for (const roleName of roleNames) {
      await new sql.Request(tx)
        .input("usuarioId", sql.Int, id)
        .input("roleName", sql.NVarChar, String(roleName))
        .query(`
          INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
          SELECT @usuarioId, RolId, 1
          FROM dbo.Rol
          WHERE Nombre = @roleName
        `);
    }

    await tx.commit();

    return ok(res, updateResult.recordset[0], "Usuario actualizado correctamente");
  } catch (error: any) {
    try {
      if ((tx as any)?._aborted === false || (tx as any)?._aborted == null) {
        await tx.rollback();
      }
    } catch {}

    console.error("Error al actualizar usuario:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "USUARIO_DUPLICADO",
        message: "Ya existe otro usuario con ese correo o número de cédula"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar usuario"
    });
  }
});

router.post("/:id/restablecer-clave", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = Number(req.auth?.institucionId || 0);
    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .query(`
        SELECT TOP 1
          u.UsuarioId,
          u.Correo,
          u.NumeroCedula,
          u.Nombre,
          u.PrimerApellido,
          u.Activo
        FROM dbo.Usuario u
        WHERE u.UsuarioId = @id
          AND (@institucionId IS NULL OR u.InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    const user = result.recordset[0];

    if (!user.Activo) {
      return res.status(400).json({
        ok: false,
        message: "No se puede restablecer la clave de un usuario inactivo"
      });
    }

    if (!user.Correo || !user.NumeroCedula) {
      return res.status(400).json({
        ok: false,
        message: "El usuario debe tener correo y número de cédula para restablecer la clave"
      });
    }

    const hash = await hashPassword(String(user.NumeroCedula).trim());

    await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .input("hashPassword", sql.NVarChar, hash)
      .query(`
        UPDATE dbo.Usuario
        SET
          HashPassword = @hashPassword,
          DebeCambiarPassword = 1,
          UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @id
          AND (@institucionId IS NULL OR InstitucionId = @institucionId)
      `);

    const nombre = `${user.Nombre || ""} ${user.PrimerApellido || ""}`.trim() || "Usuario";

    await sendEmail({
      to: user.Correo,
      subject: "Restablecimiento de clave - Profe360",
      html: buildResetToCedulaHtml({
        nombre,
        correo: user.Correo,
        numeroCedula: String(user.NumeroCedula).trim()
      }),
      text: `Hola ${nombre}

Un administrador restableció la clave de tu cuenta en Profe360.

Dirección: https://profe360cr.com
Usuario: ${user.Correo}
Clave restablecida: ${String(user.NumeroCedula).trim()}

Al ingresar nuevamente, el sistema te solicitará cambiar la clave.

Este correo es automático, por favor no responder.`
    });

    return ok(
      res,
      {
        enviado: true,
        usuarioId: user.UsuarioId,
        correo: user.Correo
      },
      `La clave fue restablecida a la cédula y se notificó a ${user.Correo}`
    );
  } catch (error) {
    console.error("Error al restablecer la clave del usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al restablecer la clave del usuario"
    });
  }
});

router.patch("/:id/inactivar", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = Number(req.auth?.institucionId || 0);

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .query(`
        UPDATE dbo.Usuario
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.UsuarioId
        WHERE UsuarioId = @id
          AND (@institucionId IS NULL OR InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    return ok(res, { UsuarioId: id }, "Usuario inactivado correctamente");
  } catch (error) {
    console.error("Error al inactivar usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al inactivar usuario"
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = Number(req.auth?.institucionId || 0);

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .query(`
        UPDATE dbo.Usuario
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.UsuarioId
        WHERE UsuarioId = @id
          AND (@institucionId IS NULL OR InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    return ok(res, { UsuarioId: id }, "Usuario inactivado correctamente");
  } catch (error) {
    console.error("Error al inactivar usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al inactivar usuario"
    });
  }
});

router.delete("/:id/eliminar", async (req, res) => {
  const txPool = await getPool();
  const tx = new sql.Transaction(txPool);

  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = Number(req.auth?.institucionId || 0);

    await tx.begin();

    const exists = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .query(`
        SELECT TOP 1 UsuarioId
        FROM dbo.Usuario
        WHERE UsuarioId = @id
          AND (@institucionId IS NULL OR InstitucionId = @institucionId)
      `);

    if (!exists.recordset.length) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.UsuarioResetPasswordToken
        WHERE UsuarioId = @id
      `);

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.UsuarioRol
        WHERE UsuarioId = @id
      `);

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.Usuario
        WHERE UsuarioId = @id
      `);

    await tx.commit();

    return ok(res, { UsuarioId: id }, "Usuario eliminado correctamente");
  } catch (error: any) {
    try {
      await tx.rollback();
    } catch {}

    console.error("Error eliminando usuario:", error);

    if (error?.number === 547) {
      return res.status(400).json({
        ok: false,
        message:
          "No se puede eliminar el usuario porque tiene información relacionada en el sistema"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al eliminar el usuario"
    });
  }
});

router.patch("/:id/reactivar", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = Number(req.auth?.institucionId || 0);

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, esSuperAdmin ? null : institucionId)
      .query(`
        UPDATE dbo.Usuario
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.UsuarioId
        WHERE UsuarioId = @id
          AND (@institucionId IS NULL OR InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    return ok(res, { UsuarioId: id }, "Usuario reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar usuario"
    });
  }
});

export default router;
