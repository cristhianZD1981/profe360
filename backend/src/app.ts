import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "").toLowerCase();
}

export function createApp() {
  const app = express();

  const defaultOrigins = [
    "http://localhost:5173",
    "https://profe360cr.netlify.app",
    "https://profe360cr.com",
    "https://www.profe360cr.com",
    "http://profe360cr.com",
    "http://www.profe360cr.com"
  ];

  const allowedOrigins = Array.from(
    new Set(
      [...defaultOrigins, ...(env.frontendUrls || [])]
        .filter(Boolean)
        .map((origin) => normalizeOrigin(String(origin)))
    )
  );

  app.use(helmet());

  app.use(
    cors({
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
    })
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  app.get("/", (_req, res) =>
    res.json({
      ok: true,
      nombre: "Profe360 API",
      mensaje: "Menos carga, más enseñanza"
    })
  );

  app.use("/api", routes);
  app.use(errorHandler);

  return app;
}