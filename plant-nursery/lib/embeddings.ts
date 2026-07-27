/**
 * Embedding generation via OpenAI's /v1/embeddings endpoint.
 * Model: text-embedding-3-small, 1536 dimensions, multilingual (Spanish supported).
 */
import OpenAI from "openai";

const OPENAI_MODEL = "text-embedding-3-small";

export const EMBEDDING_DIMS = 1536;

type EmbeddingGlobals = typeof globalThis & {
  __plantNurseryEmbeddingCache?: Map<string, number[]>;
  __plantNurseryEmbeddingRequests?: Map<string, Promise<number[]>>;
};

const globalForEmbeddings = globalThis as EmbeddingGlobals;

// Persist across module reloads in dev so the same query does not re-hit OpenAI.
const embeddingCache =
  globalForEmbeddings.__plantNurseryEmbeddingCache ?? new Map<string, number[]>();
globalForEmbeddings.__plantNurseryEmbeddingCache = embeddingCache;

// Deduplicate concurrent requests for the same normalized query.
const inFlightEmbeddingRequests =
  globalForEmbeddings.__plantNurseryEmbeddingRequests ?? new Map<string, Promise<number[]>>();
globalForEmbeddings.__plantNurseryEmbeddingRequests = inFlightEmbeddingRequests;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Generate a 1536-dimensional embedding via OpenAI's text-embedding-3-small.
 * Results are cached in memory — the same query never hits the API twice.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const key = text.slice(0, 512).toLowerCase().trim();
  const shouldLog = process.env.NODE_ENV !== "production";

  if (shouldLog) {
    console.log("[embeddings] request", {
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV,
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
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
        console.log("[embeddings] openai=create", { pid: process.pid, inputLength: key.length });
      }

      const response = await getClient().embeddings.create({
        model: OPENAI_MODEL,
        input: key,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) throw new Error("OpenAI API returned no embedding");

      embeddingCache.set(key, embedding);

      if (shouldLog) {
        console.log("[embeddings] openai=ok", {
          pid: process.pid,
          inputLength: key.length,
          dimensions: embedding.length,
        });
      }

      return embedding;
    } catch (error) {
      console.error("[embeddings] OpenAI embedding request failed:", error);
      throw error;
    } finally {
      inFlightEmbeddingRequests.delete(key);
    }
  })();

  inFlightEmbeddingRequests.set(key, request);
  return request;
}
