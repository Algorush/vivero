import { Client } from "@notionhq/client";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

const NURSERY_PAGE_RAW_ID =
  "Vivero-Kar-lemu-plantas-nativas-y-ex-ticas-33a014ba6d4b8024b8caf02162fc9492";

const outputRoot = path.resolve(process.cwd(), "public", "notion-images");
const ONE_MB = 1024 * 1024;
const MAX_WIDTH = 1500;

function getDatabaseId() {
  const databaseId = process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;
  if (!databaseId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID.");
  }
  return databaseId;
}

function normalizeNotionPageId(value) {
  const compact = value.replace(/-/g, "");
  const match = compact.match(/[0-9a-fA-F]{32}/);

  if (!match) {
    return value;
  }

  const id = match[0].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function textArrayToPlain(items) {
  return (items ?? []).map((item) => item?.plain_text ?? "").join("").trim();
}

function slugifyFileName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function createUrlHash(value) {
  let hash = 5381;

  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }

  return hash.toString(36);
}

function getPlantImageBaseName(page) {
  const slug = textArrayToPlain(page?.properties?.Slug?.rich_text);
  const title = textArrayToPlain(page?.properties?.Title?.title);
  const preferredName = slugifyFileName(slug || title);

  if (preferredName) {
    return preferredName;
  }

  return "plant";
}

function buildLocalPlantImagePath(page, imageUrl, index) {
  void imageUrl;
  const baseName = getPlantImageBaseName(page);

  return `/notion-images/plants/${baseName}-${index + 1}.jpg`;
}

function buildLocalNotionImagePath(url, bucket) {
  void url;
  const hash = createUrlHash(url);
  return `/notion-images/${bucket}/${hash}.jpg`;
}

async function optimizeToJpg(bytes) {
  const quality = bytes.length > ONE_MB ? 70 : 82;

  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer();
}

function getNotionFileUrl(item) {
  return item?.file?.url ?? item?.external?.url ?? "";
}

async function fetchAllPlantPages() {
  const pages = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = { page_size: 100 };
    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notion.request({
      path: `databases/${getDatabaseId()}/query`,
      method: "post",
      body,
    });

    const results = Array.isArray(response.results) ? response.results : [];
    pages.push(...results.filter((page) => page?.object === "page"));

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return pages;
}

async function fetchAllPageBlocks(pageId) {
  const blocks = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const query = cursor
      ? `blocks/${pageId}/children?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
      : `blocks/${pageId}/children?page_size=100`;

    const response = await notion.request({
      path: query,
      method: "get",
    });

    const results = Array.isArray(response.results) ? response.results : [];
    blocks.push(...results);

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return blocks;
}

async function downloadImageToPublic(url, localPath) {
  const publicRelativePath = localPath.replace(/^\//, "");
  const targetPath = path.resolve(process.cwd(), "public", publicRelativePath);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content-type for image URL: ${contentType || "unknown"}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const optimizedBytes = await optimizeToJpg(bytes);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, optimizedBytes);

  return localPath;
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "plants"), { recursive: true });
  await mkdir(path.join(outputRoot, "nursery"), { recursive: true });

  const downloadQueue = [];

  const plantPages = await fetchAllPlantPages();
  for (const page of plantPages) {
    const files = page?.properties?.Image?.files ?? [];
    const sourceImages = files
      .map((file) => getNotionFileUrl(file))
      .filter(Boolean);

    for (const [index, imageUrl] of sourceImages.entries()) {
      const localPath = buildLocalPlantImagePath(page, imageUrl, index);
      downloadQueue.push({ imageUrl, localPath });
    }
  }

  const nurseryBlocks = await fetchAllPageBlocks(normalizeNotionPageId(NURSERY_PAGE_RAW_ID));
  for (const block of nurseryBlocks) {
    const imageUrl = block?.image?.file?.url ?? block?.image?.external?.url ?? "";
    if (!imageUrl) {
      continue;
    }

    const localPath = buildLocalNotionImagePath(imageUrl, "nursery");
    downloadQueue.push({ imageUrl, localPath });
  }

  let downloaded = 0;
  let skipped = 0;

  for (const { imageUrl, localPath } of downloadQueue) {
    try {
      await downloadImageToPublic(imageUrl, localPath);
      downloaded += 1;
    } catch (error) {
      skipped += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[warn] ${imageUrl} -> ${message}`);
    }
  }

  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Output: ${outputRoot}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Image sync failed: ${message}`);
  process.exitCode = 1;
});
