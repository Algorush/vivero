// Type suppression used previously for @neondatabase/serverless v1 / drizzle-orm mismatch.
// Runtime behavior is correct.
import { neon } from "@neondatabase/serverless";
import type { Plant } from "@/types/plant";
import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

function getSql() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Missing NEON_DATABASE_URL");
  return neon(url);
}

// In-memory cache for query embeddings (keyed by normalized query text)
const embeddingCache = new Map<string, number[]>();
let ensureLocalizedColumnsPromise: Promise<void> | null = null;

async function ensureLocalizedColumns() {
  if (!ensureLocalizedColumnsPromise) {
    const sql = getSql();
    ensureLocalizedColumnsPromise = (async () => {
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS flor_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS riego_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS suelo_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS florece_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS exposicion_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS fruta_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS tamano_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS utilizacion_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagacion_en TEXT NOT NULL DEFAULT ''`);
      await sql.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS medicinal_en TEXT NOT NULL DEFAULT ''`);
    })();
  }

  await ensureLocalizedColumnsPromise;
}

type SearchOptions = {
  query?: string;
  category?: string;
  nativo?: boolean;
  limit?: number;
  offset?: number;
  lang?: SiteLanguage;
};

type SearchResult = {
  plants: Plant[];
  total: number;
};

function rowToPlant(row: Record<string, unknown>, lang: SiteLanguage): Plant {
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  const suffix = lang === "en" ? "_en" : "";
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: (row[`name${suffix}`] ?? row.name) as string,
    description: (row[`description${suffix}`] ?? row.description) as string,
    flor: (row[`flor${suffix}`] ?? row.flor) as string,
    riego: (row[`riego${suffix}`] ?? row.riego) as string,
    suelo: (row[`suelo${suffix}`] ?? row.suelo) as string,
    florece: (row[`florece${suffix}`] ?? row.florece) as string,
    exposicion: (row[`exposicion${suffix}`] ?? row.exposicion) as string,
    fruta: (row[`fruta${suffix}`] ?? row.fruta) as string,
    tamano: (row[`tamano${suffix}`] ?? row.tamano) as string,
    utilizacion: (row[`utilizacion${suffix}`] ?? row.utilizacion) as string,
    propagacion: (row[`propagacion${suffix}`] ?? row.propagacion) as string,
    medicinal: (row[`medicinal${suffix}`] ?? row.medicinal) as string,
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
  await ensureLocalizedColumns();
  const lang = normalizeSiteLanguage(options.lang);
  const { query, category, nativo, limit = 12, offset = 0 } = options;
  const shouldLog = process.env.NODE_ENV !== "production";

  if (shouldLog) {
    console.log("[search] request", {
      pid: process.pid,
      query,
      category,
      nativo,
      limit,
      offset,
      hasHfKey: Boolean(process.env.HUGGINGFACE_API_KEY),
    });
  }

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
      plants: rows.map((row) => rowToPlant(row, lang)),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  // Semantic search with pgvector if HuggingFace API key is set, fallback to FTS on any error
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      const result = await semanticSearch(query, { category, nativo, limit, offset, lang });

      if (shouldLog) {
        console.log("[search] mode=semantic", {
          pid: process.pid,
          plants: result.plants.length,
          total: result.total,
        });
      }

      return result;
    } catch (err) {
      console.error("[search] semantic search failed, falling back to FTS:", err);
    }
  }

  const result = await fullTextSearch(query, { category, nativo, limit, offset, lang });

  if (shouldLog) {
    console.log("[search] mode=fts", {
      pid: process.pid,
      plants: result.plants.length,
      total: result.total,
    });
  }

  return result;
}

async function semanticSearch(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();
  const { category, nativo, limit, offset } = options;
  // Generate query embedding using local model, with in-memory cache
  const cacheKey = query.slice(0, 512).toLowerCase().trim();
  let embedding: number[] | null | undefined = embeddingCache.get(cacheKey);

  if (!embedding) {
    const { generateEmbedding } = await import("../embeddings");
    embedding = await generateEmbedding(cacheKey);

    if (!embedding) {
      console.error("[search] semantic embedding unavailable, falling back to FTS", {
        pid: process.pid,
        query,
        category,
        nativo,
      });

      return fullTextSearch(query, { category, nativo, limit, offset, lang: options.lang });
    }

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

  // The count query's WHERE clause never references $1 (the vector), only
  // $2/$3 for category/nativo when present. If no filters were added,
  // whereClause has zero placeholders, so we must send zero params -
  // otherwise Postgres errors with "bind message supplies N parameters,
  // but prepared statement requires 0".
  const countParams = paramIndex === 2 ? [] : params.slice(0, paramIndex - 1);
  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    countParams
  ) as Record<string, unknown>[];

  return {
    plants: rows.map((row) => rowToPlant(row, options.lang)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function fullTextSearch(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();
  const conditions: string[] = [
    "available = true",
    `to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(description,'') || ' ' || coalesce(description_en,'') || ' ' || coalesce(category,'') || ' ' || coalesce(flor,'') || ' ' || coalesce(flor_en,'') || ' ' || coalesce(riego,'') || ' ' || coalesce(riego_en,'') || ' ' || coalesce(suelo,'') || ' ' || coalesce(suelo_en,'') || ' ' || coalesce(florece,'') || ' ' || coalesce(florece_en,'') || ' ' || coalesce(exposicion,'') || ' ' || coalesce(exposicion_en,'') || ' ' || coalesce(fruta,'') || ' ' || coalesce(fruta_en,'') || ' ' || coalesce(tamano,'') || ' ' || coalesce(tamano_en,'') || ' ' || coalesce(utilizacion,'') || ' ' || coalesce(utilizacion_en,'') || ' ' || coalesce(propagacion,'') || ' ' || coalesce(propagacion_en,'') || ' ' || coalesce(medicinal,'') || ' ' || coalesce(medicinal_en,'')) @@ plainto_tsquery('simple', $1)`,
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
       to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(description,'') || ' ' || coalesce(description_en,'') || ' ' || coalesce(utilizacion,'') || ' ' || coalesce(utilizacion_en,'') || ' ' || coalesce(propagacion,'') || ' ' || coalesce(propagacion_en,'') || ' ' || coalesce(medicinal,'') || ' ' || coalesce(medicinal_en,'')),
       plainto_tsquery('simple', $1)
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
    plants: rows.map((row) => rowToPlant(row, options.lang)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function ilikeFallback(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();

  // Search each word independently across all text fields
  const words = query.trim().split(/\s+/).filter(Boolean);
  const allFields = `(name || ' ' || name_en || ' ' || description || ' ' || description_en || ' ' || category || ' ' || flor || ' ' || flor_en || ' ' || riego || ' ' || riego_en || ' ' || suelo || ' ' || suelo_en || ' ' || florece || ' ' || florece_en || ' ' || exposicion || ' ' || exposicion_en || ' ' || fruta || ' ' || fruta_en || ' ' || tamano || ' ' || tamano_en || ' ' || utilizacion || ' ' || utilizacion_en || ' ' || propagacion || ' ' || propagacion_en || ' ' || medicinal || ' ' || medicinal_en)`;
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
    plants: rows.map((row) => rowToPlant(row, options.lang)),
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
export async function getPlantBySlugFromDb(slug: string, lang: SiteLanguage = "es"): Promise<Plant | null> {
  const sql = getSql();
  await ensureLocalizedColumns();
  const rows = await sql`SELECT * FROM plants WHERE slug = ${slug} AND available = true LIMIT 1`;
  if (!rows[0]) return null;
  return rowToPlant(rows[0] as Record<string, unknown>, normalizeSiteLanguage(lang));
}

/**
 * Get all plants from DB (for MiniSearch fallback / full list).
 */
export async function getAllPlantsFromDb(lang: SiteLanguage = "es"): Promise<Plant[]> {
  const sql = getSql();
  await ensureLocalizedColumns();
  const rows = await sql`SELECT * FROM plants WHERE available = true ORDER BY name ASC`;
  const normalizedLang = normalizeSiteLanguage(lang);
  return rows.map((r) => rowToPlant(r as Record<string, unknown>, normalizedLang));
}


