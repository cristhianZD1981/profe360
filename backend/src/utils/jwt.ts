import jwt from "jsonwebtoken";
import { env } from "../config/env";
export type JwtPayload = { userId: number; correo: string; institucionId: number | null; sedeId: number | null; roles: string[]; nombre: string; };
export function signToken(payload: JwtPayload) { return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn }); }
export function verifyToken(token: string) { return jwt.verify(token, env.jwtSecret) as JwtPayload; }
