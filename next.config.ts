import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Allow large file uploads (50 MB) via native Request.formData()
    serverActions: { bodySizeLimit: "52mb" },
  },
};

export default nextConfig;
