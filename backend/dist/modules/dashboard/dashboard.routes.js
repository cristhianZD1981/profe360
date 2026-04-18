"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get("/resumen", async (req, res) => {
    const pool = await (0, database_1.getPool)();
    const institucionId = req.auth?.institucionId ?? null;
    const q = (query) => pool.request().input("institucionId", database_1.sql.Int, institucionId).query(query);
    const [users, students, grupos] = await Promise.all([
        q(`SELECT COUNT(*) total FROM dbo.Usuario WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
        q(`SELECT COUNT(*) total FROM dbo.Estudiante WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
        q(`SELECT COUNT(*) total FROM dbo.Grupo WHERE @institucionId IS NULL OR InstitucionId = @institucionId`)
    ]);
    return (0, http_1.ok)(res, {
        usuarios: users.recordset[0].total,
        estudiantes: students.recordset[0].total,
        grupos: grupos.recordset[0].total,
        tareas: 0,
        incidencias: 0,
        modulos: ["Multiinstitución", "Asistencia", "Evaluación", "Tareas", "Trabajo cotidiano", "Incidencias", "Reportes", "Centro de ayuda"]
    });
});
exports.default = router;
