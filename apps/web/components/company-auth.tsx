"use client";

import { companyAuthEnabled } from "@/components/privy-provider";

interface CompanyApi {
  authenticated: boolean;
  login: () => void;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
}

/**
 * Local stand-in when Privy is disabled (PRIVY_AUTH_ENABLED=false).
 * Lets companies exercise the challenge form in development without
 * APP_ID / APP_SECRET. Does not mint real ownership or settlement authority.
 */
function mockCompanyApi(): CompanyApi {
  return {
    authenticated: true,
    login: () => undefined,
    async request(_path, init = {}) {
      // Soft-succeed so the create-challenge UX can be walked locally.
      // Real persistence still requires the API + Privy when auth is enabled.
      if (typeof init.body === "string") {
        try {
          JSON.parse(init.body);
        } catch {
          throw new Error("Invalid challenge payload.");
        }
      }
      return { ok: true, mode: "mock" };
    },
  };
}

export function useCompanyApi(): CompanyApi {
  if (!companyAuthEnabled) return mockCompanyApi();

  // Lazy require keeps @privy-io out of marketplace/home compiles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLiveCompanyApi } = require("./company-auth-live") as typeof import("./company-auth-live");
  return useLiveCompanyApi();
}
