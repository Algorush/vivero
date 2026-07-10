import { pgTable, text, boolean, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom vector type for pgvector
const vector = (name: string, dimensions: number) => ({
  name,
  dataType: "custom" as const,
  columnType: "PgCustomColumn" as const,
  config: { dimensions },
  getSQLType: () => `vector(${dimensions})`,
  mapFromDriverValue: (value: string) => {
    if (!value) return null;
    return JSON.parse(value.replace(/^\[/, "[").replace(/\]$/, "]")) as number[];
  },
  mapToDriverValue: (value: number[] | null) => {
    if (!value) return null;
    return `[${value.join(",")}]`;
  },
});

export const plants = pgTable(
  "plants",
  {
    // Notion page ID as primary key
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull().default(""),
    description: text("description").notNull().default(""),
    flor: text("flor").notNull().default(""),
    riego: text("riego").notNull().default(""),
    suelo: text("suelo").notNull().default(""),
    florece: text("florece").notNull().default(""),
    exposicion: text("exposicion").notNull().default(""),
    fruta: text("fruta").notNull().default(""),
    tamano: text("tamano").notNull().default(""),
    utilizacion: text("utilizacion").notNull().default(""),
    propagacion: text("propagacion").notNull().default(""),
    medicinal: text("medicinal").notNull().default(""),
    category: text("category").notNull().default(""),
    nativo: boolean("nativo").notNull().default(false),
    price: integer("price").notNull().default(0),
    amount: integer("amount").notNull().default(0),
    available: boolean("available").notNull().default(false),
    // CDN image URLs stored as JSON array
    images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Timestamps
    notionUpdatedAt: timestamp("notion_updated_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    // pgvector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
    // Stored as text in Drizzle, handled as raw SQL for pgvector operations
    embeddingUpdatedAt: timestamp("embedding_updated_at", { withTimezone: true }),
  },
  (table) => [
    index("plants_category_idx").on(table.category),
    index("plants_nativo_idx").on(table.nativo),
    index("plants_available_idx").on(table.available),
    index("plants_slug_idx").on(table.slug),
  ]
);

export type PlantRow = typeof plants.$inferSelect;
export type PlantInsert = typeof plants.$inferInsert;
