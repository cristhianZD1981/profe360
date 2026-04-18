import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/session", requireAuth, requireRole("PROFESOR", "PROFESOR_GUIA"), async (req, res) => {
  const schema = z.object({
    grupoId: z.number().int().positive(),
    observacionGeneral: z.string().optional(),
    detalles: z.array(
      z.object({
        estudianteId: z.number().int().positive(),
        estadoAsistenciaId: z.number().int().positive(),
        observacion: z.string().optional()
      })
    ).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ message: "Datos inválidos" });
  }

  const session = await prisma.asistenciaSesion.create({
    data: {
      UsuarioId: req.user.userId,
      GrupoId: parsed.data.grupoId,
      ObservacionGeneral: parsed.data.observacionGeneral,
      detalles: {
        create: parsed.data.detalles.map((item) => ({
          EstudianteId: item.estudianteId,
          EstadoAsistenciaId: item.estadoAsistenciaId,
          Observacion: item.observacion
        }))
      }
    },
    include: { detalles: true }
  });

  res.status(201).json(session);
});

router.get("/catalogs/states", requireAuth, async (req, res) => {
  const institucionId = req.user?.institucionId;

  const states = await prisma.estadoAsistencia.findMany({
    where: { InstitucionId: institucionId ?? undefined, Activo: true },
    orderBy: { Nombre: "asc" }
  });

  res.json(states);
});

export default router;
