import test from "node:test";
import assert from "node:assert/strict";
import { AuthError, authenticateCompany, requireCompanyOwnership } from "./auth";
import { MemoryStore } from "@verity/adapters";
const request = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as never;
test("missing, malformed, expired, wrong-app, and invalid-signature tokens are stable 401s", async () => {
  for (const auth of [undefined, "Basic token", "Bearer ", "Bearer expired", "Bearer wrong-app", "Bearer invalid-signature"]) { await assert.rejects(() => authenticateCompany(request(auth), new MemoryStore() as never, async token => { if (token !== "valid") throw new Error("invalid"); return { userId: "did:privy:test" }; }), (e: AuthError) => e.status === 401 && e.code === "unauthorized"); }
});
test("valid token resolves and persists the local company", async () => { const store = new MemoryStore(); const auth = await authenticateCompany(request("Bearer valid"), store as never, async () => ({ userId: "did:privy:company" })); assert.equal(auth.privySubject, "did:privy:company"); assert.equal(store.companies.size, 1); });
test("ownership rejects spoofed requester/company IDs", () => { assert.throws(() => requireCompanyOwnership("company-a", "company-b"), (e: AuthError) => e.status === 403 && e.code === "forbidden"); });
