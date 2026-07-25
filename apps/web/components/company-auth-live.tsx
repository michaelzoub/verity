"use client";

import { usePrivy } from "@privy-io/react-auth";

export function useLiveCompanyApi() {
  const { authenticated, getAccessToken, login } = usePrivy();
  return {
    authenticated,
    login,
    async request(path: string, init: RequestInit = {}) {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in with Privy before managing company challenges.");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Content-Type", "application/json");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}${path}`,
        { ...init, headers },
      );
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => ({ error: "request_failed" }))).error ??
            "request_failed",
        );
      }
      return response.json();
    },
  };
}
