import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
app.disable("x-powered-by");
app.use(express.json({ limit: "43mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);
app.use((error: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  if (status === 500) logger.error({ err: error }, "API request failed");
  res.status(status).json({ error: status === 413 ? "Uploads exceed the request size limit." : status === 400 ? "The request could not be read." : "The server could not complete this request. Please try again." });
});

export default app;
