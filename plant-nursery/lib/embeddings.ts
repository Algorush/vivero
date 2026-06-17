/**
 * Embedding generation via Hugging Face Inference API (router, 2025+).
 * Uses OpenAI-compatible /v1/embeddings endpoint.
 * Model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
 * 384 dimensions, multilingual (Spanish supported). Free tier.
 */

const HF_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const HF_API_URL = "https://router.huggingface.co/hf-inference/v1/embeddings";

export const EMBEDDING_DIMS = 384;

// In-process cache: same query → same embedding (no repeat API calls)
const embeddingCache = new Map<string, number[]>();

/**
 * Generate a 384-dimensional embedding via HuggingFace Inference API.
 * Results are cached in memory — the same query never hits the API twice.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const key = text.slice(0, 512).toLowerCase().trim();

  const cached = embeddingCache.get(key);
  if (cached) return cached;

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error("Missing HUGGINGFACE_API_KEY env var");

  const res = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: HF_MODEL, inputs: key }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HuggingFace API ${res.status}: ${body.slice(0, 200)}`);
  }

  // OpenAI-compatible response: { data: [{ embedding: number[] }] }
  const json = await res.json() as { data?: Array<{ embedding: number[] }> };
  const embedding = json.data?.[0]?.embedding;

  if (!embedding) throw new Error("HuggingFace API returned no embedding");

  embeddingCache.set(key, embedding);
  return embedding;
}
