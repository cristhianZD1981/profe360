"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./config/database");
const password_1 = require("./utils/password");
async function ensureRole(pool, usuarioId, roleName) {
    await pool.request().input("usuarioId", database_1.sql.Int, usuarioId).input("roleName", database_1.sql.NVarChar, roleName).query(`
    INSERT INTO dbo.UsuarioRol (UsuarioId, RolId)
    SELECT @usuarioId, r.RolId
    FROM dbo.Rol r
    WHERE r.Nombre = @roleName
      AND NOT EXISTS (SELECT 1 FROM dbo.UsuarioRol ur WHERE ur.UsuarioId = @usuarioId AND ur.RolId = r.RolId)
  `);
}
async function createUser(pool, data) {
    const existing = await pool.request().input("correo", database_1.sql.NVarChar, data.correo).query(`SELECT TOP 1 UsuarioId FROM dbo.Usuario WHERE Correo = @correo`);
    if (existing.recordset[0])
        return existing.recordset[0].UsuarioId;
    const hash = await (0, password_1.hashPassword)(data.password);
    const user = await pool.request()
        .input("institucionId", database_1.sql.Int, data.institucionId || null)
        .input("correo", database_1.sql.NVarChar, data.correo)
        .input("hash", database_1.sql.NVarChar, hash)
        .input("nombre", database_1.sql.NVarChar, data.nombre)
        .input("primerApellido", database_1.sql.NVarChar, data.primerApellido || null)
        .query(`INSERT INTO dbo.Usuario (InstitucionId, Correo, HashPassword, Nombre, PrimerApellido) OUTPUT INSERTED.UsuarioId VALUES (@institucionId, @correo, @hash, @nombre, @primerApellido)`);
    return user.recordset[0].UsuarioId;
}
async function main() {
    const pool = await (0, database_1.getPool)();
    let inst = await pool.request().query(`SELECT TOP 1 InstitucionId FROM dbo.Institucion ORDER BY InstitucionId`);
    let institucionId = inst.recordset[0]?.InstitucionId;
    if (!institucionId) {
        const created = await pool.request().query(`INSERT INTO dbo.Institucion (TipoClienteId, Nombre, NombreComercial, CorreoPrincipal, TelefonoPrincipal) OUTPUT INSERTED.InstitucionId VALUES (1, N'Colegio Demo Profe360', N'Colegio Demo Profe360', N'info@demo.edu', N'2222-2222')`);
        institucionId = created.recordset[0].InstitucionId;
    }
    const users = [
        { correo: "superadmin@profe360.cr", password: "Admin123*", nombre: "Super", primerApellido: "Admin", institucionId: null, role: "SUPER_ADMIN" },
        { correo: "admin@demo.edu", password: "Admin123*", nombre: "Ana", primerApellido: "Admin", institucionId, role: "ADMIN_INSTITUCIONAL" },
        { correo: "profe@demo.edu", password: "Admin123*", nombre: "Carlos", primerApellido: "Profe", institucionId, role: "PROFESOR" },
        { correo: "guia@demo.edu", password: "Admin123*", nombre: "Laura", primerApellido: "Guía", institucionId, role: "PROFESOR_GUIA" },
        { correo: "administrativo@demo.edu", password: "Admin123*", nombre: "Mario", primerApellido: "Admin", institucionId, role: "ADMINISTRATIVO" },
        { correo: "padre@demo.edu", password: "Admin123*", nombre: "Paula", primerApellido: "Familia", institucionId, role: "PADRE_FAMILIA" }
    ];
    for (const item of users) {
        const usuarioId = await createUser(pool, item);
        await ensureRole(pool, usuarioId, item.role);
    }
    const estudiantes = await pool.request().input("institucionId", database_1.sql.Int, institucionId).query(`SELECT COUNT(*) total FROM dbo.Estudiante WHERE InstitucionId = @institucionId`);
    if (estudiantes.recordset[0].total === 0) {
        await pool.request().input("institucionId", database_1.sql.Int, institucionId).query(`
      INSERT INTO dbo.Estudiante (InstitucionId, Identificacion, Nombre, PrimerApellido, SegundoApellido, Correo, Telefono, Sexo)
      VALUES
      (@institucionId, N'101110111', N'Sofía', N'Rojas', N'Vega', N'sofia@demo.edu', N'8888-1111', N'F'),
      (@institucionId, N'202220222', N'Diego', N'Mora', N'Soto', N'diego@demo.edu', N'8888-2222', N'M')
    `);
    }
    const estados = await pool.request().input("institucionId", database_1.sql.Int, institucionId).query(`SELECT COUNT(*) total FROM dbo.EstadoAsistencia WHERE InstitucionId = @institucionId`);
    if (estados.recordset[0].total === 0) {
        await pool.request().input("institucionId", database_1.sql.Int, institucionId).query(`
      INSERT INTO dbo.EstadoAsistencia (InstitucionId, Nombre, Codigo, PorcentajeAsistencia, ColorHex)
      VALUES
      (@institucionId, N'Presente', N'PRESENTE', 100, N'#22c55e'),
      (@institucionId, N'Ausente', N'AUS', 0, N'#ef4444'),
      (@institucionId, N'Justificada', N'JUST', 100, N'#3b82f6'),
      (@institucionId, N'Tardía', N'TARD', 50, N'#f59e0b')
    `);
    }
    console.log("Seed ejecutado correctamente");
}
main().catch((error) => { console.error(error); process.exit(1); });
