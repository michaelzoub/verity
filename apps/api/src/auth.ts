import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { PrivyClient } from "@privy-io/server-auth";
import type { JsonFileStore } from "@verity/adapters";
import type { Company } from "@verity/domain";

export class AuthError extends Error { constructor(public readonly status: 401 | 403, public readonly code: string, message = code) { super(message); } }
const enabled = process.env.PRIVY_AUTH_ENABLED === "true";
const appId = process.env.PRIVY_APP_ID; const appSecret = process.env.PRIVY_APP_SECRET; const verificationKey = process.env.PRIVY_VERIFICATION_KEY;
if (enabled && (!appId || !appSecret || !verificationKey)) throw new Error("PRIVY_APP_ID, PRIVY_APP_SECRET, and PRIVY_VERIFICATION_KEY are required when PRIVY_AUTH_ENABLED=true");
const privy = enabled ? new PrivyClient(appId!, appSecret!) : undefined;
export type AuthenticatedCompany = { company: Company; privySubject: string };
export async function authenticateCompany(req: IncomingMessage, store: JsonFileStore, verify: (token: string) => Promise<{ userId: string }> = async token => {
  // A process-local test token exists only under NODE_ENV=test; all non-test traffic is verified by Privy.
  if (process.env.NODE_ENV === "test" && token === process.env.PRIVY_TEST_TOKEN) return { userId: "did:privy:e2e-company" };
  if (!enabled) throw new Error("company_auth_disabled"); return privy!.verifyAuthToken(token, verificationKey);
}) : Promise<AuthenticatedCompany> {
  const header = req.headers.authorization; if (!header?.startsWith("Bearer ")) throw new AuthError(401, "unauthorized", "missing_bearer_token"); const token = header.slice(7).trim(); if (!token) throw new AuthError(401, "unauthorized", "missing_bearer_token");
  try { const claims = await verify(token); const subject = claims.userId; let company = [...store.companies.values()].find(c => c.privySubject === subject); if (!company) { company = { id: randomUUID(), privySubject: subject, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await store.saveCompany(company); } return { company, privySubject: subject }; } catch { throw new AuthError(401, "unauthorized", "invalid_privy_token"); }
}
export const requireCompanyOwnership = (companyId: string, ownedBy: string) => { if (companyId !== ownedBy) throw new AuthError(403, "forbidden", "company_ownership_required"); };
