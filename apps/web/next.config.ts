import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

// Keep browser-facing local development configuration scoped to this app.
loadEnvConfig(fileURLToPath(new URL(".", import.meta.url)));
// Vercel injects these values at build time. Normalize the toggle because a
// trailing space or different casing should not silently disable the whole
// company publishing flow.
const companyAuthEnabled =
  (process.env.PRIVY_AUTH_ENABLED ?? process.env.NEXT_PUBLIC_PRIVY_AUTH_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
const privyAppId = (process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();
// Set the public values too: client components are also rendered by the dev server.
process.env.NEXT_PUBLIC_PRIVY_APP_ID = companyAuthEnabled ? privyAppId : "";
process.env.NEXT_PUBLIC_PRIVY_AUTH_ENABLED = companyAuthEnabled ? "true" : "false";

const nextConfig: NextConfig = {
  transpilePackages: ["@verity/domain"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // App IDs are public identifiers. Keep the server secret server-only.
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_PRIVY_AUTH_ENABLED: process.env.NEXT_PUBLIC_PRIVY_AUTH_ENABLED,
  },
  webpack: (config, { webpack }) => {
    // Privy's wallet stack pulls optional deps that are often incomplete in this monorepo.
    // Keep them out of the client graph unless company auth is explicitly enabled.
    if (!companyAuthEnabled) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(.*privy-provider-live.*|.*company-auth-live.*|@privy-io\/react-auth)$/,
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
