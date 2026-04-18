"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const http_1 = require("../utils/http");
function errorHandler(err, _req, res, _next) { return (0, http_1.serverError)(res, err); }
