import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  if (!req.user?.institucionId) {
    return res.status(404).json({ message: "Usuario sin institución" });
  }

  const institucion = await prisma.institucion.findUnique({
    where: { InstitucionId: req.user.institucionId }
  });

  return res.json(institucion);
});

router.get("/", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
  const instituciones = await prisma.institucion.findMany({
    orderBy: { Nombre: "asc" }
  });

  res.json(instituciones);
});

export default router;
