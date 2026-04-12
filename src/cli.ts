#!/usr/bin/env node

import { startServer } from './server';

console.log("🚀 Inspector server is starting...");

try {
  startServer();
} catch (err) {
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