import { Resend } from "resend";
import { createHash, randomUUID } from "node:crypto";
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
  /** Stable per-operation key. Retries reuse the same Resend idempotency key. */
  idempotencyKey?: string;
}

export interface SendBatchEmailInput {
  from?: string;
  to: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  replyTo?: EmailAddress;
  idempotencyKey?: string;
}

function buildFromAddress() {
  if (!env.mail.fromEmail) return "";
  if (!env.mail.fromName) return env.mail.fromEmail;
  return `${env.mail.fromName} <${env.mail.fromEmail}>`;
}

let resendClient: Resend | null = null;

function getResendClient() {
  if (!env.mail.resendApiKey) return null;
  if (!resendClient) resendClient = new Resend(env.mail.resendApiKey);
  return resendClient;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryStatus(error: any) {
  return Number(error?.statusCode || error?.status || error?.response?.status || 0);
}

function getRetryAfterMs(error: any) {
  const raw = error?.headers?.["retry-after"] || error?.response?.headers?.["retry-after"];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

function isRetryableResendError(error: any) {
  const status = getRetryStatus(error);
  return status === 429 || status >= 500;
}

async function withResendRetries<T>(operation: () => Promise<T>) {
  const maxRetries = Math.max(0, env.mail.resendMaxRetries);
  const baseDelay = Math.max(250, env.mail.resendRetryBaseDelayMs);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error: any) {
      if (!isRetryableResendError(error) || attempt >= maxRetries) throw error;
      const retryAfter = getRetryAfterMs(error);
      const delay = retryAfter || baseDelay * Math.pow(2, attempt);
      console.warn(`Resend respondió ${getRetryStatus(error) || "error temporal"}. Reintentando en ${delay}ms...`);
      await sleep(delay);
    }
  }
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

  const resend = getResendClient();
  if (!resend) throw new Error("RESEND_API_KEY no configurada");

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

  const idempotencyKey = input.idempotencyKey || randomUUID();
  const response = await withResendRetries(async () => {
    const result = await resend.emails.send(payload, { idempotencyKey });
    if (result.error) {
      throw Object.assign(new Error(result.error.message || "No se pudo enviar el correo"), result.error, { headers: result.headers });
    }
    return result;
  });
  const { data, error } = response;

  if (error) {
    throw new Error(error.message || "No se pudo enviar el correo");
  }

  return {
    enviado: true,
    modo: "real" as const,
    id: data?.id ?? null
  };
}

export async function sendEmailsBatch(inputs: SendBatchEmailInput[]) {
  if (!inputs.length) return [];
  if (!env.mail.resendApiKey || !env.mail.fromEmail) {
    return inputs.map(() => ({ enviado: false, modo: "simulado" as const, motivo: "Faltan RESEND_API_KEY o MAIL_FROM en las variables de entorno" }));
  }

  const resend = getResendClient();
  if (!resend) throw new Error("RESEND_API_KEY no configurada");
  const chunks: SendBatchEmailInput[][] = [];
  for (let index = 0; index < inputs.length; index += env.mail.resendBatchSize) {
    chunks.push(inputs.slice(index, index + env.mail.resendBatchSize));
  }

  const results: Array<{ enviado: boolean; modo: "real" | "simulado"; id: string | null }> = [];
  for (const chunk of chunks) {
    const payload = chunk.map((input) => ({
      from: input.from || buildFromAddress(),
      to: input.to,
      subject: input.subject,
      ...(input.html ? { html: input.html } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.cc ? { cc: input.cc } : {}),
      ...(input.bcc ? { bcc: input.bcc } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {})
    }));
    // Resend rechaza reutilizar una clave durante 24 horas si cambia el cuerpo.
    // Incluimos el payload exacto para conservar la deduplicación del mismo lote
    // y permitir un nuevo envío cuando el contenido realmente cambió.
    const keyMaterial = [
      chunk.map((input) => input.idempotencyKey || randomUUID()).join("|"),
      JSON.stringify(payload)
    ].join("|");
    const idempotencyKey = createHash("sha256").update(keyMaterial).digest("hex");
    const response = await withResendRetries(async () => {
      const result = await resend.batch.send(payload, { idempotencyKey, batchValidation: "permissive" });
      if (result.error) {
        throw Object.assign(new Error(result.error.message || "No se pudo enviar el lote de correos"), result.error, { headers: result.headers });
      }
      return result;
    });
    const ids = response.data || [];
    const errorsByIndex = new Map<number, any>(((response as any).errors || []).map((item: any) => [Number(item.index), item]));
    let successfulIndex = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      const itemError = errorsByIndex.get(index);
      if (itemError) {
        results.push({ enviado: false, modo: "real", id: null, error: itemError.message || "Correo rechazado en el lote" } as any);
      } else {
        results.push({ enviado: true, modo: "real", id: ids[successfulIndex]?.id ?? null });
        successfulIndex += 1;
      }
    }
  }
  return results;
}
