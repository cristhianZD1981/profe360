import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
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

export const env = {
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
    trustServerCertificate:
      String(process.env.DB_TRUST_SERVER_CERTIFICATE) !== "false"
  },
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "profe360"
  }
};

process.env.DATABASE_URL = `sqlserver://${env.db.user}:${encodeURIComponent(
  env.db.password
)}@${env.db.server}:${env.db.port};database=${env.db.database};encrypt=${env.db.encrypt};trustServerCertificate=${env.db.trustServerCertificate}`;