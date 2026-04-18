import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const institucionId = req.user?.institucionId;

  const grupos = await prisma.grupo.findMany({
    where: { InstitucionId: institucionId ?? undefined, Activo: true },
    orderBy: { Nombre: "asc" }
  });

  res.json(grupos);
});

export default router;
