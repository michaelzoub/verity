"use client";

import { useCallback, useMemo } from "react";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import {
  companyApiEndpoint,
  companyApiError,
  companyApiNetworkError,
} from "@/lib/company-api-error";

export function useLiveCompanyApi() {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const wallet = wallets[0];
  const getWalletProvider = useCallback(async () => {
    if (!authenticated) throw new Error("Sign in with Privy before connecting a funding wallet.");
    if (!wallet) throw new Error("Connect a wallet through Privy before continuing.");
    await wallet.switchChain(10143);
    return wallet.getEthereumProvider();
  }, [authenticated, wallet]);
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
      const endpoint = companyApiEndpoint(path);
      const method = init.method?.toUpperCase() ?? "GET";
      const token = await getAccessToken();
      if (!token) {
        throw new Error(
          `${method} ${endpoint} — authentication error (no HTTP status): Privy did not return an access token. Sign in again.`,
        );
      }
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Content-Type", "application/json");
      let response: Response;
      try {
        response = await fetch(endpoint, { ...init, headers });
      } catch (cause) {
        throw companyApiNetworkError(cause, method, endpoint);
      }
      if (!response.ok) {
        throw await companyApiError(response, method, endpoint);
      }
      return response.json();
  }, [getAccessToken]);
  return useMemo(() => ({
    authenticated,
    login,
    request,
    walletAddress: wallet?.address ?? "",
    connectWallet,
    getWalletProvider,
  }), [authenticated, connectWallet, getWalletProvider, login, request, wallet?.address]);
}
