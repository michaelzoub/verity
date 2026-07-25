"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

export function LiveCompanyAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return <PrivyProvider appId={appId}>{children}</PrivyProvider>;
}
