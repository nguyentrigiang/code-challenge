import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrate.js";

// End-to-end through the HTTP layer against a real (in-memory) SQLite database.
const db = openDatabase(":memory:");
const app = createApp(db);

const sample = {
  sku: "KB-001",
  name: "Mechanical Keyboard",
  description: "87-key, brown switches",
  category: "electronics",
  price: 89.99,
  stock: 10,
};

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .send({ ...sample, ...overrides })
    .expect(201);
  return res.body.data;
}

beforeAll(() => {
  runMigrations(db);
});

beforeEach(() => {
  db.exec("DELETE FROM products");
});

afterAll(() => {
  db.close();
});

describe("GET /health", () => {
  it("reports the database as up", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });
});

describe("POST /api/products", () => {
  it("creates a product with defaults", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ sku: "MUG-1", name: "Mug", category: "kitchen", price: 5 })
      .expect(201);

    expect(res.headers.location).toBe(`/api/products/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      sku: "MUG-1",
      name: "Mug",
      description: null,
      category: "kitchen",
      price: 5,
      stock: 0,
      status: "active",
    });
    expect(typeof res.body.data.id).toBe("number");
    expect(new Date(res.body.data.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("trims strings and keeps decimal prices exact", async () => {
    const product = await createProduct({ name: "  Keyboard  ", price: 19.99 });
    expect(product.name).toBe("Keyboard");
    expect(product.price).toBe(19.99);
  });

  it("rejects invalid input with details", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ sku: "bad sku!", name: "", category: "x", price: -1 })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["sku", "name", "price"]));
  });

  it("rejects prices with more than 2 decimals", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ ...sample, price: 1.234 })
      .expect(400);
    expect(res.body.error.details[0].path).toBe("price");
  });

  it("rejects unknown fields", async () => {
    await request(app)
      .post("/api/products")
      .send({ ...sample, id: 999 })
      .expect(400);
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Content-Type", "application/json")
      .send('{"name": ')
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("returns 409 for a duplicate SKU", async () => {
    await createProduct();
    const res = await request(app).post("/api/products").send(sample).expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("GET /api/products/:id", () => {
  it("returns the product", async () => {
    const created = await createProduct();
    const res = await request(app).get(`/api/products/${created.id}`).expect(200);
    expect(res.body.data).toEqual(created);
  });

  it("returns 404 when missing", async () => {
    const res = await request(app).get("/api/products/999999").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a non-numeric id", async () => {
    await request(app).get("/api/products/abc").expect(400);
  });
});

describe("GET /api/products", () => {
  beforeEach(async () => {
    await createProduct({ sku: "A1", name: "Wireless Mouse", category: "electronics", price: 25 });
    await createProduct({ sku: "A2", name: "USB-C Cable", category: "electronics", price: 9.5 });
    await createProduct({ sku: "B1", name: "Desk Lamp", category: "home", price: 40, status: "inactive" });
    await createProduct({
      sku: "B2",
      name: "Coffee Mug",
      description: "100% ceramic",
      category: "home",
      price: 12,
    });
  });

  const skus = (body: { data: { sku: string }[] }) => body.data.map((p) => p.sku);

  it("lists everything with pagination metadata", async () => {
    const res = await request(app).get("/api/products").expect(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
  });

  it("filters by category and status", async () => {
    const res = await request(app)
      .get("/api/products")
      .query({ category: "home", status: "active" })
      .expect(200);
    expect(skus(res.body)).toEqual(["B2"]);
  });

  it("filters by price range", async () => {
    const res = await request(app)
      .get("/api/products")
      .query({ minPrice: 10, maxPrice: 30, sort: "price" })
      .expect(200);
    expect(skus(res.body)).toEqual(["B2", "A1"]);
  });

  it("searches name, description and sku case-insensitively", async () => {
    const byName = await request(app).get("/api/products").query({ search: "mouse" });
    expect(skus(byName.body)).toEqual(["A1"]);

    const byDescription = await request(app).get("/api/products").query({ search: "ceramic" });
    expect(skus(byDescription.body)).toEqual(["B2"]);
  });

  it("treats LIKE wildcards in search literally", async () => {
    const res = await request(app).get("/api/products").query({ search: "100%" });
    expect(skus(res.body)).toEqual(["B2"]);

    // Unescaped, "_" would match any single character, i.e. every product.
    const none = await request(app).get("/api/products").query({ search: "_" });
    expect(none.body.data).toHaveLength(0);
  });

  it("sorts ascending and descending", async () => {
    const asc = await request(app).get("/api/products").query({ sort: "price" });
    expect(skus(asc.body)).toEqual(["A2", "B2", "A1", "B1"]);

    const desc = await request(app).get("/api/products").query({ sort: "-name" });
    expect(skus(desc.body)).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("paginates", async () => {
    const res = await request(app)
      .get("/api/products")
      .query({ sort: "price", page: 2, limit: 3 })
      .expect(200);
    expect(skus(res.body)).toEqual(["B1"]);
    expect(res.body.meta).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
  });

  it("rejects invalid query parameters", async () => {
    await request(app).get("/api/products").query({ sort: "password" }).expect(400);
    await request(app).get("/api/products").query({ limit: 1000 }).expect(400);
    await request(app).get("/api/products").query({ minPrice: 50, maxPrice: 10 }).expect(400);
  });
});

describe("PATCH /api/products/:id", () => {
  it("updates only the given fields", async () => {
    const created = await createProduct();
    const res = await request(app)
      .patch(`/api/products/${created.id}`)
      .send({ price: 79.5, status: "inactive", description: null })
      .expect(200);

    expect(res.body.data).toMatchObject({
      ...created,
      price: 79.5,
      status: "inactive",
      description: null,
      version: created.version + 1,
      updatedAt: expect.any(String),
    });
  });

  it("rejects an empty body", async () => {
    const created = await createProduct();
    await request(app).patch(`/api/products/${created.id}`).send({}).expect(400);
  });

  it("returns 404 when missing", async () => {
    await request(app).patch("/api/products/999999").send({ name: "x" }).expect(404);
  });

  it("returns 409 when changing to an existing SKU", async () => {
    await createProduct({ sku: "TAKEN" });
    const other = await createProduct({ sku: "OTHER" });
    await request(app).patch(`/api/products/${other.id}`).send({ sku: "TAKEN" }).expect(409);
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  it("returns the version as ETag and bumps it on every update", async () => {
    const created = await request(app).post("/api/products").send(sample).expect(201);
    expect(created.headers.etag).toBe('"1"');

    const updated = await request(app)
      .patch(`/api/products/${created.body.data.id}`)
      .set("If-Match", '"1"')
      .send({ stock: 5 })
      .expect(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.body.data.version).toBe(2);
  });

  it("rejects a stale If-Match with 412 and leaves the product unchanged", async () => {
    const { id } = await createProduct();
    // Two clients read version 1; the first one wins.
    await request(app).patch(`/api/products/${id}`).set("If-Match", '"1"').send({ stock: 1 }).expect(200);

    const res = await request(app)
      .patch(`/api/products/${id}`)
      .set("If-Match", '"1"')
      .send({ stock: 99 })
      .expect(412);
    expect(res.body.error).toMatchObject({
      code: "PRECONDITION_FAILED",
      details: { currentETag: '"2"' },
    });

    const current = await request(app).get(`/api/products/${id}`).expect(200);
    expect(current.body.data.stock).toBe(1);
  });

  it("guards DELETE with If-Match too", async () => {
    const { id } = await createProduct();
    await request(app).delete(`/api/products/${id}`).set("If-Match", '"7"').expect(412);
    await request(app).delete(`/api/products/${id}`).set("If-Match", '"1"').expect(204);
  });

  it("still allows unconditional writes and If-Match: *", async () => {
    const { id } = await createProduct();
    await request(app).patch(`/api/products/${id}`).send({ stock: 2 }).expect(200);
    await request(app).patch(`/api/products/${id}`).set("If-Match", "*").send({ stock: 3 }).expect(200);
  });

  it("rejects a malformed If-Match", async () => {
    const { id } = await createProduct();
    const res = await request(app)
      .patch(`/api/products/${id}`)
      .set("If-Match", "W/\"1\"")
      .send({ stock: 2 })
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_PRECONDITION");
  });

  it("returns 404, not 412, when the product does not exist", async () => {
    await request(app).patch("/api/products/999999").set("If-Match", '"1"').send({ stock: 1 }).expect(404);
  });

  it("answers 304 to a conditional GET with a matching If-None-Match", async () => {
    const { id } = await createProduct();
    await request(app).get(`/api/products/${id}`).set("If-None-Match", '"1"').expect(304);
  });
});

describe("request id", () => {
  it("generates one, returns it as a header and in error bodies", async () => {
    const res = await request(app).get("/api/products/999999").expect(404);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("reuses a valid incoming X-Request-Id", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "lb-trace-123").expect(200);
    expect(res.headers["x-request-id"]).toBe("lb-trace-123");
  });
});

describe("API docs", () => {
  it("serves an OpenAPI document generated from the validation schemas", async () => {
    const res = await request(app).get("/openapi.json").expect(200);
    expect(res.body.openapi).toBe("3.1.0");
    const createSchema =
      res.body.paths["/api/products"].post.requestBody.content["application/json"].schema;
    expect(createSchema.required).toEqual(["sku", "name", "category", "price"]);
    await request(app).get("/docs").expect(200).expect("Content-Type", /html/);
  });
});

describe("DELETE /api/products/:id", () => {
  it("deletes the product", async () => {
    const created = await createProduct();
    await request(app).delete(`/api/products/${created.id}`).expect(204);
    await request(app).get(`/api/products/${created.id}`).expect(404);
  });

  it("returns 404 when missing", async () => {
    await request(app).delete("/api/products/999999").expect(404);
  });
});

describe("unknown routes", () => {
  it("returns a JSON 404", async () => {
    const res = await request(app).get("/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
