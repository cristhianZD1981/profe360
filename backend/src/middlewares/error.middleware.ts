import { NextFunction, Request, Response } from "express";
import { serverError } from "../utils/http";
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      ok: false,
      message: "El Word de referencia es demasiado grande para procesarlo. El límite actual es 40 MB; reducí imágenes o dividí el documento antes de intentarlo nuevamente."
    });
  }
  return serverError(res, err);
}
