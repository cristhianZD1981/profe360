"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
async function bootstrap() {
    await (0, database_1.getPool)();
    (0, app_1.createApp)().listen(env_1.env.port, () => console.log(`API lista en http://localhost:${env_1.env.port}`));
}
bootstrap().catch((error) => { console.error(error); process.exit(1); });
