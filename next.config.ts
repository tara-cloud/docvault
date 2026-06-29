import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  // 110 MB limit for file uploads (route handlers + server actions)
  middlewareClientMaxBodySize: 110 * 1024 * 1024,
  experimental: {
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
