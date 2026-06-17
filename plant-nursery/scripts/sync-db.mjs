/**
 * Syncs all plants from Notion to Neon Postgres.
 * For each plant:
 *   1. Upserts all fields
 *   2. Generates OpenAI embedding if text changed
 *   3. Also syncs images to R2 (reuses existing logic)
 *
 * Usage: npm run sync:db
 */

import { Client } from "@notionhq/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";

// Fix fetch for Node.js (neon serverless needs it globally available)
import { plants } from "../lib/db/schema.ts";

// --- Load .env ---------------------------------------------------------------
function loadEnv(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(".env.local");
loadEnv(".env");

// Force override with .env.local values (in case system env has conflicting vars like NEON_DATABASE_URL)
function forceEnv(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("/")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
forceEnv(".env.local");

// --- Clients -----------------------------------------------------------------
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

const sql = neon(process.env.NEON_DATABASE_URL);
const db = drizzle(sql, { schema: { plants } });

// --- Helpers -----------------------------------------------------------------
function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function textOf(items) {
  return (items ?? []).map((i) => i?.plain_text ?? "").join("").trim();
}

function getDatabaseId() {
  const id = process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;
  if (!id) throw new Error("Missing NOTION_DATA_SOURCE_ID");
  return id;
}

// --- Notion fetch ------------------------------------------------------------
async function fetchAllPlants() {
  const pages = [];
  let cursor;
  let hasMore = true;

  while (hasMore) {
    const body = {
      page_size: 100,
      filter: { property: "Available", checkbox: { equals: true } },
    };
    if (cursor) body.start_cursor = cursor;

    const res = await notion.request({
      path: `databases/${getDatabaseId()}/query`,
      method: "post",
      body,
    });

    pages.push(...(res.results ?? []).filter((p) => p.object === "page"));
    cursor = res.next_cursor ?? undefined;
    hasMore = Boolean(res.has_more && cursor);
  }

  return pages;
}

// --- Image map ---------------------------------------------------------------
function readImageMap() {
  const mapPath = path.resolve(process.cwd(), "data", "cloudflare-image-map.json");
  if (!existsSync(mapPath)) return {};
  try {
    return JSON.parse(readFileSync(mapPath, "utf-8"));
  } catch {
    return {};
  }
}

// --- Embedding ---------------------------------------------------------------
function buildEmbeddingText(plant) {
  return [
    plant.name,
    plant.category,
    plant.description,
    plant.flor,
    plant.riego,
    plant.suelo,
    plant.florece,
    plant.exposicion,
    plant.fruta,
    plant.tamano,
  ]
    .filter(Boolean)
    .join(". ");
}

async function generateEmbedding(text) {
  // Use local model via @huggingface/transformers (no API calls)
  const { generateEmbedding: localEmbed } = await import("../lib/embeddings.ts");
  return localEmbed(text);
}

// --- Migrate (ensure schema) -------------------------------------------------
async function ensureSchema() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  await sql`
    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      flor TEXT NOT NULL DEFAULT '',
      riego TEXT NOT NULL DEFAULT '',
      suelo TEXT NOT NULL DEFAULT '',
      florece TEXT NOT NULL DEFAULT '',
      exposicion TEXT NOT NULL DEFAULT '',
      fruta TEXT NOT NULL DEFAULT '',
      tamano TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      nativo BOOLEAN NOT NULL DEFAULT false,
      price INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      available BOOLEAN NOT NULL DEFAULT false,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      notion_updated_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      embedding vector(384),
      embedding_updated_at TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS plants_category_idx ON plants(category)`;
  await sql`CREATE INDEX IF NOT EXISTS plants_nativo_idx ON plants(nativo)`;
  await sql`CREATE INDEX IF NOT EXISTS plants_available_idx ON plants(available)`;

  // Migrate embedding column if dimensions changed (e.g. 1536 → 384)
  // atttypmod for vector(N) = N + 4
  const colInfo = await sql`
    SELECT atttypmod FROM pg_attribute
    WHERE attrelid = 'plants'::regclass AND attname = 'embedding' AND attnum > 0
  `;
  const currentMod = Number(colInfo[0]?.atttypmod ?? -1);
  const expectedMod = 384 + 4; // 388
  if (currentMod !== -1 && currentMod !== expectedMod) {
    console.log(`Migrating embedding column (${currentMod - 4} → 384 dims)...`);
    await sql`DROP INDEX IF EXISTS plants_embedding_idx`;
    await sql`ALTER TABLE plants DROP COLUMN IF EXISTS embedding`;
    await sql`ALTER TABLE plants DROP COLUMN IF EXISTS embedding_updated_at`;
    await sql`ALTER TABLE plants ADD COLUMN embedding vector(384)`;
    await sql`ALTER TABLE plants ADD COLUMN embedding_updated_at TIMESTAMPTZ`;
    console.log("Migration done. All embeddings will be regenerated.");
  }

  // IVFFlat index for fast approximate nearest neighbor search
  const count = await sql`SELECT COUNT(*) FROM plants`;
  if (Number(count[0].count) > 10) {
    await sql`CREATE INDEX IF NOT EXISTS plants_embedding_idx ON plants USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)`;
  }

  console.log("Schema ready.");
}

// --- Map Notion page to plant data -------------------------------------------
function mapNotionPageToPlant(page, imageMap) {
  const titleText = textOf(page.properties?.Title?.title);
  const slugText = textOf(page.properties?.Slug?.rich_text);
  const slug = slugify(slugText || titleText) || page.id;
  const entry = imageMap[slug];
  const images = entry?.cdn?.length ? entry.cdn : [];

  return {
    id: page.id,
    slug,
    name: titleText,
    description: textOf(page.properties?.Description?.rich_text),
    flor: textOf(page.properties?.Flor?.rich_text),
    riego: textOf(page.properties?.Riego?.rich_text),
    suelo: textOf(page.properties?.Suelo?.rich_text),
    florece: textOf(page.properties?.Florece?.rich_text),
    exposicion: textOf(page.properties?.Exposicion?.rich_text),
    fruta: textOf(page.properties?.Fruta?.rich_text),
    tamano: textOf(page.properties?.Tamano?.rich_text),
    category: page.properties?.Category?.select?.name || "",
    nativo: page.properties?.Nativo?.checkbox ?? false,
    price: page.properties?.Price?.number || 0,
    amount: page.properties?.Amount?.number || 0,
    available: page.properties?.Available?.checkbox || false,
    images,
    syncedAt: new Date(),
  };
}

// --- Main --------------------------------------------------------------------
export async function main() {
  console.log("Ensuring DB schema...");
  await ensureSchema();

  console.log("Fetching plants from Notion...");
  const pages = await fetchAllPlants();
  console.log(`Found ${pages.length} plants.\n`);

  const imageMap = readImageMap();

  let upserted = 0;
  let embeddingsGenerated = 0;
  let errors = 0;

  for (const page of pages) {
    const plantData = mapNotionPageToPlant(page, imageMap);

    try {
      // Upsert plant data
      await db
        .insert(plants)
        .values(plantData)
        .onConflictDoUpdate({
          target: plants.id,
          set: {
            slug: plantData.slug,
            name: plantData.name,
            description: plantData.description,
            flor: plantData.flor,
            riego: plantData.riego,
            suelo: plantData.suelo,
            florece: plantData.florece,
            exposicion: plantData.exposicion,
            fruta: plantData.fruta,
            tamano: plantData.tamano,
            category: plantData.category,
            nativo: plantData.nativo,
            price: plantData.price,
            amount: plantData.amount,
            available: plantData.available,
            images: plantData.images,
            syncedAt: plantData.syncedAt,
          },
        });

      upserted++;

      // Check if embedding needs to be regenerated
      const existing = await db
        .select({ embeddingUpdatedAt: plants.embeddingUpdatedAt, name: plants.name })
        .from(plants)
        .where(eq(plants.id, page.id))
        .limit(1);

      const needsEmbedding =
        !existing[0]?.embeddingUpdatedAt ||
        existing[0]?.name !== plantData.name;

      if (needsEmbedding) {
        const embeddingText = buildEmbeddingText(plantData);
        if (embeddingText.trim()) {
          if (!process.env.HUGGINGFACE_API_KEY) {
            // Skip embeddings silently if API key not available
          } else {
            process.stdout.write(`  generating embedding for "${plantData.name}"... `);
            try {
              const embedding = await generateEmbedding(embeddingText);
              await sql`
                UPDATE plants
                SET embedding = ${`[${embedding.join(",")}]`}::vector,
                    embedding_updated_at = NOW()
                WHERE id = ${page.id}
              `;
              embeddingsGenerated++;
              console.log("ok");
            } catch (embErr) {
              console.log(`skipped (${embErr.message.slice(0, 60)})`);
            }
          }
        }
      }

      process.stdout.write(`✓ ${plantData.slug}\n`);
    } catch (err) {
      console.error(`✗ ${plantData.slug}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Upserted: ${upserted}/${pages.length}`);
  console.log(`  Embeddings generated: ${embeddingsGenerated}`);
  console.log(`  Errors: ${errors}`);

  return { total: pages.length, upserted, embeddingsGenerated, errors };
}

main().catch((err) => {
  console.error(`Sync failed: ${err.message}`);
  process.exitCode = 1;
});

