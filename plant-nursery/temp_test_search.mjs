import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function forceEnv(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    process.env[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
}
forceEnv(".env.local");

const { searchPlants } = await import("./lib/db/search.ts");
try {
  const result = await searchPlants({ query: "usos medicinales", limit: 5, offset: 0 });
  console.log(JSON.stringify({ total: result.total, plants: result.plants.map((p) => p.slug) }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
