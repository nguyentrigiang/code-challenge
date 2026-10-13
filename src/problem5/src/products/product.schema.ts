import { z } from "zod";

export const PRODUCT_STATUSES = ["active", "inactive"] as const;
export const MAX_PRICE = 9_999_999_999.99; // stored as integer cents, far below 2^53

/** True for 10, 10.5 and 10.99; false for 10.999. */
function hasAtMostTwoDecimals(value: number): boolean {
  const cents = value * 100;
  // A tiny tolerance absorbs float noise such as 0.29 * 100 = 28.999999999999996.
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

const price = z
  .number()
  .nonnegative()
  .max(MAX_PRICE)
  .refine(hasAtMostTwoDecimals, { message: "Price must have at most 2 decimal places" });

const fields = {
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, digits, '-' and '_'"),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).nullable(),
  category: z.string().trim().min(1).max(100),
  price,
  stock: z.number().int().min(0).max(1_000_000_000),
  status: z.enum(PRODUCT_STATUSES),
};

// strictObject rejects unknown keys (e.g. a client trying to set `id` or `createdAt`).
export const createProductSchema = z.strictObject({
  ...fields,
  description: fields.description.optional(),
  stock: fields.stock.default(0),
  status: fields.status.default("active"),
});

export const updateProductSchema = z
  .strictObject(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Request body must contain at least one field to update",
  });

const SORT_FIELDS = ["name", "price", "stock", "createdAt", "updatedAt"] as const;
// Each field can be sorted ascending ("price") or descending ("-price").
export const SORT_VALUES = SORT_FIELDS.flatMap((field) => [field, `-${field}`] as const);

const optionalNumber = z.coerce.number().nonnegative().optional();

export const listProductsQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    sort: z.enum(SORT_VALUES as [string, ...string[]]).default("-createdAt"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (query) => {
      const bothGiven = query.minPrice !== undefined && query.maxPrice !== undefined;
      return !bothGiven || query.minPrice! <= query.maxPrice!;
    },
    {
        message: "minPrice must be less than or equal to maxPrice",
      path: ["minPrice"],
    },
  );

export const productIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stock: number;
  status: ProductStatus;
  /** Incremented on every update; exposed as the ETag for optimistic concurrency. */
  version: number;
  createdAt: string;
  updatedAt: string;
}
