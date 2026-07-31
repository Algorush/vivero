import { pgTable, text, boolean, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const plants = pgTable(
  "plants",
  {
    // Notion page ID as primary key
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull().default(""),
    nameEn: text("name_en").notNull().default(""),
    description: text("description").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    flor: text("flor").notNull().default(""),
    florEn: text("flor_en").notNull().default(""),
    riego: text("riego").notNull().default(""),
    riegoEn: text("riego_en").notNull().default(""),
    suelo: text("suelo").notNull().default(""),
    sueloEn: text("suelo_en").notNull().default(""),
    florece: text("florece").notNull().default(""),
    floreceEn: text("florece_en").notNull().default(""),
    exposicion: text("exposicion").notNull().default(""),
    exposicionEn: text("exposicion_en").notNull().default(""),
    fruta: text("fruta").notNull().default(""),
    frutaEn: text("fruta_en").notNull().default(""),
    tamano: text("tamano").notNull().default(""),
    tamanoEn: text("tamano_en").notNull().default(""),
    utilizacion: text("utilizacion").notNull().default(""),
    utilizacionEn: text("utilizacion_en").notNull().default(""),
    propagacion: text("propagacion").notNull().default(""),
    propagacionEn: text("propagacion_en").notNull().default(""),
    medicinal: text("medicinal").notNull().default(""),
    medicinalEn: text("medicinal_en").notNull().default(""),
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
    // pgvector embedding (HuggingFace all-MiniLM-L6-v2 = 384 dimensions)
    // Stored as text in Drizzle, handled as raw SQL for pgvector operations
    embeddingUpdatedAt: timestamp("embedding_updated_at", { withTimezone: true }),
  },
  (table) => [
    index("plants_category_idx").on(table.category),
    index("plants_nativo_idx").on(table.nativo),
    index("plants_available_idx").on(table.available),
    index("plants_slug_idx").on(table.slug),
    index("plants_name_en_idx").on(table.nameEn),
  ]
);

export type PlantRow = typeof plants.$inferSelect;
export type PlantInsert = typeof plants.$inferInsert;
