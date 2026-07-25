import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { PrivyClient } from "@privy-io/server-auth";
import type { Company } from "@verity/domain";

export class AuthError extends Error { constructor(public readonly status: 401 | 403, public readonly code: string, message = code) { super(message); } }
const appId = process.env.PRIVY_APP_ID; const appSecret = process.env.PRIVY_APP_SECRET;
if (!appId || !appSecret) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required");
const privy = new PrivyClient(appId, appSecret);
export type AuthenticatedCompany = { company: Company; privySubject: string };
type CompanyStore = { companies: Map<string, Company>; saveCompany(company: Company): Promise<void>; findOrCreateCompany?(company: Company): Promise<Company> };
export async function authenticateCompany(req: IncomingMessage, store: CompanyStore, verify: (token: string) => Promise<{ userId: string }> = async token => {
  return privy.verifyAuthToken(token);
}) : Promise<AuthenticatedCompany> {
  const header = req.headers.authorization; if (!header?.startsWith("Bearer ")) throw new AuthError(401, "unauthorized", "missing_bearer_token"); const token = header.slice(7).trim(); if (!token) throw new AuthError(401, "unauthorized", "missing_bearer_token");
  let claims: { userId: string };
  try { claims = await verify(token); } catch { throw new AuthError(401, "unauthorized", "invalid_privy_token"); }
  const subject = claims.userId;
  let company = [...store.companies.values()].find(c => c.privySubject === subject);
  if (!company) {
    const candidate = { id: randomUUID(), privySubject: subject, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    company = store.findOrCreateCompany ? await store.findOrCreateCompany(candidate) : candidate;
    if (!store.findOrCreateCompany) await store.saveCompany(company);
  }
  return { company, privySubject: subject };
}
export const requireCompanyOwnership = (companyId: string, ownedBy: string) => { if (companyId !== ownedBy) throw new AuthError(403, "forbidden", "company_ownership_required"); };
