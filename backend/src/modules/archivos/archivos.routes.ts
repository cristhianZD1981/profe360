import { Router } from "express";
import multer from "multer";
import streamifier from "streamifier";
import { requireAuth } from "../../middlewares/auth.middleware";
import { created, badRequest } from "../../utils/http";
import { cloudinary, cloudinaryEnabled } from "../../config/cloudinary";
import { env } from "../../config/env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(requireAuth);

router.post("/subir", upload.single("archivo"), async (req, res) => {
  if (!req.file) return badRequest(res, "No se recibió archivo");
  if (!cloudinaryEnabled) {
    return created(res, { modo: "simulado", nombre: req.file.originalname, tamano: req.file.size }, "Cloudinary no está configurado");
  }

  const result = await new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: env.cloudinary.folder, resource_type: "auto" }, (error, uploaded) => {
      if (error) reject(error); else resolve(uploaded);
    });
    streamifier.createReadStream(req.file.buffer).pipe(stream);
  });

  return created(res, result, "Archivo subido correctamente");
});
export default router;
