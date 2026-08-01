/**
 * Syncs all plants from Notion to Neon Postgres.
 * For each plant:
 *   1. Upserts all fields
 *   2. Generates HuggingFace embedding if text changed
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
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Fix fetch for Node.js (neon serverless needs it globally available)
import { plants } from "../lib/db/schema.ts";
import { buildStructuredEmbeddingText } from "../lib/embedding-text.ts";

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

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseCsv(content) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  return dataRows.map((row) => {
    const record = {};
    for (let index = 0; index < headerRow.length; index += 1) {
      record[headerRow[index]] = row[index] ?? "";
    }
    return record;
  });
}

function loadPlantDescriptions() {
  const candidatePaths = [
    path.resolve(process.cwd(), "plants-desc.csv"),
    path.resolve(process.cwd(), "..", "plants-desc.csv"),
    path.resolve(process.cwd(), "..", "..", "plants-desc.csv"),
  ];

  for (const filePath of candidatePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const rows = parseCsv(content);
    const descriptions = new Map();

    for (const row of rows) {
      const description = String(row.descripcion ?? row.description ?? "").trim();
      if (!description) {
        continue;
      }

      const name = String(row.nombre ?? row.name ?? "").trim();
      const scientificName = String(row.nombre_cientifico ?? row.scientific_name ?? "").trim();

      if (name) {
        descriptions.set(normalizeKey(name), description);
      }

      if (scientificName) {
        descriptions.set(normalizeKey(scientificName), description);
      }
    }

    console.log(`Loaded ${descriptions.size} plant descriptions from ${filePath}`);
    return descriptions;
  }

  console.log("No plants-desc.csv file found; continuing without CSV descriptions.");
  return new Map();
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
// Mirrors lib/image-map.ts's readImageMap(): R2 is the live source of truth
// (kept up to date by the Notion webhook), the local JSON file is only a
// stale fallback for local dev when R2 credentials aren't configured.
async function readImageMap() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;

  if (accountId && accessKeyId && secretAccessKey && bucket) {
    try {
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: "cloudflare-image-map.json" })
      );
      const text = await response.Body.transformToString();
      if (text) return JSON.parse(text);
    } catch {
      // fall through to local file fallback
    }
  }

  const mapPath = path.resolve(process.cwd(), "data", "cloudflare-image-map.json");
  if (!existsSync(mapPath)) return {};
  try {
    return JSON.parse(readFileSync(mapPath, "utf-8"));
  } catch {
    return {};
  }
}

// --- Embedding ---------------------------------------------------------------
function buildEmbeddingText(plant, extraDescription = "") {
  return buildStructuredEmbeddingText({
    name: plant.name,
    category: plant.category,
    description: plant.description,
    extraDescription,
    flor: plant.flor,
    riego: plant.riego,
    suelo: plant.suelo,
    florece: plant.florece,
    exposicion: plant.exposicion,
    fruta: plant.fruta,
    tamano: plant.tamano,
    utilizacion: plant.utilizacion,
    propagacion: plant.propagacion,
    medicinal: plant.medicinal,
  });
}

async function generateEmbedding(text) {
  const { generateEmbedding: hfEmbed } = await import("../lib/embeddings.ts");
  return hfEmbed(text);
}

// --- Migrate (ensure schema) -------------------------------------------------
async function ensureSchema() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  await sql`
    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      name_en TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      description_en TEXT NOT NULL DEFAULT '',
      flor TEXT NOT NULL DEFAULT '',
      flor_en TEXT NOT NULL DEFAULT '',
      riego TEXT NOT NULL DEFAULT '',
      riego_en TEXT NOT NULL DEFAULT '',
      suelo TEXT NOT NULL DEFAULT '',
      suelo_en TEXT NOT NULL DEFAULT '',
      florece TEXT NOT NULL DEFAULT '',
      florece_en TEXT NOT NULL DEFAULT '',
      exposicion TEXT NOT NULL DEFAULT '',
      exposicion_en TEXT NOT NULL DEFAULT '',
      fruta TEXT NOT NULL DEFAULT '',
      fruta_en TEXT NOT NULL DEFAULT '',
      tamano TEXT NOT NULL DEFAULT '',
      tamano_en TEXT NOT NULL DEFAULT '',
      utilizacion TEXT NOT NULL DEFAULT '',
      utilizacion_en TEXT NOT NULL DEFAULT '',
      propagacion TEXT NOT NULL DEFAULT '',
      propagacion_en TEXT NOT NULL DEFAULT '',
      medicinal TEXT NOT NULL DEFAULT '',
      medicinal_en TEXT NOT NULL DEFAULT '',
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

  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS utilizacion TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS flor_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS riego_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS suelo_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS florece_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS exposicion_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS fruta_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS tamano_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS utilizacion_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagacion TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagacion_en TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS medicinal TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE plants ADD COLUMN IF NOT EXISTS medicinal_en TEXT NOT NULL DEFAULT ''`;

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
  const titleTextEn = textOf(page.properties?.title_en?.title);
  const slugText = textOf(page.properties?.Slug?.rich_text);
  const slug = slugify(slugText || titleText) || page.id;
  const entry = imageMap[slug];
  const images = entry?.cdn?.length ? entry.cdn : [];

  return {
    id: page.id,
    slug,
    name: titleText,
    nameEn: titleTextEn,
    description: textOf(page.properties?.Description?.rich_text),
    descriptionEn: textOf(page.properties?.description_en?.rich_text),
    flor: textOf(page.properties?.Flor?.rich_text),
    florEn: textOf(page.properties?.flor_en?.rich_text),
    riego: textOf(page.properties?.Riego?.rich_text),
    riegoEn: textOf(page.properties?.riego_en?.rich_text),
    suelo: textOf(page.properties?.Suelo?.rich_text),
    sueloEn: textOf(page.properties?.suelo_en?.rich_text),
    florece: textOf(page.properties?.Florece?.rich_text),
    floreceEn: textOf(page.properties?.florece_en?.rich_text),
    exposicion: textOf(page.properties?.Exposicion?.rich_text),
    exposicionEn: textOf(page.properties?.exposicion_en?.rich_text),
    fruta: textOf(page.properties?.Fruta?.rich_text),
    frutaEn: textOf(page.properties?.fruta_en?.rich_text),
    tamano: textOf(page.properties?.Tamano?.rich_text),
    tamanoEn: textOf(page.properties?.tamano_en?.rich_text),
    utilizacion: textOf(page.properties?.Utilizacion?.rich_text),
    utilizacionEn: textOf(page.properties?.utilizacion_en?.rich_text),
    propagacion: textOf(page.properties?.Propagacion?.rich_text),
    propagacionEn: textOf(page.properties?.propagacion_en?.rich_text),
    medicinal: textOf(page.properties?.Medicinal?.rich_text),
    medicinalEn: textOf(page.properties?.medicinal_en?.rich_text),
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
  const forceRebuildEmbeddings = process.env.FORCE_REGENERATE_EMBEDDINGS === "1";
  console.log("Ensuring DB schema...");
  await ensureSchema();

  console.log("Fetching plants from Notion...");
  const pages = await fetchAllPlants();
  console.log(`Found ${pages.length} plants.\n`);

  const csvDescriptions = loadPlantDescriptions();
  const imageMap = await readImageMap();

  let upserted = 0;
  let embeddingsGenerated = 0;
  let errors = 0;

  for (const page of pages) {
    const plantData = mapNotionPageToPlant(page, imageMap);
    const extraDescription = csvDescriptions.get(normalizeKey(plantData.name))
      || csvDescriptions.get(normalizeKey(plantData.slug))
      || "";

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
            nameEn: plantData.nameEn,
            description: plantData.description,
            descriptionEn: plantData.descriptionEn,
            flor: plantData.flor,
            florEn: plantData.florEn,
            riego: plantData.riego,
            riegoEn: plantData.riegoEn,
            suelo: plantData.suelo,
            sueloEn: plantData.sueloEn,
            florece: plantData.florece,
            floreceEn: plantData.floreceEn,
            exposicion: plantData.exposicion,
            exposicionEn: plantData.exposicionEn,
            fruta: plantData.fruta,
            frutaEn: plantData.frutaEn,
            tamano: plantData.tamano,
            tamanoEn: plantData.tamanoEn,
            utilizacion: plantData.utilizacion,
            utilizacionEn: plantData.utilizacionEn,
            propagacion: plantData.propagacion,
            propagacionEn: plantData.propagacionEn,
            medicinal: plantData.medicinal,
            medicinalEn: plantData.medicinalEn,
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
        forceRebuildEmbeddings ||
        !existing[0]?.embeddingUpdatedAt ||
        !existing[0]?.embedding ||
        existing[0]?.name !== plantData.name;

      if (needsEmbedding) {
        const embeddingText = buildEmbeddingText(plantData, extraDescription);
        if (embeddingText.trim()) {
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

