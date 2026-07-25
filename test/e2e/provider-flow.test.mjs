import test from "node:test";
import assert from "node:assert/strict";

test("provider-backed golden path is explicitly gated by real credentials", async (t) => {
  if (process.env.VERITY_RUN_PROVIDER_E2E !== "true") {
    t.skip("set VERITY_RUN_PROVIDER_E2E=true with real Supabase, Privy, E2B, and Monad Testnet credentials");
    return;
  }
  const required = [
    "WEB_URL", "API_URL", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "PRIVY_APP_ID", "PRIVY_APP_SECRET", "E2B_API_KEY", "RPC_URL", "CHAIN_ID",
    "CHALLENGE_FACTORY_ADDRESS", "SETTLEMENT_SIGNER_ADDRESS", "SETTLEMENT_PRIVATE_KEY",
  ];
  assert.deepEqual(required.filter((key) => !process.env[key]), []);
  assert.equal(Number(process.env.CHAIN_ID), 10143);
  const health = await fetch(`${process.env.API_URL}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, "real");
  // Privy login and wallet signatures require an interactive browser and are recorded in the
  // manual verification artifact; this gate deliberately has no test-token or auth bypass.
});
