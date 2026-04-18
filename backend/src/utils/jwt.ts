import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = {
  userId: number;
  correo?: string;
  institucionId?: number | null;
  sedeId?: number | null;
  roles?: string[];
  nombre?: string;
  institucionNombre?: string | null;
  institucionNombreComercial?: string | null;
  institucionLogoUrl?: string | null;
  debeCambiarPassword?: boolean;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  usuarioId?: number;
  id?: number;
};

export function signToken(payload: JwtPayload) {
  return jwt.sign(
    payload as object,
    env.jwtSecret as jwt.Secret,
    {
      expiresIn: String(env.jwtExpiresIn) as jwt.SignOptions["expiresIn"]
    }
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret as jwt.Secret) as JwtPayload;
}