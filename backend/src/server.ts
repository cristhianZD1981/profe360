import { createApp } from "./app";
import { env } from "./config/env";
import { getPool } from "./config/database";
import { procesarSustitucionesProfesor } from "./modules/academico/sustitucion-profesor.utils";
async function bootstrap() {
  const pool = await getPool();
  await procesarSustitucionesProfesor(pool).catch((error) => {
    console.error("No se pudieron procesar las sustituciones de profesores al iniciar:", error);
  });
  const sustitucionesTimer = setInterval(() => {
    void procesarSustitucionesProfesor(pool).catch((error) => {
      console.error("No se pudieron procesar las sustituciones de profesores:", error);
    });
  }, 60_000);
  sustitucionesTimer.unref?.();
  createApp().listen(env.port, () => console.log(`API lista en http://localhost:${env.port}`));
}
bootstrap().catch((error) => { console.error(error); process.exit(1); });
