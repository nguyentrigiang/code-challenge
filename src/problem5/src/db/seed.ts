import { loadConfig } from "../config.js";
import { createProductSchema, type CreateProductInput } from "../products/product.schema.js";
import { openDatabase, transaction } from "./database.js";
import { runMigrations } from "./migrate.js";

type SampleProduct = Partial<CreateProductInput>;

const sampleProducts: SampleProduct[] = [
  {
    sku: "KB-001",
    name: "Mechanical Keyboard",
    description: "87-key, brown switches",
    category: "electronics",
    price: 89.99,
    stock: 25,
  },
  {
    sku: "MS-001",
    name: "Wireless Mouse",
    description: "Ergonomic, 2.4 GHz",
    category: "electronics",
    price: 24.5,
    stock: 60,
  },
  {
    sku: "CB-001",
    name: "USB-C Cable",
    description: "1 m, 60 W",
    category: "electronics",
    price: 9.5,
    stock: 200,
  },
  {
    sku: "MN-001",
    name: "27-inch Monitor",
    description: "1440p, 144 Hz",
    category: "electronics",
    price: 299,
    stock: 8,
  },
  {
    sku: "LM-001",
    name: "Desk Lamp",
    description: "LED, dimmable",
    category: "home",
    price: 39.9,
    stock: 0,
    status: "inactive",
  },
  {
    sku: "MG-001",
    name: "Coffee Mug",
    description: "350 ml, 100% ceramic",
    category: "home",
    price: 12,
    stock: 120,
  },
  {
    sku: "CH-001",
    name: "Office Chair",
    description: "Mesh back, adjustable",
    category: "furniture",
    price: 189,
    stock: 12,
  },
  {
    sku: "DK-001",
    name: "Standing Desk",
    description: "Electric, 140 x 70 cm",
    category: "furniture",
    price: 449,
    stock: 5,
  },
];

const config = loadConfig();
const db = openDatabase(config.DB_FILE);

try {
  runMigrations(db);

  // "OR IGNORE" skips products whose SKU already exists, so the seed can be run many times.
  const insertProduct = db.prepare(
    `INSERT OR IGNORE INTO products
       (sku, name, description, category, price_cents, stock, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let insertedCount = 0;

  transaction(db, () => {
    for (const sample of sampleProducts) {
      // Validate with the same rules as the API, which also fills in defaults (status, stock).
      const product = createProductSchema.parse(sample);
      const now = new Date().toISOString();
      const priceCents = Math.round(product.price * 100);

      const result = insertProduct.run(
        product.sku,
        product.name,
        product.description ?? null,
        product.category,
        priceCents,
        product.stock,
        product.status,
        now,
        now,
      );
      insertedCount += Number(result.changes);
    }
  });

  const skippedCount = sampleProducts.length - insertedCount;
  console.log(`[seed] inserted ${insertedCount} products (${skippedCount} already existed)`);
} finally {
  db.close();
}
