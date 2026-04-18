import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { created } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.post("/correo", async (req, res) => created(res, { modo: "simulado", ...req.body, fecha: new Date().toISOString() }, "Correo simulado correctamente"));
router.post("/whatsapp", async (req, res) => created(res, { modo: "simulado", ...req.body, fecha: new Date().toISOString() }, "WhatsApp simulado correctamente"));
export default router;
