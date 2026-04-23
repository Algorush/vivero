import { Client } from "@notionhq/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUEST_TIMEOUT_MS = 120000;
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1200;

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
  timeoutMs: REQUEST_TIMEOUT_MS,
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  return notionRequestWithRetry({
    path: `databases/${getDatabaseId()}`,
    method: "get",
  }, "Load database schema");
}

function resolvePropertyName(properties, preferredName, expectedType, allowTypeFallback = false) {
  const exactMatch = Object.entries(properties).find(([name, config]) => {
    return normalizeKey(name) === normalizeKey(preferredName) && config.type === expectedType;
  });

  if (exactMatch) {
    return exactMatch[0];
  }

  if (!allowTypeFallback) {
    return null;
  }

  const typeMatch = Object.entries(properties).find(([, config]) => config.type === expectedType);
  return typeMatch?.[0] ?? null;
}

async function getExistingSlugs(slugPropertyName) {
  const slugs = new Set();
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = { page_size: 100 };
    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notionRequestWithRetry({
      path: `databases/${getDatabaseId()}/query`,
      method: "post",
      body,
    }, "Query existing slugs");

    for (const page of response.results ?? []) {
      const items = page?.properties?.[slugPropertyName]?.rich_text ?? [];
      const slug = items.map((item) => item?.plain_text ?? "").join("").trim();
      if (slug) {
        slugs.add(slug);
      }
    }

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return slugs;
}

function toTitle(value) {
  return [{ type: "text", text: { content: value } }];
}

function toRichText(value) {
  return [{ type: "text", text: { content: value } }];
}

function buildProperties(row, mapping) {
  const properties = {};

  if (mapping.title && row.Title?.trim()) {
    properties[mapping.title] = { title: toTitle(row.Title.trim()) };
  }

  if (mapping.slug && row.slug?.trim()) {
    properties[mapping.slug] = { rich_text: toRichText(row.slug.trim()) };
  }

  const richTextColumns = [
    ["Description", "description"],
    ["Suelo", "suelo"],
    ["Exposicion", "exposicion"],
    ["Riego", "riego"],
    ["Tamano", "tamano"],
    ["Florece", "florece"],
    ["Fruta", "fruta"],
    ["Cuidados", "cuidados"],
  ];

  for (const [csvColumn, mappingKey] of richTextColumns) {
    const propertyName = mapping[mappingKey];
    const value = row[csvColumn]?.trim();

    if (propertyName && value) {
      properties[propertyName] = { rich_text: toRichText(value) };
    }
  }

  if (mapping.category && row.Category?.trim()) {
    properties[mapping.category] = {
      select: { name: row.Category.trim() },
    };
  }

  if (mapping.available) {
    properties[mapping.available] = { checkbox: true };
  }

  return properties;
}

async function main() {
  const csvPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), "new-plants.csv");

  const csvContent = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvContent);

  if (rows.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const schema = await getDatabaseSchema();
  const properties = schema.properties ?? {};

  const mapping = {
    title: resolvePropertyName(properties, "Title", "title", true),
    slug: resolvePropertyName(properties, "Slug", "rich_text"),
    description: resolvePropertyName(properties, "Description", "rich_text"),
    category: resolvePropertyName(properties, "Category", "select"),
    suelo: resolvePropertyName(properties, "Suelo", "rich_text"),
    exposicion: resolvePropertyName(properties, "Exposicion", "rich_text"),
    riego: resolvePropertyName(properties, "Riego", "rich_text"),
    tamano: resolvePropertyName(properties, "Tamano", "rich_text"),
    florece: resolvePropertyName(properties, "Florece", "rich_text"),
    fruta: resolvePropertyName(properties, "Fruta", "rich_text"),
    cuidados: resolvePropertyName(properties, "Cuidados", "rich_text"),
    available: resolvePropertyName(properties, "Available", "checkbox"),
  };

  if (!mapping.title || !mapping.slug) {
    throw new Error("Required Notion properties for title/slug were not found.");
  }

  const existingSlugs = await getExistingSlugs(mapping.slug);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const slug = row.slug?.trim();
    const title = row.Title?.trim();

    if (!slug || !title) {
      skipped += 1;
      console.log(`[skip] Missing Title or slug: ${JSON.stringify(row)}`);
      continue;
    }

    if (existingSlugs.has(slug)) {
      skipped += 1;
      console.log(`[skip] Existing slug: ${slug}`);
      continue;
    }

    const notionProperties = buildProperties(row, mapping);

    try {
      await notionRequestWithRetry({
        path: "pages",
        method: "post",
        body: {
          parent: { database_id: getDatabaseId() },
          properties: notionProperties,
        },
      }, `Create page for slug ${slug}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[fail] ${slug}: ${message}`);
      continue;
    }

    existingSlugs.add(slug);
    created += 1;
    console.log(`[create] ${slug}`);
  }

  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CSV import failed: ${message}`);
  process.exitCode = 1;
});