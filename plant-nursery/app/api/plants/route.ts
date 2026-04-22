import { NextRequest, NextResponse } from "next/server";

import { getPlantsPage } from "@/lib/notion";

function parsePageSize(rawValue: string | null | undefined): number {
  const rawPageSize = Number(rawValue ?? "12");
  return Number.isFinite(rawPageSize)
    ? Math.min(Math.max(rawPageSize, 1), 50)
    : 12;
}

async function resolvePage(params: {
  category?: string;
  cursor?: string;
  query?: string;
  pageSize?: number;
}) {
  const page = await getPlantsPage({
    category: params.category,
    cursor: params.cursor,
    query: params.query,
    pageSize: params.pageSize,
  });

  return NextResponse.json(page);
}

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category") ?? undefined;
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const query = request.nextUrl.searchParams.get("q") ?? undefined;

    const pageSize = parsePageSize(
      request.nextUrl.searchParams.get("pageSize")
    );

    return resolvePage({
      category,
      cursor,
      query,
      pageSize,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch plants" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      category?: string;
      cursor?: string;
      query?: string;
      pageSize?: number;
    };

    return resolvePage({
      category: body.category,
      cursor: body.cursor,
      query: body.query,
      pageSize: parsePageSize(String(body.pageSize ?? "12")),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch plants" },
      { status: 500 }
    );
  }
}
