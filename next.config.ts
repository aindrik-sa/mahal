import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Application forms upload supporting documents (max 5 MB each) through server actions.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
