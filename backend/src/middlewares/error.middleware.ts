import { NextFunction, Request, Response } from "express";
import { serverError } from "../utils/http";
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) { return serverError(res, err); }
