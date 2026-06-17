// @ts-nocheck
/* eslint-disable */
// Type suppression needed due to @neondatabase/serverless v1 / drizzle-orm version mismatch.
// Runtime behavior is correct. Remove when packages are upgraded.
import { neon } from "@neondatabase/serverless";
import type { Plant } from "@/types/plant";

function getSql() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Missing NEON_DATABASE_URL");
  return neon(url);
}

// In-memory cache for query embeddings (keyed by normalized query text)
const embeddingCache = new Map<string, number[]>();

type SearchOptions = {
  query?: string;
  category?: string;
  nativo?: boolean;
  limit?: number;
  offset?: number;
};

type SearchResult = {
  plants: Plant[];
  total: number;
};

function rowToPlant(row: Record<string, unknown>): Plant {
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string,
    flor: row.flor as string,
    riego: row.riego as string,
    suelo: row.suelo as string,
    florece: row.florece as string,
    exposicion: row.exposicion as string,
    fruta: row.fruta as string,
    tamano: row.tamano as string,
    category: row.category as string,
    nativo: row.nativo as boolean,
    price: row.price as number,
    amount: row.amount as number,
    available: row.available as boolean,
    image: images[0] ?? "",
    images,
  };
}

/**
 * Full-text search using Postgres tsvector (Spanish dictionary).
 * Falls back to ILIKE if no results found.
 */
export async function searchPlants(options: SearchOptions = {}): Promise<SearchResult> {
  const sql = getSql();
  const { query, category, nativo, limit = 12, offset = 0 } = options;

  // Build WHERE conditions
  const conditions: string[] = ["available = true"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(category);
  }

  if (nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(nativo);
  }

  const whereClause = conditions.join(" AND ");

  if (!query?.trim()) {
    // No search query — return paginated list
    const rows = await sql.query(
      `SELECT * FROM plants WHERE ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ) as Record<string, unknown>[];
    const countRows = await sql.query(
      `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
      params
    ) as Record<string, unknown>[];
    return {
      plants: rows.map(rowToPlant),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  // Semantic search with pgvector if HF API key is set, fallback to FTS on any error
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      return await semanticSearch(query, { category, nativo, limit, offset });
    } catch (err) {
      console.warn("[search] semantic search failed, falling back to FTS:", (err as Error).message);
    }
  }

  return fullTextSearch(query, { category, nativo, limit, offset });
}

async function semanticSearch(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number }
): Promise<SearchResult> {
  const sql = getSql();
  // Generate query embedding using local model, with in-memory cache
  const cacheKey = query.slice(0, 512).toLowerCase().trim();
  let embedding = embeddingCache.get(cacheKey);

  if (!embedding) {
    const { generateEmbedding } = await import("../embeddings");
    embedding = await generateEmbedding(cacheKey);
    embeddingCache.set(cacheKey, embedding);
  }

  const vectorStr = `[${embedding.join(",")}]`;

  const conditions: string[] = ["available = true", "embedding IS NOT NULL"];
  const params: unknown[] = [vectorStr];
  let paramIndex = 2;

  if (options.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(options.category);
  }

  if (options.nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(options.nativo);
  }

  const whereClause = conditions.join(" AND ");

  const rows = await sql.query(
    `SELECT *, embedding <=> $1::vector AS distance
     FROM plants
     WHERE ${whereClause}
     ORDER BY embedding <=> $1::vector
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    params.slice(0, paramIndex - 1) // exclude limit/offset
  ) as Record<string, unknown>[];

  return {
    plants: rows.map(rowToPlant),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function fullTextSearch(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number }
): Promise<SearchResult> {
  const sql = getSql();
  const conditions: string[] = [
    "available = true",
    `to_tsvector('spanish', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'') || ' ' || coalesce(flor,'') || ' ' || coalesce(riego,'') || ' ' || coalesce(tamano,'')) @@ plainto_tsquery('spanish', $1)`,
  ];
  const params: unknown[] = [query];
  let paramIndex = 2;

  if (options.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(options.category);
  }

  if (options.nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(options.nativo);
  }

  const whereClause = conditions.join(" AND ");

  const rows = await sql.query(
    `SELECT *, ts_rank(
       to_tsvector('spanish', coalesce(name,'') || ' ' || coalesce(description,'')),
       plainto_tsquery('spanish', $1)
     ) AS rank
     FROM plants
     WHERE ${whereClause}
     ORDER BY rank DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  if (rows.length === 0) {
    // Fallback: ILIKE search
    return ilikeFallback(query, options);
  }

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    params.slice(0, paramIndex - 1)
  ) as Record<string, unknown>[];

  return {
    plants: rows.map(rowToPlant),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function ilikeFallback(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number }
): Promise<SearchResult> {
  const sql = getSql();

  // Search each word independently across all text fields
  const words = query.trim().split(/\s+/).filter(Boolean);
  const allFields = `(name || ' ' || description || ' ' || category || ' ' || flor || ' ' || riego || ' ' || suelo || ' ' || exposicion || ' ' || fruta || ' ' || tamano)`;
  const wordConditions = words.map((_, i) => `${allFields} ILIKE $${i + 1}`);
  const wordParams = words.map((w) => `%${w}%`);

  const conditions: string[] = [
    "available = true",
    `(${wordConditions.join(" AND ")})`,
  ];
  const params: unknown[] = [...wordParams];
  let paramIndex = words.length + 1;

  if (options.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(options.category);
  }

  if (options.nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(options.nativo);
  }

  const whereClause = conditions.join(" AND ");

  const rows = await sql.query(
    `SELECT * FROM plants WHERE ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    params.slice(0, paramIndex - 1)
  ) as Record<string, unknown>[];

  return {
    plants: rows.map(rowToPlant),
    total: Number(countRows[0]?.total ?? 0),
  };
}

/**
 * Get all available categories from DB.
 */
export async function getCategories(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT category FROM plants
    WHERE available = true AND category != ''
    ORDER BY category
  `;
  return rows.map((r) => r.category as string);
}

/**
 * Get a single plant by slug from DB.
 */
export async function getPlantBySlugFromDb(slug: string): Promise<Plant | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM plants WHERE slug = ${slug} AND available = true LIMIT 1`;
  if (!rows[0]) return null;
  return rowToPlant(rows[0] as Record<string, unknown>);
}

/**
 * Get all plants from DB (for MiniSearch fallback / full list).
 */
export async function getAllPlantsFromDb(): Promise<Plant[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM plants WHERE available = true ORDER BY name ASC`;
  return rows.map((r) => rowToPlant(r as Record<string, unknown>));
}


