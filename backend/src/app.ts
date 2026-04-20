import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";

export function createApp() {
  const app = express();

  const allowedOrigins = [
    "http://localhost:5173",
    "https://profe360cr.netlify.app",
    env.frontendUrl
  ].filter(Boolean) as string[];

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

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