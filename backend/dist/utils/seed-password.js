"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const password = process.argv[2] || "Admin123*";
bcryptjs_1.default.hash(password, 10).then((hash) => {
    console.log(hash);
});
