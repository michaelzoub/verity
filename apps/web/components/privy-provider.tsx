"use client";

import { PrivyProvider } from "@privy-io/react-auth";

// next.config.ts exposes this browser-safe ID only when PRIVY_AUTH_ENABLED=true.
export const companyAuthEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function CompanyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  // Keeping preview/mock builds usable does not create an alternate auth path: protected actions require a token.
  if (!companyAuthEnabled || !appId) return <>{children}</>;
  return <PrivyProvider appId={appId}>{children}</PrivyProvider>;
}
