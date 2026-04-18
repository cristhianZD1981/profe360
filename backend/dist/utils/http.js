"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.created = created;
exports.badRequest = badRequest;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.serverError = serverError;
function ok(res, data, message = "OK") { return res.status(200).json({ ok: true, message, data }); }
function created(res, data, message = "Creado correctamente") { return res.status(201).json({ ok: true, message, data }); }
function badRequest(res, message = "Solicitud inválida", issues) { return res.status(400).json({ ok: false, message, issues }); }
function unauthorized(res, message = "No autorizado") { return res.status(401).json({ ok: false, message }); }
function forbidden(res, message = "Acceso denegado") { return res.status(403).json({ ok: false, message }); }
function serverError(res, error) { console.error(error); return res.status(500).json({ ok: false, message: "Error interno del servidor" }); }
