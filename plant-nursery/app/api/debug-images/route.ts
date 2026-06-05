import { NextResponse } from "next/server";
import { readImageMap } from "@/lib/image-map";

export const dynamic = "force-dynamic";

export async function GET() {
  const map = await readImageMap();
  const keys = Object.keys(map);
  const sample = keys.slice(0, 3).reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = map[k];
    return acc;
  }, {});

  return NextResponse.json({
    totalKeys: keys.length,
    sample,
    cwd: process.cwd(),
  });
}
