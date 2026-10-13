# Problem 5: A Crude Server

> ⏰ Duration: You should not spend more than **16 hours** on this problem.
> *Time estimation is for internship roles, if you are a software professional you should spend significantly less time.*

# Task

Develop a backend server with ExpressJS. You are required to build a set of CRUD interface that allow a user to interact with the service. You are required to use TypeScript for this task.

1. Interface functionalities:
    1. Create a resource.
    2. List resources with basic filters.
    3. Get details of a resource.
    4. Update resource details.
    5. Delete a resource.
2. You should connect your backend service with a simple database for data persistence.
3. Provide `README.md` for the configuration and the way to run application.


---

# Solution

A CRUD REST API for products, built with Express 5 and TypeScript, with data stored in SQLite.

- `npm install && npm run dev` is enough to run it. You do not need a database server, Docker or a native build.
- Updates and deletes support optimistic concurrency through standard HTTP `ETag` and `If-Match` headers. When two clients edit the same product, the second write gets `412` instead of overwriting the first.
- OpenAPI 3.1 docs are served at `/docs`. They are generated from the Zod schemas that validate requests, so they stay in sync with the code.
- Every response and error body carries a request ID, and each request writes one JSON log line.
- 36 end-to-end tests run through the real HTTP stack against a real SQLite database.

## Tech stack

| Concern | Choice |
|---|---|
| HTTP server | Express 5 |
| Language | TypeScript (strict) |
| Database | SQLite via Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html), so there is nothing native to build and no DB server to install |
| Validation | Zod (request body, query string, path params, env vars) |
| Migrations | Small built-in runner applying `migrations/*.sql` in order, run automatically on startup |
| API docs | OpenAPI 3.1 generated from the Zod schemas (`z.toJSONSchema`), Swagger UI at `/docs` |
| Tests | Vitest + Supertest, end-to-end through HTTP against an in-memory SQLite database |

## Project structure

```
src/
├── server.ts                  # entry point: open DB, migrate, listen, graceful shutdown
├── app.ts                     # express app factory (used by server and tests)
├── config.ts                  # env var loading + validation
├── errors.ts                  # HttpError / NotFoundError / ConflictError
├── api-docs/
│   └── api-spec.ts            # OpenAPI spec + /docs page
├── db/
│   ├── database.ts            # open SQLite file, pragmas, transaction helper
│   ├── migrate.ts             # migration runner (`npm run migrate`)
│   └── seed.ts                # sample data (`npm run seed`)
├── middleware/
│   ├── json-errors.ts         # turns every error into the same JSON shape
│   └── request-id.ts          # X-Request-Id + one JSON log line per request
└── products/
    ├── product.schema.ts      # Zod schemas + types
    ├── product.repository.ts  # SQL queries
    └── product.routes.ts      # HTTP handlers
migrations/                    # 001_create_products.sql, 002_add_product_version.sql
tests/products.test.ts
requests.http                  # ready-made example requests
```

## Running the application

Requires Node.js >= 22.13 for the built-in `node:sqlite` module.

```bash
cd src/problem5
npm install
npm run seed     # optional: creates the DB and inserts 8 sample products
npm run dev      # http://localhost:3000, reloads on change
```

```bash
curl http://localhost:3000/health   # {"status":"ok","database":"up"}
```

The first start creates the database file (`data/crude.sqlite` by default) and its schema.
Interactive API docs are at http://localhost:3000/docs, and the raw spec is at `/openapi.json`.

Production build:

```bash
npm run build
npm start
```

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start in watch mode (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run migrate` | Apply pending migrations (also done automatically on startup) |
| `npm run seed` | Insert sample products (safe to run more than once) |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check `src` and `tests` |

## Configuration

Settings come from environment variables or a `.env` file (`cp .env.example .env`).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_FILE` | `data/crude.sqlite` | SQLite database file (use `:memory:` for a throwaway DB) |

## Running the tests

```bash
npm test
```

The 36 tests call every endpoint through the real HTTP stack, using an in-memory SQLite database that is reset between tests. They cover successful requests, validation, filters, sorting, pagination, 404 and 409 responses, LIKE wildcard escaping, ETag/If-Match concurrency including the lost-update case, conditional GET, request IDs and the OpenAPI document.

## API

Base URL: `http://localhost:3000/api/products`. Full contract at [`/docs`](http://localhost:3000/docs). Example requests are in [`requests.http`](./requests.http) (VS Code REST Client / JetBrains HTTP Client).

### Resource

```json
{
  "id": 1,
  "sku": "KB-001",
  "name": "Mechanical Keyboard",
  "description": "87-key, brown switches",
  "category": "electronics",
  "price": 89.99,
  "stock": 25,
  "status": "active",
  "version": 1,
  "createdAt": "2026-10-12T06:21:57.120Z",
  "updatedAt": "2026-10-12T06:21:57.120Z"
}
```

| Field | Rules |
|---|---|
| `sku` | required, unique, 1 to 64 chars, letters/digits/`-`/`_` |
| `name` | required, 1 to 255 chars |
| `description` | optional, nullable, ≤ 10,000 chars |
| `category` | required, 1 to 100 chars |
| `price` | required, ≥ 0, at most 2 decimal places |
| `stock` | integer ≥ 0, default `0` |
| `status` | `active` \| `inactive`, default `active` |

The server sets `id`, `version`, `createdAt` and `updatedAt`. Requests with unknown fields are rejected.

### Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/api/products` | Create a product | `201` + `Location` header |
| `GET` | `/api/products` | List products with filters | `200` |
| `GET` | `/api/products/:id` | Get a product | `200` |
| `PATCH` | `/api/products/:id` | Partially update a product | `200` |
| `DELETE` | `/api/products/:id` | Delete a product | `204` |
| `GET` | `/health` | Liveness + database check | `200` / `503` |
| `GET` | `/docs`, `/openapi.json` | API documentation | `200` |

### List filters (query string)

| Param | Example | Description |
|---|---|---|
| `search` | `search=mouse` | Match on name, description or SKU (case-insensitive for ASCII) |
| `category` | `category=electronics` | Exact category |
| `status` | `status=active` | `active` or `inactive` |
| `minPrice` / `maxPrice` | `minPrice=10&maxPrice=50` | Inclusive price range |
| `sort` | `sort=-price` | `name`, `price`, `stock`, `createdAt`, `updatedAt`; prefix `-` for descending. Default `-createdAt` |
| `page` / `limit` | `page=2&limit=10` | Pagination, `limit` max 100 (default 20) |

```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

### Concurrency: ETag / If-Match

Every product response has an `ETag: "<version>"` header, and the version goes up by one on each update.
Sending it back in `If-Match` on `PATCH` or `DELETE` makes the write conditional:

```bash
curl -i localhost:3000/api/products/1                    # ETag: "3"
curl -X PATCH localhost:3000/api/products/1 \
  -H 'If-Match: "3"' -H 'Content-Type: application/json' -d '{"stock":5}'
# 200 if nobody changed it since; 412 PRECONDITION_FAILED (with the current ETag) if someone did
```

The version check and the write run as one statement (`UPDATE ... WHERE id = ? AND version = ?`), so two concurrent writers cannot both succeed.
`If-Match` is optional, and clients that do not send it keep working. A `GET` with a matching `If-None-Match` returns `304 Not Modified`.

### Errors

All errors have the same shape and include the `requestId`, which is also returned in the `X-Request-Id` header and written to the request log:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "price", "message": "Too small: expected number to be >=0" }],
    "requestId": "c44a804c-7321-489a-a80d-12bbf5b9e3fc"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body, query or path parameter |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 404 | `NOT_FOUND` | Unknown product id or route |
| 400 | `INVALID_PRECONDITION` | `If-Match` is not a single strong ETag |
| 409 | `CONFLICT` | SKU already exists |
| 412 | `PRECONDITION_FAILED` | `If-Match` no longer matches because someone else changed the product |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 KB |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, not returned) |

### Examples (curl)

```bash
# Create
curl -X POST http://localhost:3000/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"HP-001","name":"Headphones","category":"electronics","price":149.99,"stock":30}'

# List: active electronics under 100, cheapest first
curl 'http://localhost:3000/api/products?category=electronics&status=active&maxPrice=100&sort=price'

# Get
curl http://localhost:3000/api/products/1

# Update
curl -X PATCH http://localhost:3000/api/products/1 \
  -H 'Content-Type: application/json' \
  -d '{"price":129.99,"stock":25}'

# Delete
curl -X DELETE http://localhost:3000/api/products/1
```

## Design notes and assumptions

- The problem leaves the resource open. I picked `product` because it has text, enum and numeric fields to filter on.
- The task asks for "a simple database". With SQLite, reviewers can run everything after `npm install`. Only the repository layer touches SQL, so a move to PostgreSQL or MySQL would stay inside it.
- Updates use `PATCH` because partial updates are the common case. An empty body is rejected.
- All values are bound parameters. Dynamic column names for sorting and updates come only from whitelists. `%` and `_` in `search` are escaped so they match literally.
- Prices are stored as integer cents (`price_cents`) to avoid floating-point rounding, and exposed as a decimal `price`.
- Results are ordered by the sort column and then by `id`, so pages stay stable when values tie.
- Locking is optimistic. Edits are rare and short, so rejecting the second writer with `412` costs less than holding locks. The version is also the ETag, so clients use standard HTTP headers.
- Create has no `Idempotency-Key`. The SKU is unique, so a retried `POST` returns `409` and never creates a duplicate.
- Out of scope: authentication, rate limiting and full-text search. With more time I would add auth with per-user rate limits, and move to PostgreSQL behind the same repository interface.
