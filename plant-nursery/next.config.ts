import type { NextConfig } from "next";

const lan78Origins = Array.from({ length: 256 }, (_, octet) =>
  `192.168.${octet}.78`
);

const nextConfig: NextConfig = {
  // Dev convenience: allow all 192.168.x.78 LAN addresses.
  allowedDevOrigins: lan78Origins,
  serverExternalPackages: ["sharp"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
