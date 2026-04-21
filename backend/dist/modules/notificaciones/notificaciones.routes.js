"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const http_1 = require("../../utils/http");
const email_service_1 = require("../../services/email.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.post("/correo", async (req, res) => {
    try {
        const { to, subject, html, text, cc, bcc, replyTo } = req.body || {};
        if (!to || !subject || (!html && !text)) {
            return (0, http_1.badRequest)(res, "to, subject y al menos uno entre html o text son obligatorios");
        }
        const resultado = await (0, email_service_1.sendEmail)({
            to,
            subject,
            html,
            text,
            cc,
            bcc,
            replyTo
        });
        return (0, http_1.created)(res, {
            ...resultado,
            to,
            subject,
            fecha: new Date().toISOString()
        }, resultado.modo === "real"
            ? "Correo enviado correctamente"
            : "Correo simulado correctamente");
    }
    catch (error) {
        return (0, http_1.serverError)(res, error);
    }
});
router.post("/whatsapp", async (req, res) => (0, http_1.created)(res, { modo: "simulado", ...req.body, fecha: new Date().toISOString() }, "WhatsApp simulado correctamente"));
exports.default = router;
