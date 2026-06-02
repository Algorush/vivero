import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Client } from "@notionhq/client";

// Load env
for (const envFile of [".env.local", ".env"]) {
  const p = join(process.cwd(), envFile);
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k && !process.env[k]) process.env[k] = v;
      }
    }
  }
}

const notion = new Client({ auth: process.env.NOTION_API_KEY, notionVersion: "2022-06-28" });
const dbId = process.env.NOTION_DATA_SOURCE_ID;

// Short slugs that were created by mistake (duplicates of the long-slug originals)
const shortSlugsToDelete = new Set([
  "nalca", "quila", "cipres-cordillera", "coigue-magallanes",
  "chilco", "rauli", "alerce", "lenga", "araucaria", "roble", "coigue",
]);

let cursor;
let hasMore = true;
const toArchive = [];

while (hasMore) {
  const body = { page_size: 100 };
  if (cursor) body.start_cursor = cursor;
  const res = await notion.request({ path: `databases/${dbId}/query`, method: "post", body });
  for (const page of res.results ?? []) {
    const props = page.properties;
    const slugProp = Object.entries(props).find(([k]) => k.toLowerCase() === "slug");
    const slug = slugProp?.[1]?.rich_text?.map(t => t.plain_text).join("").trim() || "";
    const titleProp = Object.values(props).find(p => p.type === "title");
    const title = titleProp?.title?.map(t => t.plain_text).join("") || "";
    if (shortSlugsToDelete.has(slug) && !title) {
      toArchive.push({ id: page.id, slug });
    }
  }
  cursor = res.next_cursor ?? undefined;
  hasMore = Boolean(res.has_more && cursor);
}

console.log(`Found ${toArchive.length} duplicate pages to archive:`);
for (const p of toArchive) {
  console.log(`  ${p.slug} (${p.id})`);
}

if (toArchive.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

console.log("\nArchiving...");
let archived = 0;
let failed = 0;
for (const p of toArchive) {
  try {
    await notion.request({
      path: `pages/${p.id}`,
      method: "patch",
      body: { archived: true },
    });
    archived++;
    console.log(`[archived] ${p.slug}`);
  } catch (e) {
    failed++;
    console.error(`[fail] ${p.slug}: ${e.message}`);
  }
}

console.log(`\nArchived: ${archived}, Failed: ${failed}`);
