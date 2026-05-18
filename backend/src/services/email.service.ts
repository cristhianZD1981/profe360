import { Resend } from "resend";
import { env } from "../config/env";

type EmailAddress = string | string[];

export interface SendEmailInput {
  to: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  replyTo?: EmailAddress;
  attachments?: Array<{
    filename: string;
    content: string;
    type?: string;
    disposition?: "attachment" | "inline";
  }>;
}

function buildFromAddress() {
  if (!env.mail.fromEmail) return "";
  if (!env.mail.fromName) return env.mail.fromEmail;
  return `${env.mail.fromName} <${env.mail.fromEmail}>`;
}

export async function sendEmail(input: SendEmailInput) {
  if (!env.mail.resendApiKey || !env.mail.fromEmail) {
    return {
      enviado: false,
      modo: "simulado" as const,
      motivo:
        "Faltan RESEND_API_KEY o MAIL_FROM en las variables de entorno"
    };
  }

  const resend = new Resend(env.mail.resendApiKey);

  const payload: any = {
    from: input.from || buildFromAddress(),
    to: input.to,
    subject: input.subject
  };

  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.cc) payload.cc = input.cc;
  if (input.bcc) payload.bcc = input.bcc;
  if (input.replyTo) payload.replyTo = input.replyTo;
  if (input.attachments?.length) payload.attachments = input.attachments;

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    throw new Error(error.message || "No se pudo enviar el correo");
  }

  return {
    enviado: true,
    modo: "real" as const,
    id: data?.id ?? null
  };
}
