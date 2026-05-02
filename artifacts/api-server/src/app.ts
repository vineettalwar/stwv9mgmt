import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

// CORS: explicit allowlist only — never reflect arbitrary origins with credentials.
// Origins are the Replit dev domain and any explicitly configured FRONTEND_URL.
const buildAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (frontendUrl) origins.add(frontendUrl.replace(/\/$/, ""));

  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) {
    origins.add(`https://${devDomain}`);
    // mgmt artifact is mounted under the same dev domain
    origins.add(`https://${devDomain}/mgmt`);
  }

  // Vite dev server (local development)
  origins.add("http://localhost:5173");
  origins.add("http://localhost:5174");

  return origins;
};

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      if (!origin) { callback(null, true); return; }
      if (allowedOrigins.has(origin)) { callback(null, true); return; }
      // In development only: allow any *.replit.dev subdomain (proxied Replit preview pane).
      // In production, only explicitly configured origins (FRONTEND_URL + REPLIT_DEV_DOMAIN) are accepted.
      if (process.env.NODE_ENV !== "production" && /^https:\/\/[a-z0-9-]+\.replit\.dev$/.test(origin)) {
        callback(null, true); return;
      }
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
  }),
);

app.use(express.json());
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

export default app;
