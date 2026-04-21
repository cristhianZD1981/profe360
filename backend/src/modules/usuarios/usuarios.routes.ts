import { Router } from "express";
import { randomBytes, createHash } from "crypto";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";
import { hashPassword } from "../../utils/password";
import { sendEmail } from "../../services/email.service";
import { env } from "../../config/env";

const router = Router();
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

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildResetLink(token: string) {
  const baseUrl = String(env.frontendUrl || "https://profe360cr.com").replace(/\/+$/, "");
  return `${baseUrl}/restablecer-clave?token=${encodeURIComponent(token)}`;
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

function buildAdminResetHtml(params: {
  nombre: string;
  correo: string;
  link: string;
}) {
  const nombre = escapeHtml(params.nombre);
  const correo = escapeHtml(params.correo);
  const link = escapeHtml(params.link);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Restablecimiento de clave - Profe360</h2>
      <p>Hola ${nombre},</p>
      <p>Un administrador generó un enlace para restablecer la clave de tu cuenta.</p>
      <p><strong>Usuario:</strong> ${correo}</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#16b5d9;color:#04111f;border-radius:8px;text-decoration:none;font-weight:700;">
          Restablecer clave
        </a>
      </p>
      <p>En la pantalla se te pedirá tu correo, tu número de cédula y la nueva clave.</p>
      <p style="margin-top: 24px;">Este correo es automático, por favor no responder.</p>
    </div>
  `;
}

async function createPasswordResetToken(usuarioId: number) {
  const pool = await getPool();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await pool.request()
    .input("usuarioId", sql.Int, usuarioId)
    .query(`
      UPDATE dbo.UsuarioResetPasswordToken
      SET UsedAt = SYSDATETIME()
      WHERE UsuarioId = @usuarioId
        AND UsedAt IS NULL
    `);

  await pool.request()
    .input("usuarioId", sql.Int, usuarioId)
    .input("tokenHash", sql.NVarChar, tokenHash)
    .input("expiresAt", sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.UsuarioResetPasswordToken
      (
        UsuarioId,
        TokenHash,
        ExpiresAt
      )
      VALUES
      (
        @usuarioId,
        @tokenHash,
        @expiresAt
      )
    `);

  return token;
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    const esSuperAdmin = (req.auth?.roles || []).includes("SUPER_ADMIN");
    const institucionId = esSuperAdmin ? null : Number(req.auth?.institucionId || 0);

    const pool = await getPool();
    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`);

    const result = await request.query(`
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
        u.Activo
      ORDER BY u.UsuarioId DESC
    `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar usuarios"
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

    try {
      const nombreCompleto =
        `${createdUser.Nombre || ""} ${createdUser.PrimerApellido || ""}`.trim() ||
        "Usuario";

      const envio = await sendEmail({
        to: createdUser.Correo,
        subject: "Bienvenido a Profe360",
        html: buildWelcomeUserHtml({
          nombre: nombreCompleto,
          correo: createdUser.Correo,
          numeroCedula: createdUser.NumeroCedula
        }),
        text: `Hola ${nombreCompleto}

Se creó correctamente tu usuario en Profe360.

Dirección: https://profe360cr.com
Usuario: ${createdUser.Correo}
Clave inicial: ${createdUser.NumeroCedula}

Al ingresar por primera vez, el sistema te solicitará cambiar la clave.

Este correo es automático, por favor no responder.`
      });

      if (envio.modo === "simulado") {
        message =
          "Usuario creado correctamente. El correo quedó en modo simulado porque falta configurar Resend";
      }
    } catch (mailError) {
      console.error("No se pudo enviar el correo de bienvenida:", mailError);
      message =
        "Usuario creado correctamente, pero no se pudo enviar el correo de bienvenida";
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
          UpdatedAt = SYSDATETIME()
        OUTPUT
          INSERTED.UsuarioId,
          INSERTED.InstitucionId,
          INSERTED.Correo,
          INSERTED.NumeroCedula,
          INSERTED.Nombre,
          INSERTED.PrimerApellido,
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

    const token = await createPasswordResetToken(user.UsuarioId);
    const link = buildResetLink(token);
    const nombre = `${user.Nombre || ""} ${user.PrimerApellido || ""}`.trim() || "Usuario";

    await sendEmail({
      to: user.Correo,
      subject: "Restablecimiento de clave - Profe360",
      html: buildAdminResetHtml({
        nombre,
        correo: user.Correo,
        link
      }),
      text: `Hola ${nombre}

Un administrador generó un enlace para restablecer la clave de tu cuenta en Profe360.

Usuario: ${user.Correo}
Enlace: ${link}

En la pantalla se te pedirá tu correo, tu número de cédula y la nueva clave.

Este correo es automático, por favor no responder.`
    });

    return ok(
      res,
      {
        enviado: true,
        usuarioId: user.UsuarioId,
        correo: user.Correo
      },
      `Se envió el enlace de restablecimiento a ${user.Correo}`
    );
  } catch (error) {
    console.error("Error al restablecer la clave del usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al restablecer la clave del usuario"
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

    return ok(res, { UsuarioId: id }, "Usuario desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar usuario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar usuario"
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