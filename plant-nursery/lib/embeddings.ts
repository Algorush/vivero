/**
 * Embedding generation via OpenAI's /v1/embeddings endpoint.
 * Model: text-embedding-3-small, 1536 dimensions, multilingual (Spanish supported).
 */
import OpenAI from "openai";

const OPENAI_MODEL = "text-embedding-3-small";

export const EMBEDDING_DIMS = 1536;

// In-process cache: same query → same embedding (no repeat API calls)
const embeddingCache = new Map<string, number[]>();

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

  const cached = embeddingCache.get(key);
  if (cached) return cached;

  const response = await getClient().embeddings.create({
    model: OPENAI_MODEL,
    input: key,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("OpenAI API returned no embedding");

  embeddingCache.set(key, embedding);
  return embedding;
}
