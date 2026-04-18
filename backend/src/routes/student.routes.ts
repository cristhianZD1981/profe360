import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const institucionId = req.user?.institucionId;

  const estudiantes = await prisma.estudiante.findMany({
    where: { InstitucionId: institucionId ?? undefined },
    orderBy: [{ PrimerApellido: "asc" }, { Nombre: "asc" }],
    include: {
      matriculas: { include: { grupo: true } }
    }
  });

  res.json(estudiantes);
});

router.post("/", requireAuth, requireRole("ADMIN_INSTITUCION", "ADMINISTRATIVO"), async (req, res) => {
  const schema = z.object({
    identificacion: z.string().min(3),
    nombre: z.string().min(2),
    primerApellido: z.string().min(2),
    segundoApellido: z.string().optional(),
    correo: z.string().email().optional().or(z.literal("")),
    telefono: z.string().optional(),
    sexo: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !req.user?.institucionId) {
    return res.status(400).json({ message: "Datos inválidos" });
  }

  const estudiante = await prisma.estudiante.create({
    data: {
      InstitucionId: req.user.institucionId,
      Identificacion: parsed.data.identificacion,
      Nombre: parsed.data.nombre,
      PrimerApellido: parsed.data.primerApellido,
      SegundoApellido: parsed.data.segundoApellido,
      Correo: parsed.data.correo || null,
      Telefono: parsed.data.telefono,
      Sexo: parsed.data.sexo
    }
  });

  res.status(201).json(estudiante);
});

export default router;
