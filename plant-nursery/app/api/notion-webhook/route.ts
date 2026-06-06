import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "@notionhq/client";

import { PLANTS_REVALIDATE_TAG } from "@/lib/notion";
import { readImageMap, writeImageMap } from "@/lib/image-map";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

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
  const signature = request.headers.get("notion-signature") ?? "";

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
      revalidateTag(PLANTS_REVALIDATE_TAG, "max");
      console.log(`[notion-webhook] Synced page ${pageId}, cache revalidated.`);
    } catch (err) {
      console.error("[notion-webhook] Sync error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
