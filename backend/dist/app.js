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
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: env_1.env.frontendUrl, credentials: true }));
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, morgan_1.default)("dev"));
    app.get("/", (_req, res) => res.json({ ok: true, nombre: "Profe360 API", mensaje: "Menos carga, más enseñanza" }));
    app.use("/api", routes_1.default);
    app.use(error_middleware_1.errorHandler);
    return app;
}
