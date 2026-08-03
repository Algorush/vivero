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
  // Include data/ directory and the native onnxruntime-node binary in the
  // serverless function bundle on Vercel (Next's file tracer doesn't detect
  // it since onnxruntime-node loads it via a computed require() path).
  // Vercel's serverless functions run on Linux x64, so only that platform's
  // binary is needed - the package ships prebuilt binaries for every OS/arch
  // (win32, darwin, linux x64/arm64), and including all of them was bloating
  // every function (even unrelated ones like /_not-found, since they share
  // the root layout's trace) by ~185MB of binaries that can never run there.
  outputFileTracingIncludes: {
    "/": ["./data/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**/*"],
  },
};

export default nextConfig;
