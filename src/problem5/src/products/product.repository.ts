import type { SQLInputValue } from "node:sqlite";
import type { Database } from "../db/database.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  Product,
  UpdateProductInput,
} from "./product.schema.js";

/** A row exactly as it is stored in the `products` table. */
interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  stock: number;
  status: Product["status"];
  version: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  "id, sku, name, description, category, price_cents, stock, status, version, created_at, updated_at";

// Maps API field names to DB column names.
// Column names cannot be bound as SQL parameters, so only names from these
// whitelists are ever placed in a query (no SQL injection through field names).
const UPDATABLE_COLUMNS: Record<keyof UpdateProductInput, string> = {
  sku: "sku",
  name: "name",
  description: "description",
  category: "category",
  price: "price_cents",
  stock: "stock",
  status: "status",
};

const SORTABLE_COLUMNS: Record<string, string> = {
  name: "name",
  price: "price_cents",
  stock: "stock",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

/** Money is stored as integer cents to avoid floating-point rounding errors. */
function priceToCents(price: number): number {
  return Math.round(price * 100);
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price_cents / 100,
    stock: row.stock,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Makes `%` and `_` in user input match literally instead of acting as LIKE wildcards. */
function escapeLikeWildcards(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type WriteFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "version_mismatch"; currentVersion: number };

/** Result of an update/delete: either it succeeded, or why it did not. */
export type WriteResult<T> = { ok: true; value: T } | WriteFailure;

export interface ProductPage {
  items: Product[];
  total: number;
}

export class ProductRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateProductInput): Product {
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `INSERT INTO products
           (sku, name, description, category, price_cents, stock, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sku,
        input.name,
        input.description ?? null,
        input.category,
        priceToCents(input.price),
        input.stock,
        input.status,
        now,
        now,
      );

    const newId = Number(result.lastInsertRowid);
    const createdProduct = this.findById(newId);
    if (!createdProduct) {
      throw new Error("Inserted product could not be read back");
    }
    return createdProduct;
  }

  findById(id: number): Product | null {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM products WHERE id = ?`).get(id);
    if (!row) {
      return null;
    }
    return rowToProduct(row as unknown as ProductRow);
  }

  list(query: ListProductsQuery): ProductPage {
    // Step 1: build the WHERE clause from the filters that were provided.
    // Each condition uses `?` placeholders; the values go into `params` in the same order.
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];

    if (query.search) {
      // Case-insensitive (for ASCII) substring match on name, description or SKU.
      // SQLite's LIKE has no default escape character, so we declare `\` as one.
      const pattern = `%${escapeLikeWildcards(query.search)}%`;
      conditions.push(
        "(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')",
      );
      params.push(pattern, pattern, pattern);
    }

    if (query.category) {
      conditions.push("category = ?");
      params.push(query.category);
    }

    if (query.status) {
      conditions.push("status = ?");
      params.push(query.status);
    }

    if (query.minPrice !== undefined) {
      conditions.push("price_cents >= ?");
      params.push(priceToCents(query.minPrice));
    }

    if (query.maxPrice !== undefined) {
      conditions.push("price_cents <= ?");
      params.push(priceToCents(query.maxPrice));
    }

    let whereClause = "";
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(" AND ")}`;
    }

    // Step 2: build the ORDER BY clause. A leading "-" means descending, e.g. "-price".
    const isDescending = query.sort.startsWith("-");
    const sortField = isDescending ? query.sort.slice(1) : query.sort;
    const sortColumn = SORTABLE_COLUMNS[sortField] ?? "created_at";
    const direction = isDescending ? "DESC" : "ASC";
    // Sorting by id as well keeps pages stable when several rows share the same value.
    const orderByClause = `ORDER BY ${sortColumn} ${direction}, id ${direction}`;

    // Step 3: count all matching rows (for pagination metadata).
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM products ${whereClause}`)
      .get(...params) as { total: number };

    // Step 4: fetch only the rows of the requested page.
    const rowsToSkip = (query.page - 1) * query.limit;
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM products
         ${whereClause}
         ${orderByClause}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, rowsToSkip) as unknown as ProductRow[];

    return {
      items: rows.map(rowToProduct),
      total: countRow.total,
    };
  }

  /**
   * Applies a partial update and increments the product's version.
   *
   * If `expectedVersion` is given, the row is only updated while it is still at that
   * version. The version check and the write happen in one SQL statement, so two
   * concurrent requests can never both succeed with the same old version.
   */
  update(id: number, changes: UpdateProductInput, expectedVersion?: number): WriteResult<Product> {
    // Step 1: one "column = ?" assignment per field the client sent.
    const assignments: string[] = [];
    const values: SQLInputValue[] = [];

    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) {
        continue;
      }
      const column = UPDATABLE_COLUMNS[field as keyof UpdateProductInput];
      assignments.push(`${column} = ?`);
      values.push(field === "price" ? priceToCents(value as number) : (value as SQLInputValue));
    }

    // Step 2: every update bumps the version and the update timestamp.
    assignments.push("version = version + 1");
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString());

    // Step 3: target the product by id, and optionally require the expected version.
    let whereClause = "WHERE id = ?";
    values.push(id);
    if (expectedVersion !== undefined) {
      whereClause += " AND version = ?";
      values.push(expectedVersion);
    }

    // Step 4: run it. If no row changed, find out whether the product is missing
    // or was modified by someone else.
    const sql = `UPDATE products SET ${assignments.join(", ")} ${whereClause}`;
    const result = this.db.prepare(sql).run(...values);

    const nothingWasUpdated = Number(result.changes) === 0;
    if (nothingWasUpdated) {
      return this.explainWhyWriteFailed(id);
    }

    const updatedProduct = this.findById(id)!;
    return { ok: true, value: updatedProduct };
  }

  /** Deletes the product. If `expectedVersion` is given, only while it is still at that version. */
  delete(id: number, expectedVersion?: number): WriteResult<void> {
    let sql = "DELETE FROM products WHERE id = ?";
    const values: SQLInputValue[] = [id];
    if (expectedVersion !== undefined) {
      sql += " AND version = ?";
      values.push(expectedVersion);
    }

    const result = this.db.prepare(sql).run(...values);

    const nothingWasDeleted = Number(result.changes) === 0;
    if (nothingWasDeleted) {
      return this.explainWhyWriteFailed(id);
    }
    return { ok: true, value: undefined };
  }

  /**
   * Called when an UPDATE/DELETE matched no row. There are two possible reasons:
   * the product does not exist, or it exists but its version has moved on.
   */
  private explainWhyWriteFailed(id: number): WriteFailure {
    const row = this.db.prepare("SELECT version FROM products WHERE id = ?").get(id) as
      | { version: number }
      | undefined;

    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "version_mismatch", currentVersion: row.version };
  }
}
