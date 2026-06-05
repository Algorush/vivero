import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import bundledMap from "../data/cloudflare-image-map.json";

const IMAGE_MAP_PATH = path.resolve(process.cwd(), "data", "cloudflare-image-map.json");
const IMAGE_MAP_KEY = "cloudflare-image-map.json";

export type ImageMapEntry = {
  cdn: string[];
  hashes: string[];
};

export type ImageMap = Record<string, ImageMapEntry>;

function getR2Client(): S3Client | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function readBodyToString(body: unknown): Promise<string> {
  if (!body) return "";

  if (typeof body === "string") {
    return body;
  }

  const readable = body as {
    transformToString?: () => Promise<string>;
    getReader?: () => unknown;
  };

  if (typeof readable.transformToString === "function") {
    return readable.transformToString();
  }

  return "";
}

export async function readImageMap(): Promise<ImageMap> {
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;

  if (client && bucket) {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: IMAGE_MAP_KEY })
      );

      const text = await readBodyToString(response.Body);
      if (text) {
        return JSON.parse(text) as ImageMap;
      }
    } catch {
      // fall through to local/bundled fallback
    }
  }

  if (existsSync(IMAGE_MAP_PATH)) {
    try {
      return JSON.parse(readFileSync(IMAGE_MAP_PATH, "utf-8")) as ImageMap;
    } catch {
      // fall through
    }
  }

  return bundledMap as ImageMap;
}

export async function writeImageMap(map: ImageMap): Promise<void> {
  const dir = path.dirname(IMAGE_MAP_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(IMAGE_MAP_PATH, JSON.stringify(map, null, 2));

  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;

  if (!client || !bucket) {
    return;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: IMAGE_MAP_KEY,
      Body: JSON.stringify(map, null, 2),
      ContentType: "application/json",
    })
  );
}
