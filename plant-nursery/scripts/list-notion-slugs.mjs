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

let cursor;
let hasMore = true;
const all = [];

while (hasMore) {
  const body = { page_size: 100 };
  if (cursor) body.start_cursor = cursor;
  const res = await notion.request({ path: `databases/${dbId}/query`, method: "post", body });
  for (const page of res.results ?? []) {
    const props = page.properties;
    const titleProp = Object.values(props).find(p => p.type === "title");
    const title = titleProp?.title?.map(t => t.plain_text).join("") || "";
    const slugProp = Object.entries(props).find(([k]) => k.toLowerCase() === "slug");
    const slug = slugProp?.[1]?.rich_text?.map(t => t.plain_text).join("").trim() || "";
    all.push({ id: page.id, slug, title });
  }
  cursor = res.next_cursor ?? undefined;
  hasMore = Boolean(res.has_more && cursor);
}

console.log(`Total pages: ${all.length}`);
console.log("\n--- Pages with slugs ---");
for (const p of all.filter(x => x.slug)) {
  console.log(`${p.slug} | ${p.title}`);
}
console.log("\n--- Pages WITHOUT slugs (likely bad imports) ---");
console.log(`Count: ${all.filter(x => !x.slug).length}`);
for (const p of all.filter(x => !x.slug)) {
  console.log(`id: ${p.id} | title: "${p.title}"`);
}
