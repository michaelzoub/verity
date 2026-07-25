import assert from "node:assert/strict";
import test from "node:test";
import {
  companyApiEndpoint,
  companyApiError,
  companyApiNetworkError,
} from "./company-api-error";

test("builds endpoints without duplicate slashes", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:4000/";
  assert.equal(
    companyApiEndpoint("/api/graders/preflight"),
    "http://127.0.0.1:4000/api/graders/preflight",
  );
  process.env.NEXT_PUBLIC_API_URL = previous;
});

test("reports endpoint, HTTP status, and safe backend error", async () => {
  const error = await companyApiError(
    new Response(JSON.stringify({ error: "invalid_request", secret: "hidden" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
    "POST",
    "http://127.0.0.1:4000/api/graders/preflight",
  );
  assert.match(
    error.message,
    /POST http:\/\/127\.0\.0\.1:4000\/api\/graders\/preflight — HTTP 400: invalid_request/,
  );
  assert.doesNotMatch(error.message, /hidden/);
});

test("reports network failures without inventing an HTTP status", () => {
  const error = companyApiNetworkError(
    new TypeError("Failed to fetch"),
    "POST",
    "http://127.0.0.1:4000/api/graders/preflight",
  );
  assert.match(error.message, /network error \(no HTTP status\): Failed to fetch/);
});
