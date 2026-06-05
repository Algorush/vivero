/**
 * Full sync script: Notion Images → Cloudflare Images CDN.
 *
 * For each plant in Notion:
 *   - Compares current Notion image URLs against saved hashes.
 *   - If image is new or changed, downloads, optimizes, uploads to Cloudflare.
 *   - Saves results to data/cloudflare-image-map.json.
 *
 * Usage: npm run sync:cloudflare
 */

import { Client } from "@notionhq/client";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadImageFromUrl, uploadLocalFile } from "./upload-to-cloudinary.mjs";

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

// --- Notion client -----------------------------------------------------------
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

// --- Image map ---------------------------------------------------------------
const IMAGE_MAP_PATH = path.resolve(process.cwd(), "data", "cloudflare-image-map.json");
const IMAGE_MAP_KEY = "cloudflare-image-map.json";

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function readMap() {
  if (!existsSync(IMAGE_MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(IMAGE_MAP_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveMap(map) {
  const dir = path.dirname(IMAGE_MAP_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(IMAGE_MAP_PATH, JSON.stringify(map, null, 2));

  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!client || !bucket) return;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: IMAGE_MAP_KEY,
      Body: JSON.stringify(map, null, 2),
      ContentType: "application/json",
    })
  );
}

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

function getSlug(page) {
  const slug = textOf(page.properties?.Slug?.rich_text);
  const title = textOf(page.properties?.Title?.title);
  return slugify(slug || title) || page.id;
}

function getNotionImageUrls(page) {
  return (page.properties?.Image?.files ?? [])
    .map((f) => f?.file?.url ?? f?.external?.url ?? "")
    .filter(Boolean);
}

const LOCAL_IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];
const PUBLIC_PLANTS_DIR = path.resolve(process.cwd(), "public", "notion-images", "plants");

// Find a local file for e.g. "ficus-1" → returns absolute path or null.
function findLocalFile(slug, index) {
  for (const ext of LOCAL_IMAGE_EXTENSIONS) {
    const p = path.join(PUBLIC_PLANTS_DIR, `${slug}-${index}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

// Stable hash: strip Notion's expiring query params before comparing.
function stableHash(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

// --- Notion fetch ------------------------------------------------------------
function getDatabaseId() {
  const id = process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;
  if (!id) throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID");
  return id;
}

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

// --- Sync one plant ----------------------------------------------------------
async function syncPlant(page, map) {
  const slug = getSlug(page);
  const notionUrls = getNotionImageUrls(page);

  // Collect all sources: prefer local files, fallback to Notion URL.
  const sources = [];
  for (let i = 0; i < Math.max(notionUrls.length, 10); i++) {
    const localFile = findLocalFile(slug, i + 1);
    if (localFile) {
      sources.push({ type: "local", value: localFile, hash: `local:${slug}-${i + 1}` });
    } else if (notionUrls[i]) {
      sources.push({ type: "url", value: notionUrls[i], hash: stableHash(notionUrls[i]) });
    }
  }

  if (sources.length === 0) {
    return false;
  }

  const existing = map[slug] ?? { cdn: [], hashes: [] };
  const newCdn = [];
  const newHashes = [];
  let changed = false;

  for (let i = 0; i < sources.length; i++) {
    const { type, value, hash } = sources[i];
    const cfId = `plant-${slug}-${i + 1}`;

    if (existing.hashes[i] === hash && existing.cdn[i]) {
      // Not changed — reuse existing CDN URL.
      newCdn.push(existing.cdn[i]);
      newHashes.push(hash);
    } else {
      try {
        process.stdout.write(`  uploading ${cfId} (${type})... `);
        const cdnUrl =
          type === "local"
            ? await uploadLocalFile(value, cfId)
            : await uploadImageFromUrl(value, cfId);
        newCdn.push(cdnUrl);
        newHashes.push(hash);
        changed = true;
        console.log("ok");
      } catch (err) {
        console.log(`warn: ${err.message}`);
        if (existing.cdn[i]) {
          newCdn.push(existing.cdn[i]);
          newHashes.push(existing.hashes[i] ?? "");
        }
      }
    }
  }

  map[slug] = { cdn: newCdn, hashes: newHashes };
  return changed;
}

// --- Main --------------------------------------------------------------------
async function main() {
  console.log("Fetching plants from Notion...");
  const plants = await fetchAllPlants();
  console.log(`Found ${plants.length} plants.\n`);

  const map = readMap();
  let updatedCount = 0;

  for (const page of plants) {
    const slug = getSlug(page);
    console.log(`Plant: ${slug}`);
    const changed = await syncPlant(page, map);
    if (changed) updatedCount++;
  }

  await saveMap(map);
  console.log(`\nDone. Updated ${updatedCount}/${plants.length} plants.`);
  console.log(`Image map saved to: ${IMAGE_MAP_PATH}`);
}

main().catch((err) => {
  console.error(`Sync failed: ${err.message}`);
  process.exitCode = 1;
});
