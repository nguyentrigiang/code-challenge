import { Router } from "express";
import { z } from "zod";
import {
  createProductSchema,
  listProductsQuerySchema,
  PRODUCT_STATUSES,
  updateProductSchema,
} from "../products/product.schema.js";

// The request schemas below come from the same Zod schemas the routes validate with,
// so the documentation cannot drift from the actual behaviour.
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    io: "input", // describe what the client sends (before defaults are applied)
    unrepresentable: "any",
  }) as Record<string, unknown>;

  // OpenAPI embeds schemas, so the top-level "$schema" keyword is not wanted.
  delete converted.$schema;
  return converted;
}

// One OpenAPI query parameter per field of the list query schema.
const listParameters = [];
for (const [name, fieldSchema] of Object.entries(listProductsQuerySchema.shape)) {
  listParameters.push({ name, in: "query", required: false, schema: jsonSchema(fieldSchema) });
}

const idParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
};

const ifMatchHeader = {
  name: "If-Match",
  in: "header",
  required: false,
  description:
    'Optional optimistic-concurrency precondition: the ETag from a previous response, e.g. "3". ' +
    "If the product changed since, the request fails with 412 instead of overwriting.",
  schema: { type: "string", example: '"3"' },
};

const etagHeader = {
  ETag: { description: "Current version of the product", schema: { type: "string", example: '"3"' } },
};

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const productBody = {
  content: {
    "application/json": {
      schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Product" } } },
    },
  },
};

export const apiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Products API",
    version: "1.0.0",
    description: "CRUD API for products (Problem 5). Errors share one shape and carry a requestId.",
    license: { name: "MIT", identifier: "MIT" },
  },
  // Authentication is out of scope for this task: every operation is explicitly public.
  security: [],
  servers: [{ url: "/" }],
  paths: {
    "/api/products": {
      post: {
        operationId: "createProduct",
        summary: "Create a product",
        requestBody: {
          required: true,
          content: { "application/json": { schema: jsonSchema(createProductSchema) } },
        },
        responses: {
          "201": { description: "Created", headers: etagHeader, ...productBody },
          "400": error("Validation error or malformed JSON"),
          "409": error("SKU already exists"),
        },
      },
      get: {
        operationId: "listProducts",
        summary: "List products with filters, sorting and pagination",
        parameters: listParameters,
        responses: {
          "200": {
            description: "A page of products",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Product" } },
                    meta: { $ref: "#/components/schemas/PageMeta" },
                  },
                },
              },
            },
          },
          "400": error("Invalid query parameter"),
        },
      },
    },
    "/api/products/{id}": {
      get: {
        operationId: "getProduct",
        summary: "Get a product",
        parameters: [idParameter],
        responses: {
          "200": { description: "The product", headers: etagHeader, ...productBody },
          "304": { description: "Not modified (If-None-Match matched the ETag)" },
          "404": error("Product not found"),
        },
      },
      patch: {
        operationId: "updateProduct",
        summary: "Partially update a product",
        parameters: [idParameter, ifMatchHeader],
        requestBody: {
          required: true,
          content: { "application/json": { schema: jsonSchema(updateProductSchema) } },
        },
        responses: {
          "200": { description: "Updated product", headers: etagHeader, ...productBody },
          "400": error("Validation error"),
          "404": error("Product not found"),
          "409": error("SKU already exists"),
          "412": error("If-Match did not match: the product was modified by someone else"),
        },
      },
      delete: {
        operationId: "deleteProduct",
        summary: "Delete a product",
        parameters: [idParameter, ifMatchHeader],
        responses: {
          "204": { description: "Deleted" },
          "404": error("Product not found"),
          "412": error("If-Match did not match: the product was modified by someone else"),
        },
      },
    },
    "/health": {
      get: {
        operationId: "health",
        summary: "Liveness and database check",
        responses: { "200": { description: "OK" }, "503": { description: "Database unavailable" } },
      },
    },
  },
  components: {
    schemas: {
      Product: {
        type: "object",
        properties: {
          id: { type: "integer" },
          sku: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          category: { type: "string" },
          price: { type: "number" },
          stock: { type: "integer" },
          status: { type: "string", enum: [...PRODUCT_STATUSES] },
          version: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PageMeta: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
              requestId: { type: "string" },
            },
            required: ["code", "message", "requestId"],
          },
        },
      },
    },
  },
};

const docsHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Products API docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger" });</script>
  </body>
</html>`;

export function apiDocsRouter(): Router {
  const router = Router();
  router.get("/openapi.json", (_req, res) => {
    res.json(apiSpec);
  });
  router.get("/docs", (_req, res) => {
    res.type("html").send(docsHtml);
  });
  return router;
}
