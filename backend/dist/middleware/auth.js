"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token no enviado" });
    }
    const token = header.replace("Bearer ", "");
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        return res.status(401).json({ message: "Token inválido" });
    }
}
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "No autenticado" });
        }
        const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
        if (!hasRole) {
            return res.status(403).json({ message: "Sin permisos" });
        }
        next();
    };
}
