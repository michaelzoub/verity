import { createVerityClient } from "@verity/sdk";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
if (!configuredApiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
export const apiBaseUrl = configuredApiUrl.startsWith("http://") || configuredApiUrl.startsWith("https://")
  ? configuredApiUrl
  : `https://${configuredApiUrl}`;
export const publicApi = createVerityClient(apiBaseUrl);
