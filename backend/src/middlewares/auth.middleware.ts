import { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/http";
import { verifyToken } from "../utils/jwt";

declare global {
  namespace Express { interface Request { auth?: import("../utils/jwt").JwtPayload; } }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return unauthorized(res, "Token no enviado");
  try {
    req.auth = verifyToken(header.replace("Bearer ", "").trim());
    next();
  } catch {
    return unauthorized(res, "Token inválido o vencido");
  }
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return unauthorized(res);
    const hasRole = req.auth.roles.some((role) => roles.includes(role));
    if (!hasRole) return forbidden(res, "No tenés permisos para esta acción");
    next();
  };
}
