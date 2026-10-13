import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Mount all API routes
app.use("/api", router);

// Serve static frontend in production (or when built)
const clientDist = path.resolve(process.cwd(), "client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Global error handler
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  if (status === 500) {
    logger.error({ err: error }, "API request failed");
  }
  res.status(status).json({
    error:
      status === 413
        ? "Uploads exceed the request size limit."
        : status === 400
        ? error.message || "The request could not be read."
        : "The server could not complete this request. Please try again.",
  });
});

export default app;
