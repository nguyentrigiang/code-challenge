import { Router, type Request, type Response } from "express";
import { HttpError, NotFoundError, PreconditionFailedError } from "../errors.js";
import type { ProductRepository, WriteResult } from "./product.repository.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdSchema,
  updateProductSchema,
  type Product,
} from "./product.schema.js";

// Validation errors thrown by `.parse()` (and any other error thrown here) are turned
// into JSON error responses by the error middleware. Express 5 also forwards errors
// from async handlers, so no try/catch is needed in the routes.
export function productRouter(repository: ProductRepository): Router {
  const router = Router();

  // Create a product
  router.post("/", (req, res) => {
    const input = createProductSchema.parse(req.body);

    const product = repository.create(input);

    setETagHeader(res, product);
    res.status(201);
    res.location(`${req.baseUrl}/${product.id}`);
    res.json({ data: product });
  });

  // List products with filters, sorting and pagination
  router.get("/", (req, res) => {
    const query = listProductsQuerySchema.parse(req.query);

    const { items, total } = repository.list(query);

    const totalPages = Math.ceil(total / query.limit);
    res.json({
      data: items,
      meta: { page: query.page, limit: query.limit, total, totalPages },
    });
  });

  // Get one product
  router.get("/:id", (req, res) => {
    const { id } = productIdSchema.parse(req.params);

    const product = repository.findById(id);
    if (!product) {
      throw new NotFoundError(`Product ${id} not found`);
    }

    // If the client sends If-None-Match with this same ETag,
    // Express replies 304 Not Modified by itself.
    setETagHeader(res, product);
    res.json({ data: product });
  });

  // Partially update a product
  router.patch("/:id", (req, res) => {
    const { id } = productIdSchema.parse(req.params);
    const changes = updateProductSchema.parse(req.body);
    const expectedVersion = readExpectedVersion(req);

    const result = repository.update(id, changes, expectedVersion);
    const updatedProduct = getValueOrThrow(result, id);

    setETagHeader(res, updatedProduct);
    res.json({ data: updatedProduct });
  });

  // Delete a product
  router.delete("/:id", (req, res) => {
    const { id } = productIdSchema.parse(req.params);
    const expectedVersion = readExpectedVersion(req);

    const result = repository.delete(id, expectedVersion);
    getValueOrThrow(result, id);

    res.status(204).end();
  });

  return router;
}

// ---------------------------------------------------------------------------
// Optimistic concurrency (ETag / If-Match)
//
// The ETag of a product is its version number, e.g. "3".
// A client that sends it back in `If-Match` says: "only apply my change if the
// product is still at version 3". If someone else changed it in the meantime, the
// client gets 412 instead of silently overwriting the other change (a "lost update").
// `If-Match` is optional, so simple clients keep working without it.
// ---------------------------------------------------------------------------

function setETagHeader(res: Response, product: Product): void {
  res.set("ETag", `"${product.version}"`);
}

/**
 * Reads the `If-Match` header.
 * Returns the version the client expects, or `undefined` when there is no
 * precondition (header missing, or `*` which means "any version").
 */
function readExpectedVersion(req: Request): number | undefined {
  const header = req.get("If-Match")?.trim();

  if (header === undefined || header === "*") {
    return undefined;
  }

  // Expect exactly one quoted number, e.g. "3".
  const match = /^"(\d+)"$/.exec(header);
  if (!match) {
    throw new HttpError(
      400,
      "INVALID_PRECONDITION",
      'If-Match must be a single strong ETag, e.g. "3", as returned in the ETag header',
    );
  }

  return Number(match[1]);
}

/** Turns a failed write into the matching HTTP error (404 or 412). */
function getValueOrThrow<T>(result: WriteResult<T>, id: number): T {
  if (result.ok) {
    return result.value;
  }

  if (result.reason === "not_found") {
    throw new NotFoundError(`Product ${id} not found`);
  }

  // reason === "version_mismatch"
  throw new PreconditionFailedError(
    "Product was modified by another request; fetch it again and retry",
    { currentETag: `"${result.currentVersion}"` },
  );
}
