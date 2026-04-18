import { Router } from "express";
const router = Router();
router.get("/", (_req, res) => res.json({ ok: true, nombre: "Profe360 API", fecha: new Date().toISOString() }));
export default router;
