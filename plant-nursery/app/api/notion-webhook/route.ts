import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "@notionhq/client";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

import { PLANTS_REVALIDATE_TAG } from "@/lib/notion";
import { readImageMap, writeImageMap } from "@/lib/image-map";
import { plants } from "@/lib/db/schema";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

const db = process.env.NEON_DATABASE_URL
  ? drizzle(neon(process.env.NEON_DATABASE_URL), { schema: { plants } })
  : null;

// --- Helpers -----------------------------------------------------------------
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function textOf(items?: Array<{ plain_text?: string }>): string {
  return (items ?? []).map((i) => i?.plain_text ?? "").join("").trim();
}

async function fetchPage(pageId: string): Promise<{
  object: string;
  id: string;
  properties: {
    Slug?: { rich_text?: Array<{ plain_text?: string }> };
    Title?: { title?: Array<{ plain_text?: string }> };
    Description?: { rich_text?: Array<{ plain_text?: string }> };
    Flor?: { rich_text?: Array<{ plain_text?: string }> };
    Riego?: { rich_text?: Array<{ plain_text?: string }> };
    Suelo?: { rich_text?: Array<{ plain_text?: string }> };
    Florece?: { rich_text?: Array<{ plain_text?: string }> };
    Exposicion?: { rich_text?: Array<{ plain_text?: string }> };
    Fruta?: { rich_text?: Array<{ plain_text?: string }> };
    Tamano?: { rich_text?: Array<{ plain_text?: string }> };
    Utilizacion?: { rich_text?: Array<{ plain_text?: string }> };
    Propagacion?: { rich_text?: Array<{ plain_text?: string }> };
    Medicinal?: { rich_text?: Array<{ plain_text?: string }> };
    Category?: { select?: { name?: string } | null };
    Nativo?: { checkbox?: boolean };
    Price?: { number?: number | null };
    Amount?: { number?: number | null };
    Available?: { checkbox?: boolean };
    Image?: { files?: Array<{ file?: { url?: string }; external?: { url?: string } }> };
  };
} | null> {
  const page = await notion.request<{
    object: string;
    id: string;
    properties: {
      Slug?: { rich_text?: Array<{ plain_text?: string }> };
      Title?: { title?: Array<{ plain_text?: string }> };
      Description?: { rich_text?: Array<{ plain_text?: string }> };
      Flor?: { rich_text?: Array<{ plain_text?: string }> };
      Riego?: { rich_text?: Array<{ plain_text?: string }> };
      Suelo?: { rich_text?: Array<{ plain_text?: string }> };
      Florece?: { rich_text?: Array<{ plain_text?: string }> };
      Exposicion?: { rich_text?: Array<{ plain_text?: string }> };
      Fruta?: { rich_text?: Array<{ plain_text?: string }> };
      Tamano?: { rich_text?: Array<{ plain_text?: string }> };
      Utilizacion?: { rich_text?: Array<{ plain_text?: string }> };
      Propagacion?: { rich_text?: Array<{ plain_text?: string }> };
      Medicinal?: { rich_text?: Array<{ plain_text?: string }> };
      Category?: { select?: { name?: string } | null };
      Nativo?: { checkbox?: boolean };
      Price?: { number?: number | null };
      Amount?: { number?: number | null };
      Available?: { checkbox?: boolean };
      Image?: { files?: Array<{ file?: { url?: string }; external?: { url?: string } }> };
    };
  }>({ path: `pages/${pageId}`, method: "get" });

  return page.object === "page" ? page : null;
}

function mapPageToPlant(
  page: NonNullable<Awaited<ReturnType<typeof fetchPage>>>,
  imageMap: Record<string, { cdn?: string[] }>
) {
  const slug =
    slugify(textOf(page.properties?.Slug?.rich_text)) ||
    slugify(textOf(page.properties?.Title?.title)) ||
    page.id;

  return {
    id: page.id,
    slug,
    name: textOf(page.properties?.Title?.title),
    description: textOf(page.properties?.Description?.rich_text),
    flor: textOf(page.properties?.Flor?.rich_text),
    riego: textOf(page.properties?.Riego?.rich_text),
    suelo: textOf(page.properties?.Suelo?.rich_text),
    florece: textOf(page.properties?.Florece?.rich_text),
    exposicion: textOf(page.properties?.Exposicion?.rich_text),
    fruta: textOf(page.properties?.Fruta?.rich_text),
    tamano: textOf(page.properties?.Tamano?.rich_text),
    utilizacion: textOf(page.properties?.Utilizacion?.rich_text),
    propagacion: textOf(page.properties?.Propagacion?.rich_text),
    medicinal: textOf(page.properties?.Medicinal?.rich_text),
    category: page.properties?.Category?.select?.name || "",
    nativo: page.properties?.Nativo?.checkbox ?? false,
    price: page.properties?.Price?.number || 0,
    amount: page.properties?.Amount?.number || 0,
    available: page.properties?.Available?.checkbox ?? false,
    images: imageMap[slug]?.cdn?.length ? imageMap[slug].cdn : [],
    syncedAt: new Date(),
  };
}

async function upsertPlant(pageId: string): Promise<void> {
  if (!db) {
    return;
  }

  await db.execute(sql`
    ALTER TABLE plants ADD COLUMN IF NOT EXISTS utilizacion TEXT NOT NULL DEFAULT ''
  `);
  await db.execute(sql`
    ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagacion TEXT NOT NULL DEFAULT ''
  `);
  await db.execute(sql`
    ALTER TABLE plants ADD COLUMN IF NOT EXISTS medicinal TEXT NOT NULL DEFAULT ''
  `);

  const page = await fetchPage(pageId);
  if (!page) {
    return;
  }

  const imageMap = await readImageMap();
  const plantData = mapPageToPlant(page, imageMap);

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
        utilizacion: plantData.utilizacion,
        propagacion: plantData.propagacion,
        medicinal: plantData.medicinal,
        category: plantData.category,
        nativo: plantData.nativo,
        price: plantData.price,
        amount: plantData.amount,
        available: plantData.available,
        images: plantData.images,
        syncedAt: plantData.syncedAt,
      },
    });
}

function stableHash(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedFull = `sha256=${expected}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedFull));
  } catch {
    return false;
  }
}

// --- Image sync for one page -------------------------------------------------
async function syncPageImages(pageId: string): Promise<void> {
  // Dynamic import so this heavy code only runs in the webhook handler.
  const { uploadImageFromUrl } = await import(
    "../../../scripts/upload-to-cloudinary.mjs" as string
  ) as { uploadImageFromUrl: (url: string, id: string) => Promise<string> };

  const page = await notion.request<{
    object: string;
    properties: {
      Slug?: { rich_text?: Array<{ plain_text?: string }> };
      Title?: { title?: Array<{ plain_text?: string }> };
      Image?: { files?: Array<{ file?: { url?: string }; external?: { url?: string } }> };
    };
  }>({ path: `pages/${pageId}`, method: "get" });

  if (page.object !== "page") return;

  const slug =
    slugify(textOf(page.properties?.Slug?.rich_text)) ||
    slugify(textOf(page.properties?.Title?.title)) ||
    pageId;

  const notionUrls = (page.properties?.Image?.files ?? [])
    .map((f) => f?.file?.url ?? f?.external?.url ?? "")
    .filter(Boolean);

  if (notionUrls.length === 0) return;

  const map = await readImageMap();
  const existing = map[slug] ?? { cdn: [], hashes: [] };
  const newCdn: string[] = [];
  const newHashes: string[] = [];

  for (let i = 0; i < notionUrls.length; i++) {
    const url = notionUrls[i];
    const hash = stableHash(url);
    const cfId = `plant-${slug}-${i + 1}`;

    if (existing.hashes[i] === hash && existing.cdn[i]) {
      newCdn.push(existing.cdn[i]);
      newHashes.push(hash);
    } else {
      try {
        const cdnUrl = await uploadImageFromUrl(url, cfId);
        newCdn.push(cdnUrl);
        newHashes.push(hash);
      } catch (err) {
        console.error(`[notion-webhook] Failed to upload ${cfId}:`, err);
        if (existing.cdn[i]) {
          newCdn.push(existing.cdn[i]);
          newHashes.push(existing.hashes[i] ?? "");
        }
      }
    }
  }

  map[slug] = { cdn: newCdn, hashes: newHashes };
  await writeImageMap(map);
}

// --- Route handler -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-notion-signature") ?? "";

  let payload: { type?: string; entity?: { id?: string }; verification_token?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload?.verification_token) {
    console.log("[notion-webhook] verification token", payload.verification_token);
    return NextResponse.json({ ok: true });
  }

  const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "NOTION_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  if (process.env.DEBUG_NOTION_WEBHOOK === "1") {
    console.log("[notion-webhook] incoming request", {
      signature,
      contentType: request.headers.get("content-type") ?? "",
      rawBody,
    });
  }

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const pageId = payload?.entity?.id;
  const eventType = payload?.type ?? "";
  if (process.env.DEBUG_NOTION_WEBHOOK === "1") {
    console.log("[notion-webhook] parsed payload", { eventType, pageId });
  }

  if (
    pageId &&
    (
      eventType === "page.created" ||
      eventType === "page.content_updated" ||
      eventType === "page.properties_updated"
    )
  ) {
    try {
      await syncPageImages(pageId);
      await upsertPlant(pageId);
      revalidateTag(PLANTS_REVALIDATE_TAG, "max");
      console.log(`[notion-webhook] Synced page ${pageId}, cache revalidated.`);
    } catch (err) {
      console.error("[notion-webhook] Sync error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
