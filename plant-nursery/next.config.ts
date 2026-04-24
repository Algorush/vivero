import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.107.78"],
  serverExternalPackages: ["sharp"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
