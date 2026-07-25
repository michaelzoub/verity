"use client";

import { companyAuthEnabled } from "@/components/privy-provider";

interface CompanyApi {
  authenticated: boolean;
  login: () => void;
  walletAddress: string;
  connectWallet: () => void;
  getWalletProvider: () => Promise<{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  }>;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
}

const unavailableCompanyApi: CompanyApi = {
  authenticated: false,
  login: () => undefined,
  walletAddress: "",
  connectWallet: () => undefined,
  async getWalletProvider() {
    throw new Error("Privy company authentication is not configured.");
  },
  async request() {
    throw new Error("Privy company authentication is not configured.");
  },
};

export function useCompanyApi(): CompanyApi {
  if (!companyAuthEnabled) return unavailableCompanyApi;

  // Lazy require keeps @privy-io out of marketplace/home compiles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLiveCompanyApi } = require("./company-auth-live") as typeof import("./company-auth-live");
  return useLiveCompanyApi();
}
