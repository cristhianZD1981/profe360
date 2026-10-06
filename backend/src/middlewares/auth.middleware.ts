import { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../utils/http";
import { verifyToken } from "../utils/jwt";
import { getPool, sql } from "../config/database";

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

/** Applies a caller-selected school only for Super Admin requests. The value is
 * verified against the institution table before it becomes the request scope. */
export function applyInstitutionScope(options: { required?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.roles?.includes("SUPER_ADMIN")) return next();

    const rawId = req.header("x-institucion-id");
    if (!rawId) {
      if (options.required) return res.status(400).json({ message: "Seleccioná una institución para continuar" });
      return next();
    }

    const institucionId = Number(rawId);
    if (!Number.isInteger(institucionId) || institucionId <= 0) {
      return res.status(400).json({ message: "La institución seleccionada no es válida" });
    }

    try {
      const pool = await getPool();
      const result = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query("SELECT TOP 1 InstitucionId FROM dbo.Institucion WHERE InstitucionId = @institucionId AND Activo = 1");
      if (!result.recordset.length) {
        return res.status(400).json({ message: "La institución seleccionada no existe o está inactiva" });
      }

      req.auth = { ...req.auth, institucionId };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
