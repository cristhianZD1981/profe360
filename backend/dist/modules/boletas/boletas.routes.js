"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.use((0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR_GUIA", "PROFESOR"));
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function formatDate(value) {
    if (!value)
        return "";
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
}
function getInstitutionId(req, res) {
    const institucionId = req.auth?.institucionId ?? null;
    if (!institucionId) {
        (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        return null;
    }
    return Number(institucionId);
}
function fullName(item) {
    return [item?.Nombre, item?.PrimerApellido, item?.SegundoApellido]
        .filter(Boolean)
        .join(" ")
        .trim();
}
function calcularEdadAlPrimeroFeb(fechaNacimiento, anioLectivo) {
    if (!fechaNacimiento)
        return "";
    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime()))
        return "";
    const year = Number(String(anioLectivo || "").match(/\d{4}/)?.[0] || new Date().getFullYear());
    const corte = new Date(`${year}-02-01T00:00:00`);
    let edad = corte.getFullYear() - nacimiento.getFullYear();
    const m = corte.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && corte.getDate() < nacimiento.getDate())) {
        edad--;
    }
    return String(edad);
}
function mapEncargado(encargado) {
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
function buildBoletaHtml(params) {
    const { institucion, matricula, estudiante, encargados } = params;
    const madre = encargados.find((x) => x.tipo === "MADRE") || null;
    const padre = encargados.find((x) => x.tipo === "PADRE") || null;
    const encargado = encargados.find((x) => x.tipo === "ENCARGADO") || null;
    const bloqueMadreOEncargada = madre || encargado;
    const bloquePadreOEncargado = padre || (madre ? encargado : null);
    const anioBoleta = String(matricula?.AnioNombre || "").match(/\d{4}/)?.[0] ||
        new Date().getFullYear().toString();
    const edadAlPrimeroFeb = calcularEdadAlPrimeroFeb(estudiante?.FechaNacimiento, matricula?.AnioNombre);
    const nombreInstitucionCabecera = institucion?.NombreOficialBoleta ||
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
        ${institucion?.MembreteUrl
        ? `<img src="${escapeHtml(institucion.MembreteUrl)}" alt="Membrete institucional" />`
        : ``}
      </div>

      <div class="top-center">
        <div class="line-1">${escapeHtml(institucion?.RegionalEducativa || "")}</div>
        <div class="line-2">
          ${institucion?.CircuitoEducativo
        ? `Supervisión de Centros Educativos, ${escapeHtml(institucion.CircuitoEducativo)}`
        : ""}
        </div>
        <div class="line-3">${escapeHtml(nombreInstitucionCabecera)}</div>
        <div class="line-4"></div>
      </div>

      <div class="top-right">
        ${institucion?.LogoUrl
        ? `<img src="${escapeHtml(institucion.LogoUrl)}" alt="Logo de la institución" />`
        : ``}
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
        if (institucionId === null)
            return;
        const matriculaId = Number(req.params.matriculaId);
        if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
            return (0, http_1.badRequest)(res, "MatriculaId inválido");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("matriculaId", database_1.sql.Int, matriculaId)
            .input("institucionId", database_1.sql.Int, institucionId)
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
            .input("estudianteId", database_1.sql.Int, row.EstudianteId)
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
        return (0, http_1.ok)(res, {
            institucion,
            estudiante,
            matricula,
            encargados,
            html
        }, "Boleta generada correctamente");
    }
    catch (error) {
        console.error("Error generando boleta de matrícula:", error);
        return res.status(500).json({
            ok: false,
            message: "No se pudo generar la boleta de matrícula"
        });
    }
});
exports.default = router;
