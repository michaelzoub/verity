const MAX_ERROR_TEXT = 800;

export function companyApiEndpoint(path: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    throw new Error(
      `API configuration error for ${path}: NEXT_PUBLIC_API_URL is required.`,
    );
  }
  const baseUrl = (configuredUrl.startsWith("http://") || configuredUrl.startsWith("https://")
    ? configuredUrl
    : `https://${configuredUrl}`).replace(/\/+$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeResponseDetail(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const detail = [body.error, body.message, body.code]
    .find((candidate) => typeof candidate === "string");
  return typeof detail === "string"
    ? detail.replace(/\s+/g, " ").slice(0, MAX_ERROR_TEXT)
    : undefined;
}

export async function companyApiError(
  response: Response,
  method: string,
  endpoint: string,
) {
  const body = await response.json().catch(() => undefined);
  const detail = safeResponseDetail(body) ?? (response.statusText || "request_failed");
  return new Error(
    `${method} ${endpoint} — HTTP ${response.status}: ${detail}`,
  );
}

export function companyApiNetworkError(
  cause: unknown,
  method: string,
  endpoint: string,
) {
  const detail = cause instanceof Error ? cause.message : "network request failed";
  return new Error(
    `${method} ${endpoint} — network error (no HTTP status): ${detail}. Check that the API is running and that NEXT_PUBLIC_API_URL, WEB_URL, protocol, host, and port match.`,
  );
}
