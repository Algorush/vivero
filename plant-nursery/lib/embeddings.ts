/**
 * Embedding generation via Hugging Face Inference API.
 * Model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
 * 384 dimensions, multilingual (Spanish supported). Free tier.
 * No packages needed — uses native fetch.
 */

const HF_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const HF_API_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`;

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
    body: JSON.stringify({ inputs: key, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HuggingFace API ${res.status}: ${body.slice(0, 200)}`);
  }

  // feature-extraction returns either:
  //   2D array [tokens × dims]  → need mean pooling
  //   1D array [dims]           → already pooled
  const data = (await res.json()) as number[][] | number[];
  let embedding: number[];

  if (Array.isArray(data[0])) {
    const matrix = data as number[][];
    const dims = matrix[0].length;
    embedding = new Array(dims).fill(0) as number[];
    for (const token of matrix) {
      for (let i = 0; i < dims; i++) embedding[i] += token[i];
    }
    for (let i = 0; i < dims; i++) embedding[i] /= matrix.length;
  } else {
    embedding = data as number[];
  }

  embeddingCache.set(key, embedding);
  return embedding;
}
