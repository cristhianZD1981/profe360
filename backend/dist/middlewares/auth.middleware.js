"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRoles = requireRoles;
const http_1 = require("../utils/http");
const jwt_1 = require("../utils/jwt");
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return (0, http_1.unauthorized)(res, "Token no enviado");
    try {
        req.auth = (0, jwt_1.verifyToken)(header.replace("Bearer ", "").trim());
        next();
    }
    catch {
        return (0, http_1.unauthorized)(res, "Token inválido o vencido");
    }
}
function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.auth)
            return (0, http_1.unauthorized)(res);
        const hasRole = req.auth.roles.some((role) => roles.includes(role));
        if (!hasRole)
            return (0, http_1.forbidden)(res, "No tenés permisos para esta acción");
        next();
    };
}
