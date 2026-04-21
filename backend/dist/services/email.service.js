"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const resend_1 = require("resend");
const env_1 = require("../config/env");
function buildFromAddress() {
    if (!env_1.env.mail.fromEmail)
        return "";
    if (!env_1.env.mail.fromName)
        return env_1.env.mail.fromEmail;
    return `${env_1.env.mail.fromName} <${env_1.env.mail.fromEmail}>`;
}
async function sendEmail(input) {
    if (!env_1.env.mail.resendApiKey || !env_1.env.mail.fromEmail) {
        return {
            enviado: false,
            modo: "simulado",
            motivo: "Faltan RESEND_API_KEY o MAIL_FROM en las variables de entorno"
        };
    }
    const resend = new resend_1.Resend(env_1.env.mail.resendApiKey);
    const payload = {
        from: buildFromAddress(),
        to: input.to,
        subject: input.subject
    };
    if (input.html)
        payload.html = input.html;
    if (input.text)
        payload.text = input.text;
    if (input.cc)
        payload.cc = input.cc;
    if (input.bcc)
        payload.bcc = input.bcc;
    if (input.replyTo)
        payload.replyTo = input.replyTo;
    const { data, error } = await resend.emails.send(payload);
    if (error) {
        throw new Error(error.message || "No se pudo enviar el correo");
    }
    return {
        enviado: true,
        modo: "real",
        id: data?.id ?? null
    };
}
