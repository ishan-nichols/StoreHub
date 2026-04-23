import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Allow credentials for cookie-based auth.
// In production, restrict ALLOWED_ORIGINS to known domains.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : null;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin / server-to-server
      if (!allowedOrigins) return callback(null, true); // dev: allow all
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use("/api", router);

// ─── JSON error handler (must have 4 params so Express treats it as error middleware) ───
// Replaces Express's default HTML error page with a JSON response for every API error.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = (err as Error & { status?: number; statusCode?: number }).status
    ?? (err as Error & { status?: number; statusCode?: number }).statusCode
    ?? 500;
  res.status(status).json({ error: err.message ?? "Internal server error" });
});

export default app;
