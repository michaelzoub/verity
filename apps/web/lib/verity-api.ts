import { createVerityClient } from "@verity/sdk";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL!;
if (!apiBaseUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
export const publicApi = createVerityClient(apiBaseUrl);
