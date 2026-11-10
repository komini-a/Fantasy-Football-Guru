import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep learning documentation in the local tutorials folder.
  agentRules: false,
  turbopack: { root: __dirname },
};

export default nextConfig;
