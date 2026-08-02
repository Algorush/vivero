/**
 * Embedding generation via a local HuggingFace feature-extraction pipeline.
 * Model: Xenova/all-MiniLM-L6-v2, 384 dimensions.
 */

// @ts-ignore - direct web bundle import avoids the Node-only ONNX runtime path on Vercel.
import { env, pipeline } from "../node_modules/@huggingface/transformers/dist/transformers.web.js";

const HF_MODEL = "Xenova/all-MiniLM-L6-v2";

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/`;

export const EMBEDDING_DIMS = 384;

type EmbeddingGlobals = typeof globalThis & {
  __plantNurseryEmbeddingCache?: Map<string, number[]>;
  __plantNurseryEmbeddingRequests?: Map<string, Promise<number[] | null>>;
  __plantNurseryEmbeddingPipeline?: Promise<FeatureExtractor | null>;
};

type FeatureExtractor = (text: string, options?: { pooling?: string; normalize?: boolean }) => Promise<unknown>;

const globalForEmbeddings = globalThis as EmbeddingGlobals;

// Persist across module reloads in dev so the same query does not re-hit OpenAI.
const embeddingCache =
  globalForEmbeddings.__plantNurseryEmbeddingCache ?? new Map<string, number[]>();
globalForEmbeddings.__plantNurseryEmbeddingCache = embeddingCache;

// Deduplicate concurrent requests for the same normalized query.
const inFlightEmbeddingRequests =
  globalForEmbeddings.__plantNurseryEmbeddingRequests ?? new Map<string, Promise<number[] | null>>();
globalForEmbeddings.__plantNurseryEmbeddingRequests = inFlightEmbeddingRequests;

async function getFeatureExtractor(): Promise<FeatureExtractor> {
  if (!globalForEmbeddings.__plantNurseryEmbeddingPipeline) {
    globalForEmbeddings.__plantNurseryEmbeddingPipeline = (async () => {
      const extractor = await pipeline("feature-extraction", HF_MODEL);
      return extractor as FeatureExtractor;
    })().catch((error) => {
      console.error("[embeddings] failed to load HuggingFace model:", error);
      return null;
    });
  }

  const extractor = await globalForEmbeddings.__plantNurseryEmbeddingPipeline;
  if (!extractor) {
    throw new Error("HuggingFace embedding model is unavailable");
  }

  return extractor;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function meanPool(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const dimensions = vectors[0]?.length ?? 0;
  const sums = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      sums[index] += vector[index] ?? 0;
    }
  }

  return sums.map((sum) => sum / vectors.length);
}

function normalizeEmbeddingResponse(payload: unknown): number[] {
  if (isNumberArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (data instanceof Float32Array || data instanceof Float64Array) {
      return Array.from(data);
    }
    if (Array.isArray(data) && data.every((item) => typeof item === "number")) {
      return data;
    }
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("HuggingFace pipeline returned an empty embedding payload");
  }

  const first = payload[0];

  if (isNumberArray(first)) {
    return meanPool(payload as number[][]);
  }

  if (Array.isArray(first) && isNumberArray(first[0])) {
    const batch = payload as number[][][];
    return meanPool(batch[0] ?? []);
  }

  throw new Error("Unsupported HuggingFace embedding payload shape");
}

/**
 * Generate a 384-dimensional embedding via HuggingFace's all-MiniLM-L6-v2.
 * Results are cached in memory — the same query never hits the API twice.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = text.slice(0, 512).toLowerCase().trim();
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
        console.log("[embeddings] hf=load", { pid: process.pid, inputLength: key.length });
      }

      const extractor = await getFeatureExtractor();
      const payload = await extractor(key, { pooling: "mean", normalize: true });
      const embedding = normalizeEmbeddingResponse(payload);

      if (!embedding.length) throw new Error("HuggingFace API returned no embedding");

      embeddingCache.set(key, embedding);

      if (shouldLog) {
        console.log("[embeddings] hf=ok", {
          pid: process.pid,
          inputLength: key.length,
          dimensions: embedding.length,
        });
      }

      return embedding;
    } catch (error) {
      console.error("[embeddings] HuggingFace embedding generation failed:", error);
      return null;
    } finally {
      inFlightEmbeddingRequests.delete(key);
    }
  })();

  inFlightEmbeddingRequests.set(key, request);
  return request;
}
