import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // MUST be under experimental — this is what next-server.js reads:
    // this.nextConfig.experimental.middlewareClientMaxBodySize
    middlewareClientMaxBodySize: 110 * 1024 * 1024,
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
