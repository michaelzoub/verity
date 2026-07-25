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
    const provider = await wallet.getEthereumProvider();
    // Use the EIP-3326 provider method instead of Privy's wallet helper. The
    // helper emits `Unsupported chainId` for custom chains even when the chain
    // is present in Privy's supportedChains configuration.
    const chainId = await provider.request({ method: "eth_chainId" });
    if (String(chainId).toLowerCase() !== "0x279f") {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x279f" }],
      });
    }
    const confirmedChainId = await provider.request({ method: "eth_chainId" });
    if (String(confirmedChainId).toLowerCase() !== "0x279f") {
      throw new Error("Funding wallet is not connected to Monad Testnet (chain 10143).");
    }
    return provider;
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
