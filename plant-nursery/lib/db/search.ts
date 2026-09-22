// Type suppression used previously for @neondatabase/serverless v1 / drizzle-orm mismatch.
// Runtime behavior is correct.
import { neon } from "@neondatabase/serverless";
import type { Plant } from "@/types/plant";
import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";
import { parseSearchIntent, type SearchField, type SearchIntent } from "@/lib/search-intent";

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

type SearchRankingContext = {
  searchIntent: SearchIntent | null;
  queryWords: string[];
  effectiveCategory: string;
  effectiveNativo?: boolean;
};

type ExactSearchField = Exclude<SearchField, "name" | "category" | "description">;

const QUERY_STOPWORDS = new Set(["y", "e", "o", "u", "and", "or", "de", "del", "la", "el", "los", "las", "con", "the", "a"]);
const NATIVE_HINT_WORDS = new Set(["nativo", "nativa", "nativas", "native"]);
const EXOTIC_HINT_WORDS = new Set(["exotico", "exotica", "exoticos", "exoticas", "exotic"]);
const RIEGO_LOW_HINT_WORDS = new Set(["bajo", "baja", "bajos", "bajas", "escaso", "escasa", "escasos", "escasas", "minimo", "minima", "minimos", "minimas", "poco"]);
const RIEGO_HIGH_HINT_WORDS = new Set(["alto", "alta", "altos", "altas", "abundante", "abundantes", "frecuente", "frecuentes", "constante"]);
const RIEGO_MODERATE_HINT_WORDS = new Set(["moderado", "moderada", "moderados", "moderadas", "medio", "media", "medios", "medias"]);
const DEFAULT_PRIORITY_EXACT_FIELDS: ExactSearchField[] = [
  "exposicion",
  "riego",
  "suelo",
  "flor",
  "florece",
  "fruta",
  "tamano",
  "utilizacion",
  "propagacion",
  "medicinal",
];

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getPriorityExactFields(intent: SearchIntent | null): ExactSearchField[] {
  if (!intent) {
    return DEFAULT_PRIORITY_EXACT_FIELDS.slice(0, 2);
  }

  const weightedFields = DEFAULT_PRIORITY_EXACT_FIELDS
    .map((field) => ({ field, weight: intent.fieldWeights[field] ?? 0 }))
    .filter((entry) => entry.weight >= 2)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.field);

  return weightedFields.length > 0 ? weightedFields : DEFAULT_PRIORITY_EXACT_FIELDS.slice(0, 2);
}

function isNativeHintWord(word: string): boolean {
  return NATIVE_HINT_WORDS.has(normalizeForMatch(word));
}

function isExoticHintWord(word: string): boolean {
  return EXOTIC_HINT_WORDS.has(normalizeForMatch(word));
}

function isRiegoQuery(intent: SearchIntent | null, queryWords: string[]): boolean {
  if (intent?.fieldWeights.riego && intent.fieldWeights.riego >= 2) {
    return true;
  }

  return queryWords.some((word) => normalizeForMatch(word) === "riego");
}

function getRiegoTargetHints(queryWords: string[]): { low: boolean; high: boolean; moderate: boolean } {
  const normalizedWords = queryWords.map((word) => normalizeForMatch(word));
  return {
    low: normalizedWords.some((word) => RIEGO_LOW_HINT_WORDS.has(word)),
    high: normalizedWords.some((word) => RIEGO_HIGH_HINT_WORDS.has(word)),
    moderate: normalizedWords.some((word) => RIEGO_MODERATE_HINT_WORDS.has(word)),
  };
}

function reciprocalRankFuse(rankedLists: Plant[][]): Plant[] {
  const scoreById = new Map<string, number>();
  const plantById = new Map<string, Plant>();
  const rankConstant = 60;

  for (const list of rankedLists) {
    list.forEach((plant, index) => {
      const score = 1 / (rankConstant + index + 1);
      scoreById.set(plant.id, (scoreById.get(plant.id) ?? 0) + score);

      if (!plantById.has(plant.id)) {
        plantById.set(plant.id, plant);
      }
    });
  }

  return Array.from(scoreById.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => plantById.get(id)!)
    .filter(Boolean);
}

const SHade_HINT_WORDS = new Set(["sombra", "semisombra"]);
const LOW_WATER_HINT_WORDS = new Set(["bajo", "baja", "bajos", "bajas", "escaso", "escasa", "escasos", "escasas", "poco", "sequia", "sequia"]);
const SIZE_HINT_WORDS = new Set(["pequeno", "pequena", "pequenos", "pequenas", "chico", "chica", "compacto", "compacta", "jardin", "patio", "maceta", "mini"]);

function scoreNeedleMatches(text: string, needles: string[]): number {
  const normalizedText = normalizeForMatch(text);
  return needles.reduce((score, needle) => (normalizedText.includes(normalizeForMatch(needle)) ? score + 1 : score), 0);
}

function extractMaxHeight(value: string): number | null {
  const normalized = normalizeForMatch(value);
  const heightMatch = normalized.match(/altura[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(?:[–-]\s*([0-9]+(?:\.[0-9]+)?))?\s*m/);

  if (heightMatch) {
    const parsed = Number(heightMatch[2] ?? heightMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const genericMatches = Array.from(normalized.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*m/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (genericMatches.length === 0) {
    return null;
  }

  return Math.max(...genericMatches);
}

function hasAnyWord(queryWords: string[], candidates: Set<string>): boolean {
  return queryWords.some((word) => candidates.has(normalizeForMatch(word)));
}

function getPlantRankScore(plant: Plant, context: SearchRankingContext): number {
  const { searchIntent, queryWords, effectiveCategory, effectiveNativo } = context;
  const normalizedCategory = normalizeForMatch(plant.category);
  const normalizedName = normalizeForMatch(plant.name);
  const normalizedDescription = normalizeForMatch(plant.description);
  const normalizedRiego = normalizeForMatch(plant.riego);
  const normalizedExposure = normalizeForMatch(plant.exposicion);
  const normalizedSize = normalizeForMatch(plant.tamano);
  const normalizedUse = normalizeForMatch(plant.utilizacion);

  let score = 0;

  if (effectiveCategory) {
    score += normalizedCategory === normalizeForMatch(effectiveCategory) ? 8 : -4;
  }

  if (effectiveNativo !== undefined) {
    score += plant.nativo === effectiveNativo ? 3 : -1;
  }

  score += scoreNeedleMatches(normalizedName, queryWords) * 2;
  score += scoreNeedleMatches(normalizedDescription, queryWords);
  score += scoreNeedleMatches(normalizedUse, queryWords) * 0.5;

  const hasShadeSignal = hasAnyWord(queryWords, SHade_HINT_WORDS) || (searchIntent?.fieldWeights.exposicion ?? 0) >= 2;
  const hasLowWaterSignal = hasAnyWord(queryWords, LOW_WATER_HINT_WORDS) || (searchIntent?.fieldWeights.riego ?? 0) >= 2;
  const hasSizeSignal = hasAnyWord(queryWords, SIZE_HINT_WORDS) || (searchIntent?.fieldWeights.tamano ?? 0) >= 2;

  if (hasShadeSignal) {
    if (normalizedExposure.includes("sombra") || normalizedExposure.includes("semisombra")) {
      score += 8;
    } else if (normalizedExposure.includes("sol pleno") || normalizedExposure.includes("sol directo")) {
      score -= 6;
    }
  }

  if (hasLowWaterSignal) {
    if (normalizedRiego.includes("bajo") || normalizedRiego.includes("escas") || normalizedRiego.includes("poco")) {
      score += 8;
    } else if (normalizedRiego.includes("moderad")) {
      score += 2;
    } else if (normalizedRiego.includes("alto") || normalizedRiego.includes("humedad constante")) {
      score -= 5;
    }
  }

  if (hasSizeSignal) {
    const maxHeight = extractMaxHeight(plant.tamano);
    if (maxHeight !== null) {
      if (maxHeight <= 2.5) {
        score += 8;
      } else if (maxHeight <= 5) {
        score += 5;
      } else if (maxHeight <= 8) {
        score += 2;
      } else if (maxHeight <= 12) {
        score -= 1;
      } else {
        score -= 5;
      }
    }

    if (normalizedSize.includes("compact") || normalizedSize.includes("pequen") || normalizedCategory === "arbusto" || normalizedCategory === "cubresuelo") {
      score += 3;
    }
  }

  if (searchIntent?.intent === "care" || searchIntent?.intent === "mixed") {
    if (searchIntent.fieldWeights.exposicion) {
      score += normalizedExposure.includes("sombra") || normalizedExposure.includes("semisombra") ? 2 : 0;
    }

    if (searchIntent.fieldWeights.riego) {
      score += normalizedRiego.includes("bajo") ? 2 : 0;
    }
  }

  return score;
}

function rerankPlants(plants: Plant[], context: SearchRankingContext): Plant[] {
  return plants
    .map((plant, index) => ({
      plant,
      index,
      score: getPlantRankScore(plant, context),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.plant);
}

function buildSearchRankingContext(
  searchIntent: SearchIntent | null,
  query: string,
  effectiveCategory: string,
  effectiveNativo?: boolean
): SearchRankingContext {
  return {
    searchIntent,
    queryWords: query.split(/\s+/).map((word) => normalizeForMatch(word)).filter(Boolean),
    effectiveCategory,
    effectiveNativo,
  };
}

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
  const categories = await getCategories();
  const searchIntent = process.env.GEMINI_API_KEY
    ? await parseSearchIntent({ query: normalizedQuery, lang, categories })
    : null;
  const effectiveCategory = category || searchIntent?.filters.category || "";
  const effectiveNativo = nativo !== undefined ? nativo : searchIntent?.filters.nativo;
  const searchExpansions =
    searchIntent && searchIntent.intent !== "name" && searchIntent.intent !== "category"
      ? searchIntent.expansions
      : [];
  const searchQuery = [searchIntent?.rewrittenQuery?.trim() || normalizedQuery, ...searchExpansions]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  const queryWords = searchQuery.split(/\s+/).filter(Boolean);
  const exactFields = getPriorityExactFields(searchIntent);
  const rankingContext = buildSearchRankingContext(searchIntent, searchQuery, effectiveCategory, effectiveNativo);

  if (isRiegoQuery(searchIntent, queryWords)) {
    const riegoHints = getRiegoTargetHints(queryWords);
    const result = await searchByRiegoHints(riegoHints, {
      category: effectiveCategory,
      nativo: effectiveNativo,
      limit,
      offset,
      lang,
    });

    if (result.total > 0) {
      return {
        ...result,
        plants: rerankPlants(result.plants, rankingContext),
      };
    }
  }

  {
    const meaningfulWords = queryWords.filter((word) => !QUERY_STOPWORDS.has(normalizeForMatch(word)));
    const categoryCandidateWords = meaningfulWords.filter((word) => !isNativeHintWord(word) && !isExoticHintWord(word));
    const hasNativeHint = meaningfulWords.some((word) => isNativeHintWord(word));
    const hasExoticHint = meaningfulWords.some((word) => isExoticHintWord(word));

    if ((hasNativeHint || hasExoticHint) && categoryCandidateWords.length > 0) {
      const normalizedCategories = categories.map((value) => ({ original: value, normalized: normalizeForMatch(value) }));
      const matchedCategories = new Set<string>();
      let allWordsMatchCategories = true;

      for (const word of categoryCandidateWords) {
        const wordNormalized = normalizeForMatch(word);
        const match = normalizedCategories.find((item) => item.normalized === wordNormalized);

        if (match) {
          matchedCategories.add(match.original);
        } else {
          allWordsMatchCategories = false;
          break;
        }
      }

      if (allWordsMatchCategories && matchedCategories.size > 0) {
        const result = await categorySearch(Array.from(matchedCategories), {
          category: effectiveCategory,
          nativo: hasNativeHint ? true : hasExoticHint ? false : effectiveNativo,
          limit,
          offset,
          lang,
        });

        return {
          ...result,
          plants: rerankPlants(result.plants, rankingContext),
        };
      }
    }

    if (meaningfulWords.length > 0) {
      const normalizedCategories = categories.map((value) => ({ original: value, normalized: normalizeForMatch(value) }));
      const matchedCategories = new Set<string>();
      let allWordsMatchCategories = true;

      for (const word of meaningfulWords) {
        const wordNormalized = normalizeForMatch(word);
        const match = normalizedCategories.find((item) => item.normalized === wordNormalized);

        if (match) {
          matchedCategories.add(match.original);
        } else {
          allWordsMatchCategories = false;
          break;
        }
      }

      if (allWordsMatchCategories && matchedCategories.size > 0) {
        const result = await categorySearch(Array.from(matchedCategories), { category: effectiveCategory, nativo: effectiveNativo, limit, offset, lang });

        return {
          ...result,
          plants: rerankPlants(result.plants, rankingContext),
        };
      }
    }
  }

  if (queryWords.length <= 3) {
    const normalizedFullQuery = normalizeForMatch(normalizedQuery);
    const escapedQuery = normalizedFullQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordBoundaryRegex = new RegExp(`\\b${escapedQuery}\\b`);

    for (const column of exactFields) {
      const values = await getDistinctFieldValues(column);
      const matchedValues = values.filter((value) => wordBoundaryRegex.test(normalizeForMatch(value)));

      if (matchedValues.length === 0) {
        continue;
      }

      const result = await attributeSearch(column, matchedValues, { category: effectiveCategory, nativo: effectiveNativo, limit, offset, lang });

      if (result.total > 0) {
        return {
          ...result,
          plants: rerankPlants(result.plants, rankingContext),
        };
      }
    }
  }

  let hasLiteralMatch = false;

  if (queryWords.length === 1) {
    const nameMatch = await sql.query(
      `SELECT 1
       FROM plants
       WHERE available = true
         AND (name ILIKE $1 OR name_en ILIKE $1)
         ${effectiveCategory ? `AND category = $2` : ""}
         ${effectiveNativo !== undefined ? `AND nativo = $${effectiveCategory ? 3 : 2}` : ""}
       LIMIT 1`,
      [
        `%${searchQuery}%`,
        ...(effectiveCategory ? [effectiveCategory] : []),
        ...(effectiveNativo !== undefined ? [effectiveNativo] : []),
      ]
    ) as Record<string, unknown>[];

    hasLiteralMatch = nameMatch.length > 0;
  }

  if (hasLiteralMatch) {
    const result = await fullTextSearch(searchQuery, { category: effectiveCategory, nativo: effectiveNativo, limit, offset, lang });

    return {
      ...result,
      plants: rerankPlants(result.plants, rankingContext),
    };
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await hybridSearch(searchQuery, { category: effectiveCategory, nativo: effectiveNativo, limit, offset, lang });

      if (result.plants.length > 0) {
        return {
          ...result,
          plants: rerankPlants(result.plants, rankingContext),
        };
      }
    } catch {
    }
  }

  const result = await fullTextSearch(searchQuery, { category: effectiveCategory, nativo: effectiveNativo, limit, offset, lang });

  return {
    ...result,
    plants: rerankPlants(result.plants, rankingContext),
  };
}

/**
 * Combines semantic (embedding) and full-text search rankings via reciprocal rank fusion.
 */
async function hybridSearch(
  query: string,
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const poolOptions = { ...options, limit: 200, offset: 0 };

  const [semanticResult, ftsResult] = await Promise.allSettled([
    semanticSearch(query, poolOptions),
    fullTextSearch(query, poolOptions),
  ]);

  const rankedLists: Plant[][] = [];

  if (semanticResult.status === "fulfilled") {
    rankedLists.push(semanticResult.value.plants);
  }

  if (ftsResult.status === "fulfilled") {
    rankedLists.push(ftsResult.value.plants);
  }

  if (rankedLists.length === 0) {
    throw semanticResult.status === "rejected"
      ? semanticResult.reason
      : ftsResult.status === "rejected"
        ? ftsResult.reason
        : new Error("Hybrid search failed");
  }

  const fused = reciprocalRankFuse(rankedLists);

  return {
    plants: fused.slice(options.offset, options.offset + options.limit),
    total: fused.length,
  };
}

async function categorySearch(
  categories: string[],
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();

  const conditions: string[] = ["available = true", "category = ANY($1)"];
  const params: unknown[] = [categories];
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
    `SELECT * FROM plants WHERE ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    params
  ) as Record<string, unknown>[];

  return {
    plants: rows.map((row) => rowToPlant(row, options.lang)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function attributeSearch(
  column: ExactSearchField,
  values: string[],
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();

  const conditions: string[] = ["available = true", `${column} = ANY($1)`];
  const params: unknown[] = [values];
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
    `SELECT * FROM plants WHERE ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${whereClause}`,
    params
  ) as Record<string, unknown>[];

  return {
    plants: rows.map((row) => rowToPlant(row, options.lang)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

async function getDistinctFieldValues(column: ExactSearchField): Promise<string[]> {
  const sql = getSql();
  const rows = await sql.query(
    `SELECT DISTINCT ${column} AS value
     FROM plants
     WHERE available = true AND ${column} != ''
     ORDER BY ${column}`
  ) as Record<string, unknown>[];
  return rows.map((row) => String(row.value ?? "").trim()).filter(Boolean);
}

async function searchByRiegoHints(
  hints: { low: boolean; high: boolean; moderate: boolean },
  options: { category?: string; nativo?: boolean; limit: number; offset: number; lang: SiteLanguage }
): Promise<SearchResult> {
  const sql = getSql();
  await ensureLocalizedColumns();

  const conditions: string[] = ["available = true"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(options.category);
  }

  if (options.nativo !== undefined) {
    conditions.push(`nativo = $${paramIndex++}`);
    params.push(options.nativo);
  }

  const rows = await sql.query(
    `SELECT *
     FROM plants
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE WHEN ${hints.low ? "TRUE" : "FALSE"} THEN GREATEST(
         ${scoreRiegoExpression("riego", "low")},
         ${scoreRiegoExpression("riego_en", "low")}
       )
       WHEN ${hints.high ? "TRUE" : "FALSE"} THEN GREATEST(
         ${scoreRiegoExpression("riego", "high")},
         ${scoreRiegoExpression("riego_en", "high")}
       )
       WHEN ${hints.moderate ? "TRUE" : "FALSE"} THEN GREATEST(
         ${scoreRiegoExpression("riego", "moderate")},
         ${scoreRiegoExpression("riego_en", "moderate")}
       )
       ELSE 0 END DESC,
       name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, options.limit, options.offset]
  ) as Record<string, unknown>[];

  const countRows = await sql.query(
    `SELECT COUNT(*) as total FROM plants WHERE ${conditions.join(" AND ")}`,
    params
  ) as Record<string, unknown>[];

  return {
    plants: rows.map((row) => rowToPlant(row, options.lang)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

function scoreRiegoExpression(column: string, target: "low" | "high" | "moderate"): string {
  const normalizedColumn = `lower(coalesce(${column}, ''))`;

  if (target === "low") {
    return `(
      CASE
        WHEN ${normalizedColumn} LIKE '%bajo%' THEN 4
        WHEN ${normalizedColumn} LIKE '%escas%' THEN 3
        WHEN ${normalizedColumn} LIKE '%poco%' THEN 2
        WHEN ${normalizedColumn} LIKE '%moderad%' THEN -2
        WHEN ${normalizedColumn} LIKE '%alto%' THEN -3
        ELSE 0
      END
    )`;
  }

  if (target === "high") {
    return `(
      CASE
        WHEN ${normalizedColumn} LIKE '%alto%' THEN 4
        WHEN ${normalizedColumn} LIKE '%frecuent%' THEN 2
        WHEN ${normalizedColumn} LIKE '%constant%' THEN 2
        WHEN ${normalizedColumn} LIKE '%bajo%' THEN -3
        ELSE 0
      END
    )`;
  }

  return `(
    CASE
      WHEN ${normalizedColumn} LIKE '%moderad%' THEN 4
      WHEN ${normalizedColumn} LIKE '%medio%' THEN 2
      WHEN ${normalizedColumn} LIKE '%bajo%' THEN -1
      WHEN ${normalizedColumn} LIKE '%alto%' THEN -1
      ELSE 0
    END
  )`;
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


