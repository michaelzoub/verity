"use client";

import type { ReactNode } from "react";

// Browser-safe flags come from next.config.ts. Privy is loaded only when configured;
// otherwise company mutations remain unavailable.
export const companyAuthEnabled =
  process.env.NEXT_PUBLIC_PRIVY_AUTH_ENABLED === "true" &&
  Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function CompanyAuthProvider({ children }: { children: ReactNode }) {
  if (!companyAuthEnabled) return <>{children}</>;

  // Lazy require keeps @privy-io out of the default client graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LiveCompanyAuthProvider } = require("./privy-provider-live") as typeof import("./privy-provider-live");
  return <LiveCompanyAuthProvider>{children}</LiveCompanyAuthProvider>;
}
