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
  const localizedText = (key: string): string => {
    const localized = String(row[`${key}${suffix}`] ?? "").trim();
    if (localized) {
      return localized;
    }

    return String(row[key] ?? "").trim();
  };

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: localizedText("name"),
    description: localizedText("description"),
    flor: localizedText("flor"),
    riego: localizedText("riego"),
    suelo: localizedText("suelo"),
    florece: localizedText("florece"),
    exposicion: localizedText("exposicion"),
    fruta: localizedText("fruta"),
    tamano: localizedText("tamano"),
    utilizacion: localizedText("utilizacion"),
    propagacion: localizedText("propagacion"),
    medicinal: localizedText("medicinal"),
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
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
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

  const normalizedQuery = query.trim();
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  if (queryWords.length === 1) {
    const textMatch = await sql.query(
      `SELECT 1
       FROM plants
       WHERE available = true
         AND (
           name ILIKE $1 OR
           name_en ILIKE $1 OR
           description ILIKE $1 OR
           description_en ILIKE $1
         )
         ${category ? `AND category = $2` : ""}
         ${nativo !== undefined ? `AND nativo = $${category ? 3 : 2}` : ""}
       LIMIT 1`,
      [
        `%${normalizedQuery}%`,
        ...(category ? [category] : []),
        ...(nativo !== undefined ? [nativo] : []),
      ]
    ) as Record<string, unknown>[];

    if (textMatch.length === 0) {
      if (shouldLog) {
        console.log("[search] single-word query had no literal match; returning empty", {
          pid: process.pid,
          query: normalizedQuery,
          category,
          nativo,
        });
      }

      return { plants: [], total: 0 };
    }
  }

  // Semantic search with pgvector if the Gemini API key is set, fallback to FTS on any error
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await semanticSearch(normalizedQuery, { category, nativo, limit, offset, lang });

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

  const result = await fullTextSearch(normalizedQuery, { category, nativo, limit, offset, lang });

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

  const countConditions: string[] = ["available = true"];
  const countParams: unknown[] = [];
  let countParamIndex = 1;

  if (options.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(options.category);

    countConditions.push(`category = $${countParamIndex++}`);
    countParams.push(options.category);
  }

  if (options.nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(options.nativo);

    countConditions.push(`nativo = $${countParamIndex++}`);
    countParams.push(options.nativo);
  }

  const whereClause = conditions.join(" AND ");
  const countWhereClause = countConditions.join(" AND ");

  const rows = await sql.query(
    `SELECT *, embedding <=> $1::vector AS distance
     FROM plants
     WHERE ${whereClause}
     ORDER BY embedding <=> $1::vector
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${countWhereClause}`,
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


