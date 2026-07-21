import { Router } from "express";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest, forbidden } from "../../utils/http";

const router = Router();

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

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return (auth.roles || []).some((role) => roles.includes(role));
}

function isAdminRole(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
}

function isSuperAdminRole(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function isProfesorRole(req: any) {
  return hasAnyRole(req, ["PROFESOR", "PROFESOR_GUIA"]);
}

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.userId || auth.usuarioId || 0);
}

function getUserInstitutionId(req: any) {
  const auth = getAuth(req);
  return Number(auth.institucionId || 0);
}

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function normalizeForCompare(value: any) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toOptionalInt(value: any) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toRequiredInt(value: any, field: string, res: any) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    badRequest(res, `El campo ${field} es invalido`);
    return null;
  }
  return parsed;
}

async function ensurePlantillaPromptIAVisibilityColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.PlantillaPromptIA', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD UsuarioCreadorId INT NULL;
    END;

    IF COL_LENGTH('dbo.PlantillaPromptIA', 'InstitucionId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD InstitucionId INT NULL;
    END;

    IF COL_LENGTH('dbo.PlantillaPromptIA', 'EsPublica') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD EsPublica BIT NOT NULL CONSTRAINT DF_PlantillaPromptIA_EsPublica DEFAULT(1);
    END;
  `);
}

function canMaintainTipos(req: any) {
  return isAdminRole(req);
}

function denyIfCannotMaintainTipos(req: any, res: any) {
  if (!canMaintainTipos(req)) {
    forbidden(res, "No tenés permisos para administrar tipos de plantillas IA");
    return true;
  }
  return false;
}

function canReadPlantilla(req: any, plantilla: any) {
  if (!plantilla) return false;
  if (isSuperAdminRole(req)) return true;

  const institucionId = getUserInstitutionId(req);
  const plantillaInstitucionId = Number(plantilla.InstitucionId || 0);
  if (plantillaInstitucionId > 0 && (!institucionId || plantillaInstitucionId !== institucionId)) return false;

  if (isAdminRole(req)) return true;
  if (!isProfesorRole(req)) return false;

  const userId = getUserId(req);
  const esPropia = Number(plantilla.UsuarioCreadorId || 0) > 0 && Number(plantilla.UsuarioCreadorId) === userId;
  return Boolean(plantilla.EsPublica) || esPropia;
}

function canWritePlantilla(req: any, plantilla: any) {
  if (!plantilla) return false;
  if (isSuperAdminRole(req)) return true;

  const institucionId = getUserInstitutionId(req);
  if (!institucionId || Number(plantilla.InstitucionId || 0) !== institucionId) return false;

  if (isAdminRole(req)) return true;
  if (!isProfesorRole(req)) return false;

  const userId = getUserId(req);
  return Number(plantilla.UsuarioCreadorId || 0) > 0 && Number(plantilla.UsuarioCreadorId) === userId;
}

async function getPlantillaById(pool: any, id: number) {
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT
        p.Id,
        p.TipoGeneracionIAId,
        t.Nombre AS TipoGeneracionIANombre,
        p.InstitucionId,
        i.Nombre AS InstitucionNombre,
        p.NombrePlantilla,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta,
        p.UsuarioCreadorId,
        p.EsPublica,
        p.Activo,
        p.FechaCreacion
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t ON t.Id = p.TipoGeneracionIAId
      LEFT JOIN dbo.Institucion i ON i.InstitucionId = p.InstitucionId
      WHERE p.Id = @id
    `);

  return result.recordset[0] || null;
}

async function assertNombreDisponible(pool: any, input: {
  tipoGeneracionIAId: number;
  institucionId: number | null;
  nombrePlantilla: string;
  excluirId?: number | null;
}) {
  const result = await pool.request()
    .input("tipoGeneracionIAId", sql.Int, input.tipoGeneracionIAId)
    .input("institucionId", sql.Int, input.institucionId)
    .input("nombrePlantilla", sql.NVarChar(150), input.nombrePlantilla)
    .input("excluirId", sql.Int, input.excluirId || null)
    .query(`
      SELECT TOP 1 Id
      FROM dbo.PlantillaPromptIA
      WHERE TipoGeneracionIAId = @tipoGeneracionIAId
        AND ISNULL(InstitucionId, 0) = ISNULL(@institucionId, 0)
        AND UPPER(LTRIM(RTRIM(NombrePlantilla))) = UPPER(LTRIM(RTRIM(@nombrePlantilla)))
        AND Activo = 1
        AND (@excluirId IS NULL OR Id <> @excluirId)
    `);

  return result.recordset.length === 0;
}

router.get("/tipos", async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        Id,
        Nombre,
        Descripcion,
        Activo,
        FechaCreacion
      FROM dbo.TipoGeneracionIA
      WHERE Activo = 1
      ORDER BY Nombre
    `);

    ok(res, result.recordset, "Tipos de generacion IA obtenidos correctamente");
  } catch (error) {
    console.error("Error obteniendo tipos de generacion IA:", error);
    res.status(500).json({ ok: false, message: "No se pudieron obtener los tipos de generacion IA" });
  }
});

router.post("/tipos", async (req, res) => {
  try {
    if (denyIfCannotMaintainTipos(req, res)) return;

    const nombre = normalizeText(req.body.nombre);
    const descripcion = normalizeText(req.body.descripcion);

    if (!nombre) return badRequest(res, "El nombre del tipo de generacion es obligatorio");

    const pool = await getPool();

    const existente = await pool.request()
      .input("nombre", sql.NVarChar(150), nombre)
      .query(`
        SELECT TOP 1 Id, Activo
        FROM dbo.TipoGeneracionIA
        WHERE UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
      `);

    if (existente.recordset.length) {
      const tipo = existente.recordset[0];

      if (!tipo.Activo) {
        await pool.request()
          .input("id", sql.Int, tipo.Id)
          .input("descripcion", sql.NVarChar(sql.MAX), descripcion || null)
          .query(`
            UPDATE dbo.TipoGeneracionIA
            SET Activo = 1,
                Descripcion = COALESCE(@descripcion, Descripcion)
            WHERE Id = @id
          `);

        return ok(res, { id: tipo.Id }, "Tipo de generacion IA reactivado correctamente");
      }

      return badRequest(res, "Ya existe un tipo de generacion IA con ese nombre");
    }

    const result = await pool.request()
      .input("nombre", sql.NVarChar(150), nombre)
      .input("descripcion", sql.NVarChar(sql.MAX), descripcion || null)
      .query(`
        INSERT INTO dbo.TipoGeneracionIA (Nombre, Descripcion, Activo, FechaCreacion)
        OUTPUT INSERTED.Id
        VALUES (@nombre, @descripcion, 1, GETDATE())
      `);

    created(res, { id: result.recordset[0]?.Id }, "Tipo de generacion IA creado correctamente");
  } catch (error) {
    console.error("Error creando tipo de generacion IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo crear el tipo de generacion IA" });
  }
});

router.patch("/tipos/:id/estado", async (req, res) => {
  try {
    if (denyIfCannotMaintainTipos(req, res)) return;

    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const activo = Boolean(req.body.activo);
    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("activo", sql.Bit, activo)
      .query(`
        UPDATE dbo.TipoGeneracionIA
        SET Activo = @activo
        WHERE Id = @id
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ ok: false, message: "Tipo de generacion IA no encontrado" });

    ok(res, { id, activo }, activo ? "Tipo de generacion IA activado correctamente" : "Tipo de generacion IA desactivado correctamente");
  } catch (error) {
    console.error("Error cambiando estado de tipo de generacion IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo cambiar el estado del tipo de generacion IA" });
  }
});

router.get("/plantillas", async (req, res) => {
  try {
    const tipoGeneracionIAId = toOptionalInt(req.query.tipoGeneracionIAId);
    const incluirInactivas = String(req.query.incluirInactivas || "").toLowerCase() === "true";
    const institucionIdFiltro = isSuperAdminRole(req)
      ? toOptionalInt(req.query.institucionId)
      : getUserInstitutionId(req);

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    if (!isAdminRole(req) && !institucionIdFiltro) {
      return badRequest(res, "El usuario no tiene una institucion asignada");
    }

    const request = pool.request()
      .input("tipoGeneracionIAId", sql.Int, tipoGeneracionIAId)
      .input("usuarioId", sql.Int, getUserId(req) || null)
      .input("institucionId", sql.Int, institucionIdFiltro || null);

    const filtroEstado = incluirInactivas ? "1 = 1" : "p.Activo = 1";
    const filtroVisibilidad = isProfesorRole(req) && !isAdminRole(req)
      ? "AND (ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)"
      : "";
    const filtroInstitucion = isSuperAdminRole(req)
      ? "AND (@institucionId IS NULL OR p.InstitucionId = @institucionId OR p.InstitucionId IS NULL)"
      : "AND (p.InstitucionId = @institucionId OR p.InstitucionId IS NULL)";

    const result = await request.query(`
      SELECT
        p.Id,
        p.TipoGeneracionIAId,
        t.Nombre AS TipoGeneracionIANombre,
        p.InstitucionId,
        i.Nombre AS InstitucionNombre,
        p.NombrePlantilla,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta,
        p.UsuarioCreadorId,
        p.EsPublica,
        p.Activo,
        p.FechaCreacion
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t ON t.Id = p.TipoGeneracionIAId
      LEFT JOIN dbo.Institucion i ON i.InstitucionId = p.InstitucionId
      WHERE (@tipoGeneracionIAId IS NULL OR p.TipoGeneracionIAId = @tipoGeneracionIAId)
        ${filtroInstitucion}
        AND (${filtroEstado})
        ${filtroVisibilidad}
      ORDER BY p.FechaCreacion DESC, p.Id DESC
    `);

    ok(res, result.recordset, "Plantillas IA obtenidas correctamente");
  } catch (error) {
    console.error("Error obteniendo plantillas IA:", error);
    res.status(500).json({ ok: false, message: "No se pudieron obtener las plantillas IA" });
  }
});

router.get("/plantillas/:id", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const plantilla = await getPlantillaById(pool, id);
    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canReadPlantilla(req, plantilla)) return forbidden(res, "No tenés permisos para consultar esta plantilla");

    ok(res, plantilla, "Plantilla IA obtenida correctamente");
  } catch (error) {
    console.error("Error obteniendo plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo obtener la plantilla IA" });
  }
});

router.get("/plantillas/:id/exportar-word", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const plantilla = await getPlantillaById(pool, id);
    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canReadPlantilla(req, plantilla)) return forbidden(res, "No tenés permisos para consultar esta plantilla");

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: `Plantilla IA: ${String(plantilla.NombrePlantilla || "")}`, bold: true, size: 32 })] }),
            new Paragraph({ text: `Tipo: ${String(plantilla.TipoGeneracionIANombre || plantilla.TipoGeneracionIAId || "")}` }),
            new Paragraph({ text: `Visibilidad: ${plantilla.EsPublica ? "Pública" : "Privada"}` }),
            new Paragraph({ text: `Estado: ${plantilla.Activo ? "Activa" : "Inactiva"}` }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Indicaciones del sistema", bold: true })] }),
            new Paragraph({ text: String(plantilla.IndicacionesSistema || "") }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Contexto base", bold: true })] }),
            new Paragraph({ text: String(plantilla.ContextoBase || "") }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Reglas de construcción", bold: true })] }),
            new Paragraph({ text: String(plantilla.ReglasConstruccion || "") }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Estructura de salida", bold: true })] }),
            new Paragraph({ text: String(plantilla.EstructuraSalida || "") }),
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Formato de respuesta", bold: true })] }),
            new Paragraph({ text: String(plantilla.FormatoRespuesta || "") })
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const safe = String(plantilla.NombrePlantilla || "plantilla_ia").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    const filename = `${safe || "plantilla_ia"}_${id}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando plantilla IA a Word:", error);
    res.status(500).json({ ok: false, message: "No se pudo exportar la plantilla IA a Word" });
  }
});

router.post("/plantillas", async (req, res) => {
  try {
    const tipoGeneracionIAId = toRequiredInt(req.body.tipoGeneracionIAId, "tipoGeneracionIAId", res);
    if (tipoGeneracionIAId === null) return;

    const institucionId = isSuperAdminRole(req)
      ? toRequiredInt(req.body.institucionId, "institucionId", res)
      : getUserInstitutionId(req);
    if (institucionId === null) return;

    const nombrePlantilla = normalizeText(req.body.nombrePlantilla);
    const indicacionesSistema = normalizeText(req.body.indicacionesSistema);
    const contextoBase = normalizeText(req.body.contextoBase);
    const reglasConstruccion = normalizeText(req.body.reglasConstruccion);
    const estructuraSalida = normalizeText(req.body.estructuraSalida);
    const formatoRespuesta = normalizeText(req.body.formatoRespuesta);
    const esPublica = req.body.esPublica === undefined
      ? !isProfesorRole(req)
      : !!req.body.esPublica;
    const usuarioCreadorId = getUserId(req) || null;

    if (!nombrePlantilla) return badRequest(res, "El nombre de la plantilla es obligatorio");
    if (!indicacionesSistema) return badRequest(res, "Las indicaciones del sistema son obligatorias");

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const tipo = await pool.request()
      .input("tipoGeneracionIAId", sql.Int, tipoGeneracionIAId)
      .query(`
        SELECT TOP 1 Id
        FROM dbo.TipoGeneracionIA
        WHERE Id = @tipoGeneracionIAId
          AND Activo = 1
      `);

    if (!tipo.recordset.length) return badRequest(res, "El tipo de generacion IA no existe o esta inactivo");

    const disponible = await assertNombreDisponible(pool, {
      tipoGeneracionIAId,
      institucionId,
      nombrePlantilla
    });

    if (!disponible) {
      return badRequest(res, "Ya existe una plantilla activa con ese nombre para este tipo");
    }

    const result = await pool.request()
      .input("tipoGeneracionIAId", sql.Int, tipoGeneracionIAId)
      .input("institucionId", sql.Int, institucionId)
      .input("nombrePlantilla", sql.NVarChar(150), nombrePlantilla)
      .input("indicacionesSistema", sql.NVarChar(sql.MAX), indicacionesSistema)
      .input("contextoBase", sql.NVarChar(sql.MAX), contextoBase || null)
      .input("reglasConstruccion", sql.NVarChar(sql.MAX), reglasConstruccion || null)
      .input("estructuraSalida", sql.NVarChar(sql.MAX), estructuraSalida || null)
      .input("formatoRespuesta", sql.NVarChar(sql.MAX), formatoRespuesta || null)
      .input("usuarioCreadorId", sql.Int, usuarioCreadorId)
      .input("esPublica", sql.Bit, esPublica)
      .query(`
        INSERT INTO dbo.PlantillaPromptIA
          (TipoGeneracionIAId, InstitucionId, NombrePlantilla, IndicacionesSistema, ContextoBase, ReglasConstruccion, EstructuraSalida, FormatoRespuesta, UsuarioCreadorId, EsPublica, Activo, FechaCreacion)
        OUTPUT INSERTED.Id
        VALUES
          (@tipoGeneracionIAId, @institucionId, @nombrePlantilla, @indicacionesSistema, @contextoBase, @reglasConstruccion, @estructuraSalida, @formatoRespuesta, @usuarioCreadorId, @esPublica, 1, GETDATE())
      `);

    created(res, { id: result.recordset[0]?.Id }, "Plantilla IA creada correctamente");
  } catch (error) {
    console.error("Error creando plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo crear la plantilla IA" });
  }
});

router.put("/plantillas/:id", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const nombrePlantilla = normalizeText(req.body.nombrePlantilla);
    const indicacionesSistema = normalizeText(req.body.indicacionesSistema);
    const contextoBase = normalizeText(req.body.contextoBase);
    const reglasConstruccion = normalizeText(req.body.reglasConstruccion);
    const estructuraSalida = normalizeText(req.body.estructuraSalida);
    const formatoRespuesta = normalizeText(req.body.formatoRespuesta);

    if (!nombrePlantilla) return badRequest(res, "El nombre de la plantilla es obligatorio");
    if (!indicacionesSistema) return badRequest(res, "Las indicaciones del sistema son obligatorias");

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const plantilla = await getPlantillaById(pool, id);
    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canWritePlantilla(req, plantilla)) return forbidden(res, "No tenés permisos para modificar esta plantilla");

    const institucionId = isSuperAdminRole(req)
      ? toRequiredInt(req.body.institucionId, "institucionId", res)
      : Number(plantilla.InstitucionId || getUserInstitutionId(req) || 0);
    if (!institucionId) return badRequest(res, "La institucion es obligatoria");

    const esPublica = req.body.esPublica === undefined ? !!plantilla.EsPublica : !!req.body.esPublica;

    const disponible = await assertNombreDisponible(pool, {
      tipoGeneracionIAId: Number(plantilla.TipoGeneracionIAId),
      institucionId,
      nombrePlantilla,
      excluirId: id
    });

    if (!disponible) {
      return badRequest(res, "Ya existe una plantilla activa con ese nombre para este tipo");
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("nombrePlantilla", sql.NVarChar(150), nombrePlantilla)
      .input("indicacionesSistema", sql.NVarChar(sql.MAX), indicacionesSistema)
      .input("contextoBase", sql.NVarChar(sql.MAX), contextoBase || null)
      .input("reglasConstruccion", sql.NVarChar(sql.MAX), reglasConstruccion || null)
      .input("estructuraSalida", sql.NVarChar(sql.MAX), estructuraSalida || null)
      .input("formatoRespuesta", sql.NVarChar(sql.MAX), formatoRespuesta || null)
      .input("esPublica", sql.Bit, esPublica)
      .query(`
        UPDATE dbo.PlantillaPromptIA
        SET
          InstitucionId = @institucionId,
          NombrePlantilla = @nombrePlantilla,
          IndicacionesSistema = @indicacionesSistema,
          ContextoBase = @contextoBase,
          ReglasConstruccion = @reglasConstruccion,
          EstructuraSalida = @estructuraSalida,
          FormatoRespuesta = @formatoRespuesta,
          EsPublica = @esPublica
        WHERE Id = @id
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });

    ok(res, { id }, "Plantilla IA actualizada correctamente");
  } catch (error) {
    console.error("Error actualizando plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo actualizar la plantilla IA" });
  }
});

router.patch("/plantillas/:id/estado", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const activo = Boolean(req.body.activo);
    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const plantilla = await getPlantillaById(pool, id);
    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canWritePlantilla(req, plantilla)) return forbidden(res, "No tenés permisos para cambiar el estado de esta plantilla");

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("activo", sql.Bit, activo)
      .query(`
        UPDATE dbo.PlantillaPromptIA
        SET Activo = @activo
        WHERE Id = @id
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });

    ok(res, { id, activo }, activo ? "Plantilla IA activada correctamente" : "Plantilla IA desactivada correctamente");
  } catch (error) {
    console.error("Error cambiando estado de plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo cambiar el estado de la plantilla IA" });
  }
});

router.delete("/plantillas/:id", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const plantilla = await getPlantillaById(pool, id);
    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canWritePlantilla(req, plantilla)) return forbidden(res, "No tenés permisos para eliminar esta plantilla");

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.PlantillaPromptIA
        SET Activo = 0
        WHERE Id = @id
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });

    ok(res, { id }, "Plantilla IA desactivada correctamente");
  } catch (error) {
    console.error("Error desactivando plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo desactivar la plantilla IA" });
  }
});

router.post("/plantillas/:id/copiar", async (req, res) => {
  try {
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const pool = await getPool();
    await ensurePlantillaPromptIAVisibilityColumns(pool);

    const origen = await getPlantillaById(pool, id);
    if (!origen) return res.status(404).json({ ok: false, message: "Plantilla IA no encontrada" });
    if (!canReadPlantilla(req, origen)) return forbidden(res, "No tenés permisos para copiar esta plantilla");

    const nombrePlantilla = normalizeText(req.body.nombrePlantilla || `${origen.NombrePlantilla} - copia`);
    if (!nombrePlantilla) return badRequest(res, "El nombre de la plantilla copiada es obligatorio");

    const institucionId = isSuperAdminRole(req)
      ? toRequiredInt(req.body.institucionId, "institucionId", res)
      : Number(origen.InstitucionId || getUserInstitutionId(req) || 0);
    if (!institucionId) return badRequest(res, "La institucion es obligatoria");

    const esPublica = req.body.esPublica === undefined
      ? (isProfesorRole(req) && !isAdminRole(req) ? false : !!origen.EsPublica)
      : !!req.body.esPublica;

    const disponible = await assertNombreDisponible(pool, {
      tipoGeneracionIAId: Number(origen.TipoGeneracionIAId),
      institucionId,
      nombrePlantilla
    });

    if (!disponible) {
      return badRequest(res, "El nombre de la plantilla copiada debe ser diferente");
    }

    const result = await pool.request()
      .input("tipoGeneracionIAId", sql.Int, Number(origen.TipoGeneracionIAId))
      .input("institucionId", sql.Int, institucionId)
      .input("nombrePlantilla", sql.NVarChar(150), nombrePlantilla)
      .input("indicacionesSistema", sql.NVarChar(sql.MAX), origen.IndicacionesSistema)
      .input("contextoBase", sql.NVarChar(sql.MAX), origen.ContextoBase || null)
      .input("reglasConstruccion", sql.NVarChar(sql.MAX), origen.ReglasConstruccion || null)
      .input("estructuraSalida", sql.NVarChar(sql.MAX), origen.EstructuraSalida || null)
      .input("formatoRespuesta", sql.NVarChar(sql.MAX), origen.FormatoRespuesta || null)
      .input("usuarioCreadorId", sql.Int, getUserId(req) || null)
      .input("esPublica", sql.Bit, esPublica)
      .query(`
        INSERT INTO dbo.PlantillaPromptIA
          (TipoGeneracionIAId, InstitucionId, NombrePlantilla, IndicacionesSistema, ContextoBase, ReglasConstruccion, EstructuraSalida, FormatoRespuesta, UsuarioCreadorId, EsPublica, Activo, FechaCreacion)
        OUTPUT INSERTED.Id
        VALUES
          (@tipoGeneracionIAId, @institucionId, @nombrePlantilla, @indicacionesSistema, @contextoBase, @reglasConstruccion, @estructuraSalida, @formatoRespuesta, @usuarioCreadorId, @esPublica, 1, GETDATE())
      `);

    created(res, { id: result.recordset[0]?.Id }, "Plantilla IA copiada correctamente");
  } catch (error) {
    console.error("Error copiando plantilla IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo copiar la plantilla IA" });
  }
});

router.get("/historial", async (req, res) => {
  try {
    const tipoGeneracionIAId = toOptionalInt(req.query.tipoGeneracionIAId);
    const top = Math.min(100, Math.max(1, Number(req.query.top || 50)));

    const pool = await getPool();
    const request = pool.request()
      .input("tipoGeneracionIAId", sql.Int, tipoGeneracionIAId)
      .input("top", sql.Int, top)
      .input("usuarioId", sql.Int, getUserId(req) || null);

    const filtroVisibilidad = isProfesorRole(req) && !isAdminRole(req)
      ? "AND (h.UsuarioId = @usuarioId OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)"
      : "";

    const result = await request.query(`
      SELECT TOP (@top)
        h.Id,
        h.TipoGeneracionIAId,
        t.Nombre AS TipoGeneracionIANombre,
        h.PlantillaPromptIAId,
        p.NombrePlantilla,
        h.UsuarioId,
        h.DatosEntrada,
        h.PromptGenerado,
        h.RespuestaIA,
        h.FechaGeneracion
      FROM dbo.HistorialGeneracionIA h
      INNER JOIN dbo.TipoGeneracionIA t ON t.Id = h.TipoGeneracionIAId
      LEFT JOIN dbo.PlantillaPromptIA p ON p.Id = h.PlantillaPromptIAId
      WHERE (@tipoGeneracionIAId IS NULL OR h.TipoGeneracionIAId = @tipoGeneracionIAId)
      ${filtroVisibilidad}
      ORDER BY h.FechaGeneracion DESC, h.Id DESC
    `);

    ok(res, result.recordset, "Historial IA obtenido correctamente");
  } catch (error) {
    console.error("Error obteniendo historial IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo obtener el historial IA" });
  }
});

export default router;


