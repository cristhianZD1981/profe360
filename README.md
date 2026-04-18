# Profe360 MVP

Base inicial de backend y frontend para arrancar el sistema académico multiinstitución.

## Módulos incluidos
- Login con JWT
- Multiinstitución básica
- Roles
- Estudiantes
- Grupos
- Asistencia

## Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

## Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Notas
- Debes apuntar `DATABASE_URL` a SQL Server.
- El `schema.prisma` es un núcleo inicial, no el modelo completo de 82 tablas.
- Está pensado para ser la Fase 1 del proyecto.
