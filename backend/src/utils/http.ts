import { Response } from "express";
export function ok(res: Response, data: unknown, message = "OK") { return res.status(200).json({ ok: true, message, data }); }
export function created(res: Response, data: unknown, message = "Creado correctamente") { return res.status(201).json({ ok: true, message, data }); }
export function badRequest(res: Response, message = "Solicitud inválida", issues?: unknown) { return res.status(400).json({ ok: false, message, issues }); }
export function unauthorized(res: Response, message = "No autorizado") { return res.status(401).json({ ok: false, message }); }
export function forbidden(res: Response, message = "Acceso denegado") { return res.status(403).json({ ok: false, message }); }
export function serverError(res: Response, error: unknown) { console.error(error); return res.status(500).json({ ok: false, message: "Error interno del servidor" }); }
