import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@verity/domain", "@verity/fixtures"], outputFileTracingRoot: new URL("../../", import.meta.url).pathname };
export default nextConfig;
