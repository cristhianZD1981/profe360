import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.post("/login", async (req, res) => {
  const schema = z.object({
    correo: z.string().email(),
    password: z.string().min(6)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const user = await prisma.usuario.findUnique({
    where: { Correo: parsed.data.correo },
    include: {
      rolesUsuario: { include: { rol: true } }
    }
  });

  if (!user || !user.Activo) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  const ok = await bcrypt.compare(parsed.data.password, user.HashPassword);
  if (!ok) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  const roles = user.rolesUsuario.filter((item) => item.Activo).map((item) => item.rol.Nombre);

  const token = jwt.sign(
    {
      userId: user.UsuarioId,
      institucionId: user.InstitucionId,
      roles
    },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  await prisma.usuario.update({
    where: { UsuarioId: user.UsuarioId },
    data: { UltimoAcceso: new Date() }
  });

  return res.json({
    token,
    user: {
      id: user.UsuarioId,
      nombre: user.Nombre,
      correo: user.Correo,
      institucionId: user.InstitucionId,
      roles
    }
  });
});

export default router;
