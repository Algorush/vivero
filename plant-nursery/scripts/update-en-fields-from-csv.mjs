// Updates only the "_en" (English) rich-text properties of existing Notion
// plant pages, matched by Slug, from a CSV export (e.g. Vivero_plantas_EN_traducido.csv).
import { Client } from "@notionhq/client";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

function loadEnvFile(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  const content = readFileSync(fullPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const REQUEST_TIMEOUT_MS = 120000;
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1200;

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
  timeoutMs: REQUEST_TIMEOUT_MS,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNotionError(error) {
  const maybeCode = String(error?.code ?? "").toLowerCase();
  const maybeName = String(error?.name ?? "").toLowerCase();
  const maybeMessage = String(error?.message ?? "").toLowerCase();
  const status = Number(error?.status ?? 0);

  if (status >= 500 || status === 429 || status === 408) {
    return true;
  }

  return (
    maybeCode.includes("timeout") ||
    maybeName.includes("timeout") ||
    maybeMessage.includes("timeout") ||
    maybeCode.includes("rate_limited")
  );
}

async function notionRequestWithRetry(args, context = "Notion request") {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await notion.request(args);
    } catch (error) {
      const isLastAttempt = attempt === RETRY_ATTEMPTS;

      if (!isRetryableNotionError(error) || isLastAttempt) {
        throw error;
      }

      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[retry] ${context} failed (attempt ${attempt}/${RETRY_ATTEMPTS}): ${message}`);
      await sleep(delayMs);
    }
  }

  throw new Error(`${context} failed unexpectedly.`);
}

function getDatabaseId() {
  const databaseId = process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;

  if (!databaseId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID.");
  }

  return databaseId;
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

async function getDatabaseSchema() {
  return notionRequestWithRetry(
    { path: `databases/${getDatabaseId()}`, method: "get" },
    "Load database schema"
  );
}

function resolvePropertyName(properties, preferredName, expectedType) {
  const exactMatch = Object.entries(properties).find(
    ([name, config]) => normalizeKey(name) === normalizeKey(preferredName) && config.type === expectedType
  );

  return exactMatch?.[0] ?? null;
}

// Notion rich_text content is capped at 2000 chars per text object.
function toRichText(value) {
  const chunks = value.match(/.{1,2000}/gs) ?? [value];
  return chunks.map((chunk) => ({ type: "text", text: { content: chunk } }));
}

async function getExistingPagesBySlug(slugPropertyName) {
  const pages = new Map(); // slug -> page id
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = { page_size: 100 };
    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notionRequestWithRetry(
      { path: `databases/${getDatabaseId()}/query`, method: "post", body },
      "Query existing pages"
    );

    for (const page of response.results ?? []) {
      const items = page?.properties?.[slugPropertyName]?.rich_text ?? [];
      const slug = items.map((item) => item?.plain_text ?? "").join("").trim();
      if (slug) {
        pages.set(slug, page.id);
      }
    }

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return pages;
}

// CSV column name -> Notion property name to look up (both already end with "_en").
const EN_COLUMNS = [
  "description_en",
  "suelo_en",
  "florece_en",
  "riego_en",
  "exposicion_en",
  "tamano_en",
  "fruta_en",
  "utilizacion_en",
  "propagacion_en",
  "frase_en",
  "medicinal_en",
];

async function main() {
  const csvPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), "Vivero_plantas_EN_traducido.csv");

  const dryRun = process.argv.includes("--dry-run");

  const csvContent = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvContent);

  if (rows.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const schema = await getDatabaseSchema();
  const properties = schema.properties ?? {};

  const slugProperty = resolvePropertyName(properties, "Slug", "rich_text");
  if (!slugProperty) {
    throw new Error("Could not find a rich_text 'Slug' property in the Notion database.");
  }

  const enPropertyMapping = {};
  for (const column of EN_COLUMNS) {
    const propertyName = resolvePropertyName(properties, column, "rich_text");
    if (propertyName) {
      enPropertyMapping[column] = propertyName;
    } else {
      console.warn(`[warn] No matching Notion property found for CSV column "${column}", it will be skipped.`);
    }
  }

  const existingPages = await getExistingPagesBySlug(slugProperty);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const slug = row.Slug?.trim();

    if (!slug) {
      skipped += 1;
      console.log(`[skip] Missing slug in row: ${row.Title ?? "?"}`);
      continue;
    }

    const pageId = existingPages.get(slug);
    if (!pageId) {
      skipped += 1;
      console.log(`[skip] No Notion page found for slug: ${slug}`);
      continue;
    }

    const updateProperties = {};
    for (const [column, propertyName] of Object.entries(enPropertyMapping)) {
      const value = row[column]?.trim();
      if (value) {
        updateProperties[propertyName] = { rich_text: toRichText(value) };
      }
    }

    if (Object.keys(updateProperties).length === 0) {
      skipped += 1;
      console.log(`[skip] No EN values in CSV for slug: ${slug}`);
      continue;
    }

    if (dryRun) {
      updated += 1;
      console.log(`[dry-run] Would update ${slug}: ${Object.keys(updateProperties).join(", ")}`);
      continue;
    }

    try {
      await notionRequestWithRetry(
        { path: `pages/${pageId}`, method: "patch", body: { properties: updateProperties } },
        `Update EN fields for slug ${slug}`
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[fail] ${slug}: ${message}`);
      continue;
    }

    updated += 1;
    console.log(`[update] ${slug}: ${Object.keys(updateProperties).join(", ")}`);
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`EN fields update failed: ${message}`);
  process.exitCode = 1;
});
