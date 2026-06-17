import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function getDb() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Missing NEON_DATABASE_URL");
  const sql = neon(url) as NeonQueryFunction<boolean, boolean>;
  return drizzle(sql, { schema });
}

export const db = getDb();
export { schema };

