import express, { type Express } from "express";
import type { Database } from "./db/database.js";
import { apiDocsRouter } from "./api-docs/api-spec.js";
import { rejectUnknownRoute, sendErrorAsJson } from "./middleware/json-errors.js";
import { assignRequestId } from "./middleware/request-id.js";
import { ProductRepository } from "./products/product.repository.js";
import { productRouter } from "./products/product.routes.js";

export interface AppOptions {
  /** Log one JSON line per request (off in tests). */
  logRequests?: boolean;
}

export function createApp(db: Database, { logRequests = false }: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  // ETags are set explicitly from the row version (see product.routes.ts),
  // not generated from response bodies.
  app.set("etag", false);
  app.use(assignRequestId({ log: logRequests }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "error", database: "down" });
    }
  });

  app.use(apiDocsRouter());
  app.use("/api/products", productRouter(new ProductRepository(db)));

  app.use(rejectUnknownRoute);
  app.use(sendErrorAsJson);

  return app;
}
