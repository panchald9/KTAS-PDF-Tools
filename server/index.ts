import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { closeDatabase } from "./db";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5000);

const server = app.listen(port, host, () => {
  logger.info(`Server listening on http://${host}:${port}`);
  console.log(`\n======================================================`);
  console.log(`  KTAS Tools server running at http://localhost:${port}`);
  console.log(`  Network access: http://${host}:${port}`);
  console.log(`======================================================\n`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[KTAS Error] Port ${port} is already in use by another process.`);
    console.error(`Check running processes with: lsof -i :${port} or netstat -nlp | grep :${port}\n`);
  } else {
    console.error("\n[KTAS Error] Server failed to start:", err);
  }
  process.exit(1);
});

let isShuttingDown = false;
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[KTAS] Received ${signal}, closing server gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    closeDatabase();
    console.log("[KTAS] Server closed successfully.");
    process.exit(0);
  });

  // Force close within 2 seconds if active sockets hang
  const timer = setTimeout(() => {
    console.warn("[KTAS] Forced shutdown after timeout.");
    process.exit(0);
  }, 2000);
  timer.unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
