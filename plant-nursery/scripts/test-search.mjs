import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";

function forceEnv(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("/")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    process.env[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
}
forceEnv(".env.local");

const sql = neon(process.env.NEON_DATABASE_URL);
const HF_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", HF_MODEL);
  }

  return extractorPromise;
}

async function generateEmbedding(query) {
  const extractor = await getExtractor();
  const data = await extractor(query, { pooling: "mean", normalize: true });
  if (data?.data instanceof Float32Array || data?.data instanceof Float64Array) {
    return Array.from(data.data);
  }
  return Array.isArray(data) && typeof data[0] === "number" ? data : Array.from(data.data ?? []);
}

const queries = ["planta para sombra", "arbol nativo", "riego minimo", "flores rojas"];

for (const query of queries) {
  console.log(`\n=== "${query}" ===`);

  // Semantic search
  const emb = await generateEmbedding(query);
  const vec = `[${emb.join(",")}]`;

  const rows = await sql.query(
    `SELECT slug, name, category, nativo, embedding <=> $1::vector AS distance
     FROM plants WHERE available = true AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector LIMIT 5`,
    [vec]
  );

  rows.forEach(r => console.log(`  ${r.name} (${r.category}) dist=${Number(r.distance).toFixed(3)}`));
}

