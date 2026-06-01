import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const IMAGE_MAP_PATH = path.resolve(process.cwd(), "data", "cloudflare-image-map.json");

export type ImageMapEntry = {
  cdn: string[];
  hashes: string[];
};

export type ImageMap = Record<string, ImageMapEntry>;

export function readImageMap(): ImageMap {
  if (!existsSync(IMAGE_MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(IMAGE_MAP_PATH, "utf-8")) as ImageMap;
  } catch {
    return {};
  }
}

export function writeImageMap(map: ImageMap): void {
  const dir = path.dirname(IMAGE_MAP_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(IMAGE_MAP_PATH, JSON.stringify(map, null, 2));
}
