#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
console.log("🚀 Inspector server is starting...");
try {
    (0, server_1.startServer)();
}
catch (err) {
    console.error("💥 CRITICAL ERROR DURING STARTUP:", err);
    process.exit(1);
}
// תפיסת שגיאות אסינכרוניות שלא נתפסו
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
//# sourceMappingURL=cli.js.map