"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = exports.cloudinaryEnabled = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const env_1 = require("./env");
exports.cloudinaryEnabled = Boolean(env_1.env.cloudinary.cloudName && env_1.env.cloudinary.apiKey && env_1.env.cloudinary.apiSecret);
if (exports.cloudinaryEnabled) {
    cloudinary_1.v2.config({
        cloud_name: env_1.env.cloudinary.cloudName,
        api_key: env_1.env.cloudinary.apiKey,
        api_secret: env_1.env.cloudinary.apiSecret
    });
}
