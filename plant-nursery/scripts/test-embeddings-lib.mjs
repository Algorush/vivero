import { generateEmbedding } from "../lib/embeddings.ts";

const vec = await generateEmbedding("planta para sombra con flores rojas");
console.log("result:", vec ? `vector length ${vec.length}` : "null (failed)");
