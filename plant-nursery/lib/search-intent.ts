import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

export type SearchField =
  | "name"
  | "category"
  | "description"
  | "exposicion"
  | "riego"
  | "suelo"
  | "flor"
  | "florece"
  | "fruta"
  | "tamano"
  | "utilizacion"
  | "propagacion"
  | "medicinal";

export type SearchIntent = {
  intent: "name" | "category" | "care" | "appearance" | "mixed" | "unclear";
  rewrittenQuery: string;
  filters: {
    category?: string;
    nativo?: boolean;
    interior?: boolean;
    exterior?: boolean;
    available?: boolean;
  };
  fieldWeights: Partial<Record<SearchField, number>>;
  expansions: string[];
  sort: "relevance" | "alpha";
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
};

export type SearchIntentInput = {
  query: string;
  lang?: SiteLanguage;
  categories?: string[];
};

type GeminiCandidate = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

const GEMINI_MODEL = process.env.GEMINI_SEARCH_MODEL || "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type SearchIntentGlobals = typeof globalThis & {
  __plantNurserySearchIntentCache?: Map<string, SearchIntent | null>;
  __plantNurserySearchIntentRequests?: Map<string, Promise<SearchIntent | null>>;
};

const globalForSearchIntent = globalThis as SearchIntentGlobals;

const intentCache =
  globalForSearchIntent.__plantNurserySearchIntentCache ?? new Map<string, SearchIntent | null>();
globalForSearchIntent.__plantNurserySearchIntentCache = intentCache;

const inFlightRequests =
  globalForSearchIntent.__plantNurserySearchIntentRequests ?? new Map<string, Promise<SearchIntent | null>>();
globalForSearchIntent.__plantNurserySearchIntentRequests = inFlightRequests;

const SEARCH_FIELDS: SearchField[] = [
  "name",
  "category",
  "description",
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

const CARE_HINT_WORDS = new Set([
  "riego",
  "agua",
  "sequia",
  "sequia",
  "humedad",
  "sombra",
  "sol",
  "semisombra",
]);

const SIZE_HINT_WORDS = new Set([
  "pequeno",
  "pequena",
  "pequenos",
  "pequenas",
  "chico",
  "chica",
  "compacto",
  "compacta",
  "jardin",
  "patio",
  "maceta",
  "mini",
]);

const APPEARANCE_HINT_WORDS = new Set([
  "sombra",
  "flor",
  "flores",
  "hoja",
  "hojas",
  "copa",
  "altura",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenizeQuery(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

function buildFallbackSearchIntent(input: SearchIntentInput): SearchIntent | null {
  const query = input.query.trim();
  if (!query) {
    return null;
  }

  const normalizedWords = tokenizeQuery(query);
  const categoryCandidates = (input.categories ?? [])
    .map((category) => category.trim())
    .filter(Boolean);
  const normalizedCategories = new Map(categoryCandidates.map((category) => [normalizeText(category), category] as const));
  const matchedCategory = normalizedWords
    .map((word) => normalizedCategories.get(word))
    .find((value): value is string => Boolean(value));

  const hasCareSignals = normalizedWords.some((word) => CARE_HINT_WORDS.has(word));
  const hasSizeSignals = normalizedWords.some((word) => SIZE_HINT_WORDS.has(word));
  const hasAppearanceSignals = normalizedWords.some((word) => APPEARANCE_HINT_WORDS.has(word));
  const hasCategorySignal = Boolean(matchedCategory);

  if (!hasCategorySignal && !hasCareSignals && !hasSizeSignals && !hasAppearanceSignals) {
    return null;
  }

  const intent: SearchIntent["intent"] =
    hasCategorySignal && (hasCareSignals || hasSizeSignals || hasAppearanceSignals)
      ? "mixed"
      : hasCareSignals && (hasSizeSignals || hasAppearanceSignals)
        ? "mixed"
        : hasCategorySignal
          ? "category"
          : hasCareSignals
            ? "care"
            : hasAppearanceSignals
              ? "appearance"
              : "mixed";

  const fieldWeights: Partial<Record<SearchField, number>> = {};
  if (hasCategorySignal) {
    fieldWeights.category = 3;
    fieldWeights.name = 2;
  }
  if (hasCareSignals) {
    fieldWeights.riego = 3;
    fieldWeights.exposicion = 2;
  }
  if (hasAppearanceSignals) {
    fieldWeights.exposicion = Math.max(fieldWeights.exposicion ?? 0, 2);
    fieldWeights.description = Math.max(fieldWeights.description ?? 0, 1);
  }
  if (hasSizeSignals) {
    fieldWeights.tamano = 2;
    fieldWeights.description = Math.max(fieldWeights.description ?? 0, 1);
  }

  const expansions = new Set<string>();
  if (hasCareSignals) {
    expansions.add("poco riego");
    expansions.add("resistente a la sequia");
  }
  if (hasAppearanceSignals) {
    expansions.add("sombra parcial");
    expansions.add("sol parcial");
  }
  if (hasSizeSignals) {
    expansions.add("jardin pequeno");
    expansions.add("crecimiento compacto");
  }

  return {
    intent,
    rewrittenQuery: query,
    filters: {
      category: matchedCategory,
      available: true,
    },
    fieldWeights,
    expansions: Array.from(expansions),
    sort: "relevance",
    confidence: 0.35,
    needsClarification: false,
    clarificationQuestion: undefined,
  };
}

function buildPrompt(input: SearchIntentInput): string {
  const lang = normalizeSiteLanguage(input.lang);
  const categories = (input.categories ?? []).map((category) => category.trim()).filter(Boolean);

  return [
    `You are a parser for a plant catalog search box.`,
    `Return ONLY valid JSON, no markdown, no commentary.`,
    `Language of the user's query: ${lang}.`,
    `Goal: infer the user's intent and how the backend should search.`,
    `Allowed intents: name, category, care, appearance, mixed, unclear.`,
    `Allowed fields: ${SEARCH_FIELDS.join(", ")}.`,
    `Allowed sort values: relevance, alpha.`,
    `Only choose a category from the provided category list. If nothing matches, omit category.`,
    `If the query is ambiguous and needs a follow-up, set needsClarification=true and provide clarificationQuestion.`,
    `If confidence is low, keep the rewrite conservative.`,
    `Return this JSON shape: {"intent":"...","rewrittenQuery":"...","filters":{"category":"...","nativo":true,"interior":false,"exterior":false,"available":true},"fieldWeights":{"name":3,"category":2,"description":1},"expansions":["..."],"sort":"relevance","confidence":0.0,"needsClarification":false,"clarificationQuestion":"..."}`,
    categories.length > 0 ? `Known categories: ${JSON.stringify(categories)}` : `Known categories: []`,
    `User query: ${JSON.stringify(input.query.trim())}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeSearchIntent(raw: unknown, input: SearchIntentInput): SearchIntent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const filtersCandidate = candidate.filters as Record<string, unknown> | undefined;
  const weightsCandidate = candidate.fieldWeights as Record<string, unknown> | undefined;
  const categories = new Set((input.categories ?? []).map((category) => normalizeText(category)));

  const rewrittenQuery = typeof candidate.rewrittenQuery === "string" ? candidate.rewrittenQuery.trim() : input.query.trim();
  const intent = candidate.intent;
  const sort = candidate.sort === "alpha" ? "alpha" : "relevance";
  const confidenceValue = Number(candidate.confidence);
  const confidence = Number.isFinite(confidenceValue) ? Math.min(Math.max(confidenceValue, 0), 1) : 0;
  const fieldWeights: Partial<Record<SearchField, number>> = {};

  if (weightsCandidate) {
    for (const field of SEARCH_FIELDS) {
      const rawWeight = weightsCandidate[field];
      const numericWeight = Number(rawWeight);
      if (Number.isFinite(numericWeight) && numericWeight > 0) {
        fieldWeights[field] = Math.min(Math.max(Math.round(numericWeight), 1), 3);
      }
    }
  }

  const expansions = Array.isArray(candidate.expansions)
    ? candidate.expansions.map((value) => String(value).trim()).filter(Boolean).slice(0, 10)
    : [];

  let category: string | undefined;
  if (filtersCandidate && typeof filtersCandidate.category === "string") {
    const normalizedCategory = normalizeText(filtersCandidate.category);
    const matchingCategory = (input.categories ?? []).find((value) => normalizeText(value) === normalizedCategory);
    if (matchingCategory || categories.has(normalizedCategory)) {
      category = matchingCategory ?? filtersCandidate.category.trim();
    }
  }

  const filters = {
    category,
    nativo: typeof filtersCandidate?.nativo === "boolean" ? filtersCandidate.nativo : undefined,
    interior: typeof filtersCandidate?.interior === "boolean" ? filtersCandidate.interior : undefined,
    exterior: typeof filtersCandidate?.exterior === "boolean" ? filtersCandidate.exterior : undefined,
    available: typeof filtersCandidate?.available === "boolean" ? filtersCandidate.available : undefined,
  };

  const needsClarification = Boolean(candidate.needsClarification);
  const clarificationQuestion = typeof candidate.clarificationQuestion === "string"
    ? candidate.clarificationQuestion.trim()
    : undefined;

  if (
    intent !== "name" &&
    intent !== "category" &&
    intent !== "care" &&
    intent !== "appearance" &&
    intent !== "mixed" &&
    intent !== "unclear"
  ) {
    return buildFallbackSearchIntent(input);
  }

  return {
    intent,
    rewrittenQuery,
    filters,
    fieldWeights,
    expansions,
    sort,
    confidence,
    needsClarification,
    clarificationQuestion,
  };
}

async function callGeminiSearchIntent(input: SearchIntentInput): Promise<SearchIntent | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(input) }],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      topK: 20,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini search intent request failed (${response.status}): ${errorBody}`);
  }

  const body = (await response.json()) as GeminiResponse;
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";

  if (!text) {
    return buildFallbackSearchIntent(input);
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return sanitizeSearchIntent(parsed, input) ?? buildFallbackSearchIntent(input);
  } catch {
    return buildFallbackSearchIntent(input);
  }
}

export async function parseSearchIntent(input: SearchIntentInput): Promise<SearchIntent | null> {
  const query = input.query.trim();
  if (!query) {
    return null;
  }

  const categoriesFingerprint = (input.categories ?? []).map((category) => category.trim()).filter(Boolean).join("|");
  const key = `${normalizeSiteLanguage(input.lang)}::${query.toLowerCase()}::${categoriesFingerprint.toLowerCase()}`;

  const cached = intentCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      return await callGeminiSearchIntent({
        query,
        lang: input.lang,
        categories: input.categories,
      });
    } catch (error) {
      return buildFallbackSearchIntent({
        query,
        lang: input.lang,
        categories: input.categories,
      });
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, request);

  const result = await request;
  intentCache.set(key, result);
  return result;
}