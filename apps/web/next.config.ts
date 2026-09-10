import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
const environmentFile = resolve(process.cwd(), "../../.env");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);
const config: NextConfig = {
  // Give the API time to return its controlled error if Gemini reaches its deadline.
  experimental: { proxyTimeout: 75000 },
  watchOptions: { pollIntervalMs: 1000 },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/:path*`,
      },
    ];
  },
};
export default config;
