/**
 * Embedding generation via Google's Gemini embeddings API.
 * Model: gemini-embedding-001, 768 dimensions.
 */
const GEMINI_MODEL = "gemini-embedding-001";
const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:embedContent`;

export const EMBEDDING_DIMS = 768;

type EmbeddingGlobals = typeof globalThis & {
  __plantNurseryEmbeddingCache?: Map<string, number[]>;
  __plantNurseryEmbeddingRequests?: Map<string, Promise<number[] | null>>;
};

const globalForEmbeddings = globalThis as EmbeddingGlobals;

// Persist across module reloads in dev so the same query does not re-hit the API.
const embeddingCache =
  globalForEmbeddings.__plantNurseryEmbeddingCache ?? new Map<string, number[]>();
globalForEmbeddings.__plantNurseryEmbeddingCache = embeddingCache;

// Deduplicate concurrent requests for the same normalized query.
const inFlightEmbeddingRequests =
  globalForEmbeddings.__plantNurseryEmbeddingRequests ?? new Map<string, Promise<number[] | null>>();
globalForEmbeddings.__plantNurseryEmbeddingRequests = inFlightEmbeddingRequests;

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

async function callGeminiEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const response = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini embedding request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as { embedding?: { values?: unknown } };
  const values = payload.embedding?.values;

  if (!isNumberArray(values) || values.length === 0) {
    throw new Error("Gemini API returned an empty embedding payload");
  }

  return values;
}

/**
 * Generate a 768-dimensional embedding via Google's Gemini embeddings API.
 * Results are cached in memory — the same query never hits the API twice.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = text.slice(0, 2048).toLowerCase().trim();
  const shouldLog = process.env.NODE_ENV !== "production";

  if (shouldLog) {
    console.log("[embeddings] request", {
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV,
      inputLength: key.length,
    });
  }

  const cached = embeddingCache.get(key);
  if (cached) {
    if (shouldLog) {
      console.log("[embeddings] cache=hit", { pid: process.pid, inputLength: key.length });
    }
    return cached;
  }

  const inFlight = inFlightEmbeddingRequests.get(key);
  if (inFlight) {
    if (shouldLog) {
      console.log("[embeddings] cache=in-flight", { pid: process.pid, inputLength: key.length });
    }
    return inFlight;
  }

  if (shouldLog) {
    console.log("[embeddings] cache=miss", { pid: process.pid, inputLength: key.length });
  }

  const request = (async () => {
    try {
      if (shouldLog) {
        console.log("[embeddings] gemini=load", { pid: process.pid, inputLength: key.length });
      }

      const embedding = await callGeminiEmbedding(key);

      embeddingCache.set(key, embedding);

      if (shouldLog) {
        console.log("[embeddings] gemini=ok", {
          pid: process.pid,
          inputLength: key.length,
          dimensions: embedding.length,
        });
      }

      return embedding;
    } catch (error) {
      console.error("[embeddings] Gemini embedding generation failed:", error);
      return null;
    } finally {
      inFlightEmbeddingRequests.delete(key);
    }
  })();

  inFlightEmbeddingRequests.set(key, request);
  return request;
}

