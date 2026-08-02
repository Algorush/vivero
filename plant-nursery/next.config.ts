import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Dev convenience: allow all 192.168.x.78 LAN addresses.
  allowedDevOrigins: ["192.168.71.78"],
  serverExternalPackages: [
    "sharp",
    "drizzle-orm",
    "@neondatabase/serverless",
    "@aws-sdk/client-s3",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  images: {
    unoptimized: true,
  },
  // Include data/ directory and the native onnxruntime-node binaries in the
  // serverless function bundle on Vercel (Next's file tracer doesn't detect
  // these since onnxruntime-node loads them via a computed require() path).
  outputFileTracingIncludes: {
    "/": ["./data/**/*", "./node_modules/onnxruntime-node/bin/**/*"],
  },
};

export default nextConfig;
