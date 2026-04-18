require("dotenv").config();
const fs = require("fs");
const path = require("path");
const sql = require("mssql");

async function main() {
  const scriptPath = path.join(__dirname, "..", "sql", "REQUERIMIENTO_V1_script_BD.sql");
  const script = fs.readFileSync(scriptPath, "utf8");
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: "master",
    options: {
      encrypt: String(process.env.DB_ENCRYPT) === "true",
      trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE) !== "false"
    }
  };

  const pool = await sql.connect(config);
  const batches = script.split(/^GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  await pool.close();
  console.log("Base inicializada correctamente");
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
