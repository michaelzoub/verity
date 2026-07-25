import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { Sandbox } from "e2b";
import { createPublicClient, defineChain, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const required = ["WEB_URL","API_URL","NEXT_PUBLIC_API_URL","DATABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_GRADERS_BUCKET","SUPABASE_SUBMISSIONS_BUCKET","SUPABASE_ARTIFACTS_BUCKET","SUPABASE_GRADER_LOGS_BUCKET","PRIVY_APP_ID","PRIVY_APP_SECRET","NEXT_PUBLIC_PRIVY_APP_ID","E2B_API_KEY","E2B_TEMPLATE_TS","E2B_TEMPLATE_JS","E2B_TEMPLATE_PYTHON","GRADER_TIMEOUT_MS","GRADER_MEMORY_MB","GRADER_MAX_OUTPUT_BYTES","RPC_URL","CHAIN_ID","CHALLENGE_FACTORY_ADDRESS","CONTRACT_DEPLOYMENT_BLOCK","SETTLEMENT_PRIVATE_KEY","WORKER_URL","WORKER_SHARED_SECRET","PLATFORM_RUNTIME_SHARED_SECRET","INDEXER_CONFIRMATIONS","INDEXER_INTERVAL_MS"];
const missing = required.filter(k => !process.env[k]); if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);
if (Number(process.env.CHAIN_ID) !== 10143) throw new Error("CHAIN_ID must be Monad Testnet 10143");
for (const id of [process.env.E2B_TEMPLATE_TS, process.env.E2B_TEMPLATE_JS, process.env.E2B_TEMPLATE_PYTHON]) {
  const sandbox = await Sandbox.create(id, { timeoutMs: 30_000, allowInternetAccess: false });
  await sandbox.kill();
}
for (const path of ["artifacts/openapi/openapi.json", "artifacts/contracts/ChallengeEscrow.json", "artifacts/contracts/ChallengeFactory.json"]) await readFile(path);
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" }); await sql`select 1 from verity_records limit 1`; await sql.end();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }); const { data: buckets, error } = await supabase.storage.listBuckets(); if (error) throw error; for (const bucket of [process.env.SUPABASE_GRADERS_BUCKET,process.env.SUPABASE_SUBMISSIONS_BUCKET,process.env.SUPABASE_ARTIFACTS_BUCKET,process.env.SUPABASE_GRADER_LOGS_BUCKET]) { const found = buckets.find(x => x.name === bucket); if (!found || found.public) throw new Error(`bucket ${bucket} must exist and be private`); }
if (!isAddress(process.env.CHALLENGE_FACTORY_ADDRESS)) throw new Error("invalid factory address");
privateKeyToAccount(process.env.SETTLEMENT_PRIVATE_KEY);
const chain = defineChain({ id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [process.env.RPC_URL] } } });
const client = createPublicClient({ chain, transport: http(process.env.RPC_URL) });
if (await client.getChainId() !== 10143) throw new Error("RPC chain id mismatch");
if (!await client.getBytecode({ address: process.env.CHALLENGE_FACTORY_ADDRESS })) throw new Error("factory bytecode missing");
await client.getBlock({ blockNumber: BigInt(process.env.CONTRACT_DEPLOYMENT_BLOCK) });
console.log("services:check passed: Supabase, private buckets, three fresh E2B templates, Monad Testnet factory, settlement identity, migrations, and generated artifacts are valid");
