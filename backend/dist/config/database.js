"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
exports.getPool = getPool;
const mssql_1 = __importDefault(require("mssql"));
exports.sql = mssql_1.default;
const env_1 = require("./env");
const config = {
    user: env_1.env.db.user,
    password: env_1.env.db.password,
    server: env_1.env.db.server,
    port: env_1.env.db.port,
    database: env_1.env.db.database,
    options: {
        encrypt: env_1.env.db.encrypt,
        trustServerCertificate: env_1.env.db.trustServerCertificate
    }
};
let poolPromise = null;
async function getPool() {
    if (!poolPromise)
        poolPromise = new mssql_1.default.ConnectionPool(config).connect();
    return poolPromise;
}
