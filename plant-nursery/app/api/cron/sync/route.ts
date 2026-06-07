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
    const { main } = (await import(
      "../../../../scripts/sync-images-to-cloudflare.mjs" as string
    )) as { main: () => Promise<{ total: number; updated: number }> };

    const result = await main();
    revalidateTag(PLANTS_REVALIDATE_TAG, "max");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
