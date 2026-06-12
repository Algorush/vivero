import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
const r = await sql`SELECT COUNT(*) as total, COUNT(embedding) as with_embeddings FROM plants`;
console.log("Plants in DB:", r[0]);
const sample = await sql`SELECT slug, name, category FROM plants LIMIT 5`;
console.log("Sample:", sample);

