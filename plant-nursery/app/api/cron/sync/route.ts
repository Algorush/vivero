import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { PLANTS_REVALIDATE_TAG } from "@/lib/notion";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Sync images to R2
    const { main: syncImages } = (await import(
      "../../../../scripts/sync-images-to-cloudflare.mjs" as string
    )) as { main: () => Promise<{ total: number; updated: number }> };
    const imageResult = await syncImages();

    // 2. Sync plants to Postgres (if NEON_DATABASE_URL configured)
    let dbResult: { total: number; upserted: number; embeddingsGenerated: number } | null = null;
    if (process.env.NEON_DATABASE_URL) {
      const { main: syncDb } = (await import(
        "../../../../scripts/sync-db.mjs" as string
      )) as { main: () => Promise<{ total: number; upserted: number; embeddingsGenerated: number }> };
      dbResult = await syncDb();
    }

    revalidateTag(PLANTS_REVALIDATE_TAG, "max");
    return NextResponse.json({ ok: true, images: imageResult, db: dbResult });
  } catch (err) {
    console.error("[cron/sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

