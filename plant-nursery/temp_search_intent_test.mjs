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

const searchIntentModule = (await import("./lib/search-intent.ts")).default;
const parseSearchIntent = searchIntentModule.parseSearchIntent;
const categories = ["Arbol", "Arbusto", "Conifera", "Cubresuelo", "Flor", "Herbacea", "Trepadora"];

for (const query of [
  "arbol que de sombra y poco riego",
  "busco planta de poco riego",
  "arbol pequeno para jardin pequeno",
]) {
  const intent = await parseSearchIntent({ query, lang: "es", categories });
  console.log(`QUERY: ${query}`);
  console.log(JSON.stringify(intent, null, 2));
}
