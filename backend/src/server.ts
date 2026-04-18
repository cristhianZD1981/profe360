import { createApp } from "./app";
import { env } from "./config/env";
import { getPool } from "./config/database";
async function bootstrap() {
  await getPool();
  createApp().listen(env.port, () => console.log(`API lista en http://localhost:${env.port}`));
}
bootstrap().catch((error) => { console.error(error); process.exit(1); });
