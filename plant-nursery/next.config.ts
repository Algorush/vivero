import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev convenience: allow all 192.168.x.78 LAN addresses.
  allowedDevOrigins: ["192.168.71.78"],
  serverExternalPackages: ["sharp"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
