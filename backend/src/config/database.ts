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
    trustServerCertificate: env.db.trustServerCertificate
  }
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;
export async function getPool() {
  if (!poolPromise) poolPromise = new sql.ConnectionPool(config).connect();
  return poolPromise;
}
export { sql };
