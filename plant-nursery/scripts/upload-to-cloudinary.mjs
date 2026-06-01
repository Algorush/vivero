// Cloudflare R2 upload utilities for Node.js scripts.
//
// Required env vars:
//   CLOUDFLARE_ACCOUNT_ID         — your Cloudflare account ID
//   CLOUDFLARE_R2_ACCESS_KEY_ID   — R2 access key (Manage R2 API Tokens)
//   CLOUDFLARE_R2_SECRET_ACCESS_KEY
//   CLOUDFLARE_R2_BUCKET          — bucket name (e.g. "vivero-images")
//   CLOUDFLARE_R2_PUBLIC_URL      — public base URL (e.g. https://pub-xxx.r2.dev)

import fs from "node:fs/promises";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const ONE_MB = 1024 * 1024;
const MAX_WIDTH = 1500;

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID or CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket() {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) throw new Error("Missing CLOUDFLARE_R2_BUCKET");
  return bucket;
}

function getPublicUrl(key) {
  const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("Missing CLOUDFLARE_R2_PUBLIC_URL");
  return `${base}/${key}`;
}

async function optimizeToJpg(bytes) {
  const quality = bytes.length > ONE_MB ? 70 : 82;
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true, fit: "inside" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Uploads an already-optimized local file to R2.
 * Does NOT re-optimize — use this for files already processed by sharp.
 *
 * @param {string} localPath - Absolute path to the local image file.
 * @param {string} customId  - Object key prefix (e.g. "plant-ficus-1").
 * @returns {Promise<string>} Public CDN URL of the uploaded image.
 */
export async function uploadLocalFile(localPath, customId) {
  const key = `${customId}.jpg`;
  const body = await fs.readFile(localPath);

  await getR2Client().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: "image/jpeg" })
  );

  return getPublicUrl(key);
}

/**
 * Downloads an image from a URL, optimizes it with sharp,
 * uploads to R2 and returns the public CDN URL.
 *
 * @param {string} imageUrl - Source image URL (e.g. Notion signed URL).
 * @param {string} customId - Object key prefix (e.g. "plant-ficus-1").
 * @returns {Promise<string>} Public CDN URL of the uploaded image.
 */
export async function uploadImageFromUrl(imageUrl, customId) {
  const key = `${customId}.jpg`;
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${imageUrl}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const optimized = await optimizeToJpg(bytes);

  await getR2Client().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: optimized, ContentType: "image/jpeg" })
  );

  return getPublicUrl(key);
}
