"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
function normalizeOrigin(value) {
    return value.replace(/\/+$/, "").toLowerCase();
}
function createApp() {
    const app = (0, express_1.default)();
    const defaultOrigins = [
        "http://localhost:5173",
        "https://profe360cr.netlify.app",
        "https://profe360cr.com",
        "https://www.profe360cr.com",
        "http://profe360cr.com",
        "http://www.profe360cr.com"
    ];
    const allowedOrigins = Array.from(new Set([...defaultOrigins, ...(env_1.env.frontendUrls || [])]
        .filter(Boolean)
        .map((origin) => normalizeOrigin(String(origin)))));
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            const normalizedOrigin = normalizeOrigin(origin);
            if (allowedOrigins.includes(normalizedOrigin)) {
                return callback(null, true);
            }
            console.error("Origen no permitido por CORS:", origin);
            return callback(new Error("Origen no permitido por CORS"));
        },
        credentials: true
    }));
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, morgan_1.default)("dev"));
    app.get("/", (_req, res) => res.json({
        ok: true,
        nombre: "Profe360 API",
        mensaje: "Menos carga, más enseñanza"
    }));
    app.use("/api", routes_1.default);
    app.use(error_middleware_1.errorHandler);
    return app;
}
