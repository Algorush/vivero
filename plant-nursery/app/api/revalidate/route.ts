import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { PLANTS_REVALIDATE_TAG } from "@/lib/notion";

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.REVALIDATE_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET is not configured" },
      { status: 500 }
    );
  }

  const headerSecret = request.headers.get("x-revalidate-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const body = await request.json().catch(() => ({}));
  const bodySecret =
    typeof body?.secret === "string" ? body.secret : "";

  const providedSecret = headerSecret || querySecret || bodySecret;

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  revalidateTag(PLANTS_REVALIDATE_TAG, "max");

  return NextResponse.json({ revalidated: true, tag: PLANTS_REVALIDATE_TAG });
}
