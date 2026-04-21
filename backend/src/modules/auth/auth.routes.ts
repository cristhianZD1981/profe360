import { Router } from "express";
import jwt from "jsonwebtoken";
import { getPool, sql } from "../../config/database";
import { comparePassword, hashPassword } from "../../utils/password";
import { badRequest, ok } from "../../utils/http";
import { requireAuth } from "../../middlewares/auth.middleware";
import { sendEmail } from "../../services/email.service";

const router = Router();

function randomTempPassword() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `Temp${n}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildForgotPasswordHtml(params: {
  nombreEncargado?: string | null;
  usuario: string;
  claveTemporal: string;
}) {
  const nombre =
    params.nombreEncargado && params.nombreEncargado.trim()
      ? escapeHtml(params.nombreEncargado.trim())
      : "Encargado";
  const usuario = escapeHtml(params.usuario);
  const claveTemporal = escapeHtml(params.claveTemporal);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Recuperación de acceso - Profe360</h2>
      <p>Hola ${nombre},</p>
      <p>Se generó una clave temporal para ingresar a Profe360.</p>
      <p><strong>Usuario:</strong> ${usuario}</p>
      <p><strong>Clave temporal:</strong> ${claveTemporal}</p>
      <p>Por seguridad, al ingresar se te solicitará cambiar la clave.</p>
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
    debeCambiarPassword: !!user.DebeCambiarPassword
  };
}

router.post("/login", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return badRequest(res, "correo y password son obligatorios");
    }

    const pool = await getPool();

    const userResult = await pool.request()
      .input("correo", sql.NVarChar, correo)
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
          u.Activo,
          ISNULL(u.DebeCambiarPassword, 0) AS DebeCambiarPassword,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.LogoUrl AS InstitucionLogoUrl
        FROM dbo.Usuario u
        LEFT JOIN dbo.Institucion i
          ON i.InstitucionId = u.InstitucionId
        WHERE u.Correo = @correo
      `);

    if (!userResult.recordset.length) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    const user = userResult.recordset[0];

    if (!user.Activo) {
      return res.status(403).json({ ok: false, message: "La cuenta está inactiva" });
    }

    const passwordOk = await comparePassword(password, user.HashPassword);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    const rolesResult = await pool.request()
      .input("usuarioId", sql.Int, user.UsuarioId)
      .query(`
        SELECT r.Nombre
        FROM dbo.UsuarioRol ur
        INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
        WHERE ur.UsuarioId = @usuarioId AND ur.Activo = 1
      `);

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
    const { correo } = req.body;
    if (!correo) return badRequest(res, "correo es obligatorio");

    const pool = await getPool();

    const result = await pool.request()
      .input("correo", sql.NVarChar, correo)
      .query(`
        SELECT TOP 1
          u.UsuarioId,
          u.Correo,
          e.EstudianteId,
          e.Identificacion AS IdentificacionEstudiante,
          enc.Correo AS CorreoEncargado,
          enc.Nombre AS NombreEncargado,
          enc.PrimerApellido AS PrimerApellidoEncargado
        FROM dbo.Usuario u
        INNER JOIN dbo.UsuarioRol ur ON ur.UsuarioId = u.UsuarioId AND ur.Activo = 1
        INNER JOIN dbo.Rol r ON r.RolId = ur.RolId AND r.Nombre = N'PADRE_FAMILIA'
        LEFT JOIN dbo.Estudiante e ON e.Correo = u.Correo AND e.Activo = 1
        OUTER APPLY (
          SELECT TOP 1 ec.Correo, ec.Nombre, ec.PrimerApellido
          FROM dbo.EstudianteEncargado ee
          INNER JOIN dbo.Encargado ec ON ec.EncargadoId = ee.EncargadoId
          WHERE ee.EstudianteId = e.EstudianteId
            AND ISNULL(ee.Activo, 1) = 1
            AND ec.Correo IS NOT NULL
          ORDER BY CASE WHEN ee.EsPrincipal = 1 THEN 0 ELSE 1 END, ee.EstudianteEncargadoId DESC
        ) enc
        WHERE u.Correo = @correo
      `);

    if (!result.recordset.length) {
      return ok(res, { enviado: true }, "Si el correo existe, se procesó la recuperación");
    }

    const row = result.recordset[0];
    const tempPassword = randomTempPassword();
    const hash = await hashPassword(tempPassword);

    await pool.request()
      .input("usuarioId", sql.Int, row.UsuarioId)
      .input("hashPassword", sql.NVarChar, hash)
      .query(`
        UPDATE dbo.Usuario
        SET HashPassword = @hashPassword,
            DebeCambiarPassword = 1,
            UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);

    if (!row.CorreoEncargado) {
      return ok(
        res,
        {
          enviado: false,
          modo: "simulado",
          correoDestino: null,
          usuario: row.Correo,
          claveTemporal: tempPassword
        },
        "Se generó una clave temporal, pero el estudiante no tiene correo de encargado registrado"
      );
    }

    const nombreEncargado = [
      row.NombreEncargado || "",
      row.PrimerApellidoEncargado || ""
    ]
      .join(" ")
      .trim();

    const resultadoEnvio = await sendEmail({
      to: row.CorreoEncargado,
      subject: "Recuperación de clave - Profe360",
      html: buildForgotPasswordHtml({
        nombreEncargado,
        usuario: row.Correo,
        claveTemporal: tempPassword
      }),
      text: `Recuperación de acceso - Profe360

Usuario: ${row.Correo}
Clave temporal: ${tempPassword}

Al ingresar se solicitará cambiar la clave.
Este correo es automático, por favor no responder.`
    });

    if (resultadoEnvio.modo === "simulado") {
      return ok(
        res,
        {
          enviado: true,
          modo: "simulado",
          correoDestino: row.CorreoEncargado,
          usuario: row.Correo,
          claveTemporal: tempPassword
        },
        `Se generó una clave temporal y el sistema quedó en modo simulado para ${row.CorreoEncargado}`
      );
    }

    return ok(
      res,
      {
        enviado: true,
        modo: "real",
        correoDestino: row.CorreoEncargado,
        usuario: row.Correo
      },
      `Se generó una clave temporal y se envió al correo del encargado ${row.CorreoEncargado}`
    );
  } catch (error) {
    console.error("Error en forgot-password:", error);
    return res.status(500).json({ ok: false, message: "Error interno al recuperar la clave" });
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
        SELECT TOP 1 UsuarioId, HashPassword
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
        SET HashPassword = @hashPassword,
            DebeCambiarPassword = 0,
            UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);

    const payload = await getUserPayloadById(usuarioId);
    const token = jwt.sign(
      payload,
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