"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (!value)
        throw new Error(`Falta la variable de entorno ${name}`);
    return value;
}
function parseFrontendUrls() {
    const urls = [
        process.env.FRONTEND_URL,
        ...(process.env.FRONTEND_URLS || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
    ]
        .filter(Boolean)
        .map((url) => String(url).replace(/\/+$/, ""));
    return Array.from(new Set(urls));
}
exports.env = {
    port: Number(process.env.PORT || 3001),
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
    frontendUrls: parseFrontendUrls(),
    db: {
        server: required("DB_SERVER"),
        port: Number(process.env.DB_PORT || 1433),
        database: required("DB_DATABASE"),
        user: required("DB_USER"),
        password: required("DB_PASSWORD"),
        encrypt: String(process.env.DB_ENCRYPT) === "true",
        trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE) !== "false"
    },
    jwtSecret: required("JWT_SECRET"),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
        apiKey: process.env.CLOUDINARY_API_KEY || "",
        apiSecret: process.env.CLOUDINARY_API_SECRET || "",
        folder: process.env.CLOUDINARY_FOLDER || "profe360"
    },
    mail: {
        resendApiKey: process.env.RESEND_API_KEY || "",
        fromEmail: process.env.MAIL_FROM || "",
        fromName: process.env.MAIL_FROM_NAME || "Profe360"
    }
};
process.env.DATABASE_URL = `sqlserver://${exports.env.db.user}:${encodeURIComponent(exports.env.db.password)}@${exports.env.db.server}:${exports.env.db.port};database=${exports.env.db.database};encrypt=${exports.env.db.encrypt};trustServerCertificate=${exports.env.db.trustServerCertificate}`;
