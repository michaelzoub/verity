import createClient from "openapi-fetch";
import type { paths, components } from "./generated";

export type Challenge = components["schemas"]["Challenge"];
export type Submission = components["schemas"]["Submission"];

export function createVerityClient(baseUrl: string, getAccessToken?: () => Promise<string | null>) {
  return createClient<paths>({
    baseUrl,
    fetch: async (request) => {
      if (getAccessToken) {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy authentication required");
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      const response = await fetch(request);
      if (!response.ok) {
        const body = await response.clone().json().catch(() => ({ error: `request_${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `request_${response.status}`);
      }
      return response;
    },
  });
}

export type { paths, components } from "./generated";
