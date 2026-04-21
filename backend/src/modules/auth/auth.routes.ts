import { Router } from "express";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { getPool, sql } from "../../config/database";
import { env } from "../../config/env";
import { comparePassword, hashPassword } from "../../utils/password";
import { badRequest, ok } from "../../utils/http";
import { requireAuth } from "../../middlewares/auth.middleware";
import { sendEmail } from "../../services/email.service";

const router = Router();

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

function buildForgotPasswordHtml(params: {
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
      <p>Recibimos una solicitud para restablecer la clave de tu cuenta.</p>
      <p><strong>Usuario:</strong> ${correo}</p>
      <p>Para continuar, hacé clic en el siguiente enlace:</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#16b5d9;color:#04111f;border-radius:8px;text-decoration:none;font-weight:700;">
          Restablecer clave
        </a>
      </p>
      <p>En la pantalla se te pedirá tu correo, tu número de cédula y la nueva clave.</p>
      <p>Si vos no hiciste esta solicitud, podés ignorar este mensaje.</p>
      <p style="margin-top: 24px;">Este correo es automático, por favor no responder.</p>
    </div>
  `;
}

function buildPasswordChangedHtml(params: {
  nombre: string;
  correo: string;
}) {
  const nombre = escapeHtml(params.nombre);
  const correo = escapeHtml(params.correo);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Cambio de clave - Profe360</h2>
      <p>Hola ${nombre},</p>
      <p>Te informamos que la clave de la cuenta <strong>${correo}</strong> fue cambiada correctamente.</p>
      <p>Si vos no realizaste este cambio, contactá al administrador de inmediato.</p>
      <p style="margin-top: 24px;">Este correo es automático, por favor no responder.</p>
    </div>
  `;
}

async function getUserPayloadById(usuarioId: number) {
  const pool = await getPool();

  const userResult = await pool.request()
    .input("usuarioId", sql.Int, usuarioId)
    .query(`
      SELECT TOP 1
        u.UsuarioId,
        u.InstitucionId,
        u.SedeId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.NumeroCedula,
        u.Activo,
        ISNULL(u.DebeCambiarPassword, 0) AS DebeCambiarPassword,
        i.Nombre AS InstitucionNombre,
        i.NombreComercial AS InstitucionNombreComercial,
        i.LogoUrl AS InstitucionLogoUrl
      FROM dbo.Usuario u
      LEFT JOIN dbo.Institucion i
        ON i.InstitucionId = u.InstitucionId
      WHERE u.UsuarioId = @usuarioId
    `);

  if (!userResult.recordset.length) return null;
  const user = userResult.recordset[0];

  const rolesResult = await pool.request()
    .input("usuarioId", sql.Int, user.UsuarioId)
    .query(`
      SELECT r.Nombre
      FROM dbo.UsuarioRol ur
      INNER JOIN dbo.Rol r
        ON r.RolId = ur.RolId
      WHERE ur.UsuarioId = @usuarioId
        AND ur.Activo = 1
    `);

  return {
    userId: user.UsuarioId,
    correo: user.Correo,
    institucionId: user.InstitucionId,
    sedeId: user.SedeId,
    roles: rolesResult.recordset.map((row) => row.Nombre as string),
    nombre: `${user.Nombre ?? ""} ${user.PrimerApellido ?? ""}`.trim(),
    institucionNombre: user.InstitucionNombre,
    institucionNombreComercial: user.InstitucionNombreComercial,
    institucionLogoUrl: user.InstitucionLogoUrl,
    numeroCedula: user.NumeroCedula ?? null,
    debeCambiarPassword: !!user.DebeCambiarPassword
  };
}

async function getUserByCorreo(correo: string) {
  const pool = await getPool();

  const result = await pool.request()
    .input("correo", sql.NVarChar, normalizeCorreo(correo))
    .query(`
      SELECT TOP 1
        u.UsuarioId,
        u.InstitucionId,
        u.SedeId,
        u.Correo,
        u.HashPassword,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.NumeroCedula,
        u.Activo,
        ISNULL(u.DebeCambiarPassword, 0) AS DebeCambiarPassword,
        i.Nombre AS InstitucionNombre,
        i.NombreComercial AS InstitucionNombreComercial,
        i.LogoUrl AS InstitucionLogoUrl
      FROM dbo.Usuario u
      LEFT JOIN dbo.Institucion i
        ON i.InstitucionId = u.InstitucionId
      WHERE LOWER(u.Correo) = @correo
    `);

  return result.recordset[0] || null;
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

router.post("/login", async (req, res) => {
  try {
    const correo = normalizeCorreo(req.body?.correo);
    const password = String(req.body?.password || "");

    if (!correo || !password) {
      return badRequest(res, "correo y password son obligatorios");
    }

    const user = await getUserByCorreo(correo);

    if (!user) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    if (!user.Activo) {
      return res.status(403).json({ ok: false, message: "La cuenta está inactiva" });
    }

    const passwordOk = await comparePassword(password, String(user.HashPassword || ""));
    if (!passwordOk) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    const rolesResult = await getPool().then((pool) =>
      pool.request()
        .input("usuarioId", sql.Int, user.UsuarioId)
        .query(`
          SELECT r.Nombre
          FROM dbo.UsuarioRol ur
          INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
          WHERE ur.UsuarioId = @usuarioId AND ur.Activo = 1
        `)
    );

    const payload = {
      userId: user.UsuarioId,
      correo: user.Correo,
      institucionId: user.InstitucionId,
      sedeId: user.SedeId,
      roles: rolesResult.recordset.map((row) => row.Nombre as string),
      nombre: `${user.Nombre ?? ""} ${user.PrimerApellido ?? ""}`.trim(),
      institucionNombre: user.InstitucionNombre,
      institucionNombreComercial: user.InstitucionNombreComercial,
      institucionLogoUrl: user.InstitucionLogoUrl,
      numeroCedula: user.NumeroCedula ?? null,
      debeCambiarPassword: !!user.DebeCambiarPassword
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "dev_secret_change_me",
      { expiresIn: "8h" }
    );

    return ok(res, { token, user: payload });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ ok: false, message: "Error interno al iniciar sesión" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const correo = normalizeCorreo(req.body?.correo);

    if (!correo) {
      return badRequest(res, "correo es obligatorio");
    }

    const user = await getUserByCorreo(correo);

    if (!user || !user.Activo || !user.NumeroCedula) {
      return ok(
        res,
        { enviado: true },
        "Si el correo existe, se enviará un enlace de recuperación"
      );
    }

    const token = await createPasswordResetToken(user.UsuarioId);
    const link = buildResetLink(token);
    const nombre = `${user.Nombre || ""} ${user.PrimerApellido || ""}`.trim() || "Usuario";

    await sendEmail({
      to: user.Correo,
      subject: "Restablecimiento de clave - Profe360",
      html: buildForgotPasswordHtml({
        nombre,
        correo: user.Correo,
        link
      }),
      text: `Hola ${nombre}

Recibimos una solicitud para restablecer la clave de tu cuenta en Profe360.

Usuario: ${user.Correo}
Enlace: ${link}

En la pantalla se te pedirá tu correo, tu número de cédula y la nueva clave.

Este correo es automático, por favor no responder.`
    });

    return ok(
      res,
      { enviado: true },
      "Si el correo existe, se enviará un enlace de recuperación"
    );
  } catch (error) {
    console.error("Error en forgot-password:", error);
    return res.status(500).json({ ok: false, message: "Error interno al recuperar la clave" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const correo = normalizeCorreo(req.body?.correo);
    const numeroCedula = normalizeCedula(req.body?.numeroCedula);
    const newPassword = String(req.body?.newPassword || "");

    if (!token || !correo || !numeroCedula || !newPassword) {
      return badRequest(
        res,
        "token, correo, numeroCedula y newPassword son obligatorios"
      );
    }

    const tokenHash = hashResetToken(token);
    const pool = await getPool();

    const result = await pool.request()
      .input("tokenHash", sql.NVarChar, tokenHash)
      .input("correo", sql.NVarChar, correo)
      .input("numeroCedula", sql.NVarChar, numeroCedula)
      .query(`
        SELECT TOP 1
          t.UsuarioResetPasswordTokenId,
          t.UsuarioId,
          u.Correo,
          u.NumeroCedula,
          u.Nombre,
          u.PrimerApellido,
          u.Activo
        FROM dbo.UsuarioResetPasswordToken t
        INNER JOIN dbo.Usuario u
          ON u.UsuarioId = t.UsuarioId
        WHERE t.TokenHash = @tokenHash
          AND t.UsedAt IS NULL
          AND t.ExpiresAt >= SYSDATETIME()
          AND LOWER(u.Correo) = @correo
          AND u.NumeroCedula = @numeroCedula
      `);

    if (!result.recordset.length) {
      return res.status(400).json({
        ok: false,
        message: "El enlace o los datos de validación no son válidos"
      });
    }

    const row = result.recordset[0];

    if (!row.Activo) {
      return res.status(403).json({
        ok: false,
        message: "La cuenta está inactiva"
      });
    }

    const hash = await hashPassword(newPassword);

    await pool.request()
      .input("usuarioId", sql.Int, row.UsuarioId)
      .input("hashPassword", sql.NVarChar, hash)
      .query(`
        UPDATE dbo.Usuario
        SET
          HashPassword = @hashPassword,
          DebeCambiarPassword = 0,
          UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);

    await pool.request()
      .input("tokenHash", sql.NVarChar, tokenHash)
      .query(`
        UPDATE dbo.UsuarioResetPasswordToken
        SET UsedAt = SYSDATETIME()
        WHERE TokenHash = @tokenHash
      `);

    const nombre = `${row.Nombre || ""} ${row.PrimerApellido || ""}`.trim() || "Usuario";

    try {
      await sendEmail({
        to: row.Correo,
        subject: "Cambio de clave - Profe360",
        html: buildPasswordChangedHtml({
          nombre,
          correo: row.Correo
        }),
        text: `Hola ${nombre}

Te informamos que la clave de la cuenta ${row.Correo} fue cambiada correctamente.

Si vos no realizaste este cambio, contactá al administrador de inmediato.

Este correo es automático, por favor no responder.`
      });
    } catch (mailError) {
      console.error("No se pudo enviar el correo de confirmación de cambio de clave:", mailError);
    }

    return ok(res, { actualizado: true }, "Clave restablecida correctamente");
  } catch (error) {
    console.error("Error en reset-password:", error);
    return res.status(500).json({ ok: false, message: "Error interno al restablecer la clave" });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const usuarioId = req.auth?.userId;

    if (!usuarioId) {
      return res.status(401).json({ ok: false, message: "No autenticado" });
    }

    if (!currentPassword || !newPassword) {
      return badRequest(res, "currentPassword y newPassword son obligatorios");
    }

    const pool = await getPool();
    const result = await pool.request()
      .input("usuarioId", sql.Int, usuarioId)
      .query(`
        SELECT TOP 1
          UsuarioId,
          Correo,
          HashPassword,
          Nombre,
          PrimerApellido
        FROM dbo.Usuario
        WHERE UsuarioId = @usuarioId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    const user = result.recordset[0];
    const okPassword = await comparePassword(currentPassword, user.HashPassword);

    if (!okPassword) {
      return res.status(400).json({ ok: false, message: "La clave actual no es correcta" });
    }

    const hash = await hashPassword(newPassword);

    await pool.request()
      .input("usuarioId", sql.Int, usuarioId)
      .input("hashPassword", sql.NVarChar, hash)
      .query(`
        UPDATE dbo.Usuario
        SET
          HashPassword = @hashPassword,
          DebeCambiarPassword = 0,
          UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);

    try {
      const nombre = `${user.Nombre || ""} ${user.PrimerApellido || ""}`.trim() || "Usuario";

      await sendEmail({
        to: user.Correo,
        subject: "Cambio de clave - Profe360",
        html: buildPasswordChangedHtml({
          nombre,
          correo: user.Correo
        }),
        text: `Hola ${nombre}

Te informamos que la clave de la cuenta ${user.Correo} fue cambiada correctamente.

Si vos no realizaste este cambio, contactá al administrador de inmediato.

Este correo es automático, por favor no responder.`
      });
    } catch (mailError) {
      console.error("No se pudo enviar correo de confirmación de cambio de clave:", mailError);
    }

    const payload = await getUserPayloadById(usuarioId);
    const token = jwt.sign(
      payload as object,
      process.env.JWT_SECRET || "dev_secret_change_me",
      { expiresIn: "8h" }
    );

    return ok(res, { token, user: payload }, "Clave actualizada correctamente");
  } catch (error) {
    console.error("Error en change-password:", error);
    return res.status(500).json({ ok: false, message: "Error interno al cambiar la clave" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.auth?.userId) {
      return res.status(401).json({ ok: false, message: "No autenticado" });
    }

    const payload = await getUserPayloadById(req.auth.userId);
    if (!payload) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    return ok(res, payload);
  } catch (error) {
    console.error("Error en /me:", error);
    return res.status(500).json({ ok: false, message: "Error interno al consultar el usuario" });
  }
});

export default router;