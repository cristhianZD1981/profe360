import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { badRequest, created, serverError } from "../../utils/http";
import { sendEmail } from "../../services/email.service";

const router = Router();
router.use(requireAuth);

router.post("/correo", async (req, res) => {
  try {
    const {
      to,
      subject,
      html,
      text,
      cc,
      bcc,
      replyTo
    } = req.body || {};

    if (!to || !subject || (!html && !text)) {
      return badRequest(
        res,
        "to, subject y al menos uno entre html o text son obligatorios"
      );
    }

    const resultado = await sendEmail({
      to,
      subject,
      html,
      text,
      cc,
      bcc,
      replyTo
    });

    return created(
      res,
      {
        ...resultado,
        to,
        subject,
        fecha: new Date().toISOString()
      },
      resultado.modo === "real"
        ? "Correo enviado correctamente"
        : "Correo simulado correctamente"
    );
  } catch (error) {
    return serverError(res, error);
  }
});

router.post("/whatsapp", async (req, res) =>
  created(
    res,
    { modo: "simulado", ...req.body, fecha: new Date().toISOString() },
    "WhatsApp simulado correctamente"
  )
);

export default router;