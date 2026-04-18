"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const streamifier_1 = __importDefault(require("streamifier"));
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const http_1 = require("../../utils/http");
const cloudinary_1 = require("../../config/cloudinary");
const env_1 = require("../../config/env");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.use(auth_middleware_1.requireAuth);
router.post("/subir", upload.single("archivo"), async (req, res) => {
    if (!req.file)
        return (0, http_1.badRequest)(res, "No se recibió archivo");
    if (!cloudinary_1.cloudinaryEnabled) {
        return (0, http_1.created)(res, { modo: "simulado", nombre: req.file.originalname, tamano: req.file.size }, "Cloudinary no está configurado");
    }
    const result = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.cloudinary.uploader.upload_stream({ folder: env_1.env.cloudinary.folder, resource_type: "auto" }, (error, uploaded) => {
            if (error)
                reject(error);
            else
                resolve(uploaded);
        });
        streamifier_1.default.createReadStream(req.file.buffer).pipe(stream);
    });
    return (0, http_1.created)(res, result, "Archivo subido correctamente");
});
exports.default = router;
