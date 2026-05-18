import sql from "mssql";
import { env } from "./env";

const config: sql.config = {
  user: env.db.user,
  password: env.db.password,
  server: env.db.server,
  port: env.db.port,
  database: env.db.database,

  options: {
    encrypt: env.db.encrypt,
    trustServerCertificate: env.db.trustServerCertificate,
    enableArithAbort: true
  },

  pool: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    idleTimeoutMillis: env.db.poolIdleTimeoutMs,
    acquireTimeoutMillis: env.db.poolAcquireTimeoutMs,
    createTimeoutMillis: env.db.poolCreateTimeoutMs,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  },

  requestTimeout: env.db.requestTimeoutMs,
  connectionTimeout: env.db.connectionTimeoutMs
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry() {
  const retries = Math.max(0, env.db.connectRetries);
  const baseDelay = Math.max(200, env.db.connectRetryDelayMs);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (error) {
      const isLast = attempt === retries;
      if (isLast) throw error;

      const waitMs = baseDelay * (attempt + 1);
      console.warn(
        `Fallo conectando a SQL Server (intento ${attempt + 1}/${retries + 1}). Reintentando en ${waitMs}ms...`
      );
      await sleep(waitMs);
    }
  }

  throw new Error("No se pudo establecer conexion SQL Server");
}

export async function getPool() {
  if (!poolPromise) {
    console.log("Conectando a SQL Server...");
    poolPromise = connectWithRetry()
      .then((pool) => {
        console.log("Pool SQL Server conectado");
        return pool;
      })
      .catch((error) => {
        console.error("Error conectando a SQL Server:", error);
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

export { sql };
