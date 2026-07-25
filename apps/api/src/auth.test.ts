import test from "node:test";
import assert from "node:assert/strict";
import { AuthError, authenticateCompany, requireCompanyOwnership } from "./auth";
const request = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as never;
const store = () => ({ companies: new Map(), async saveCompany(company: any) { this.companies.set(company.id, company); } });
test("missing, malformed, expired, wrong-app, and invalid-signature tokens are stable 401s", async () => {
  for (const auth of [undefined, "Basic token", "Bearer ", "Bearer expired", "Bearer wrong-app", "Bearer invalid-signature"]) { await assert.rejects(() => authenticateCompany(request(auth), store() as never, async token => { if (token !== "valid") throw new Error("invalid"); return { userId: "did:privy:test" }; }), (e: AuthError) => e.status === 401 && e.code === "unauthorized"); }
});
test("valid token resolves and persists the local company", async () => { const database = store(); const auth = await authenticateCompany(request("Bearer valid"), database as never, async () => ({ userId: "did:privy:company" })); assert.equal(auth.privySubject, "did:privy:company"); assert.equal(database.companies.size, 1); });
test("ownership rejects spoofed requester/company IDs", () => { assert.throws(() => requireCompanyOwnership("company-a", "company-b"), (e: AuthError) => e.status === 403 && e.code === "forbidden"); });
