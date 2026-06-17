/**
 * Downloads the quantized all-MiniLM-L6-v2 model from HuggingFace
 * and uploads all files to Cloudflare R2 under the prefix "models/".
 *
 * Run once: npm run upload:model
 *
 * Model files (~6 MB total, quantized ONNX):
 *   models/all-MiniLM-L6-v2/onnx/model_quantized.onnx
 *   models/all-MiniLM-L6-v2/tokenizer.json
 *   models/all-MiniLM-L6-v2/tokenizer_config.json
 *   models/all-MiniLM-L6-v2/config.json
 *   models/all-MiniLM-L6-v2/special_tokens_map.json
 *   models/all-MiniLM-L6-v2/vocab.txt
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// --- Load .env ---------------------------------------------------------------
function forceEnv(fileName) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(fullPath)) return;
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("/")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
forceEnv(".env.local");

// --- R2 client ---------------------------------------------------------------
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const R2_PREFIX = "models/all-MiniLM-L6-v2";

// Files to download from HuggingFace Hub
const MODEL_FILES = [
  "onnx/model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
  "config.json",
  "special_tokens_map.json",
  "vocab.txt",
];

const HF_BASE = `https://huggingface.co/${MODEL_NAME}/resolve/main`;

async function fileExistsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

function contentTypeFor(filename) {
  if (filename.endsWith(".onnx")) return "application/octet-stream";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function main() {
  console.log(`Uploading model ${MODEL_NAME} to R2 bucket "${BUCKET}" under "${R2_PREFIX}/"\n`);

  for (const file of MODEL_FILES) {
    const r2Key = `${R2_PREFIX}/${file}`;
    const hfUrl = `${HF_BASE}/${file}`;

    const exists = await fileExistsInR2(r2Key);
    if (exists) {
      console.log(`  ✓ already in R2: ${r2Key}`);
      continue;
    }

    process.stdout.write(`  ↓ downloading ${file} ... `);
    const buffer = await downloadFile(hfUrl);
    process.stdout.write(`${(buffer.length / 1024).toFixed(0)} KB → uploading ... `);

    await uploadToR2(r2Key, buffer, contentTypeFor(file));
    console.log(`done (${r2Key})`);
  }

  console.log("\nAll model files are in R2.");
  console.log(`R2 prefix: ${R2_PREFIX}/`);
  console.log(`Set env var: MODEL_R2_PREFIX=${R2_PREFIX}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
