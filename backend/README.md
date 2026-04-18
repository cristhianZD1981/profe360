# Profe360 API

Backend en Node.js + TypeScript + Express + SQL Server para la plataforma **Profe360**.

## Base usada
Este backend está alineado al script oficial `sql/REQUERIMIENTO_V1_script_BD.sql`, que ya contempla multiinstitución, seguridad, asistencia, evaluación, tareas, incidencias, notificaciones, centro de ayuda y catálogo semilla.

## Instalación
```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## Inicialización de base
1. Ejecutá el script `sql/REQUERIMIENTO_V1_script_BD.sql` en SQL Server
2. Ajustá el `.env`
3. Corré el seed:
```bash
npm run seed
```

## Usuarios de prueba
- superadmin@profe360.cr / Admin123*
- admin@demo.edu / Admin123*
- profe@demo.edu / Admin123*
- guia@demo.edu / Admin123*
- administrativo@demo.edu / Admin123*
- padre@demo.edu / Admin123*

## Incluye
- Auth con JWT
- Multiinstitución básica por `institucionId`
- Dashboard
- Instituciones
- Usuarios y roles
- Estudiantes
- Asistencia
- Reportes básicos
- Subida de archivos a Cloudinary
- Simulación de correo y WhatsApp

## Archivos adicionales
- `postman/Profe360.postman_collection.json`
- `docs/endpoints.md`
- `docs/REQUERIMIENTO_V1.docx`
