# Verity

Monad Testnet proof-of-completion marketplace. The normative provider-backed flows are in [docs/architecture/README.md](docs/architecture/README.md).

## Provider-backed development

There is one development and production-capable path: Supabase Postgres/Storage, Privy company authentication, fresh E2B sandboxes, Monad Testnet, per-challenge escrows, and the shared worker/indexer. Anvil, JSON persistence, filesystem object storage, disabled authentication, fixture pages, and host-process grading are not supported.

Copy `.env.example` to `.env` and supply every value. Create the four private Supabase buckets, then run:

```bash
npm install
npm run db:migrate
npm run generate
npm run typecheck
npm test
npm run test:contracts
npm run artifacts:check
npm run services:check
```

## Factory deployment

Use a funded Monad Testnet deployment account held in a Foundry keystore; do not put its private key in the repository. Set its non-secret keystore alias as `DEPLOYER_ACCOUNT`. The settlement signer is a separate credential configured as `SETTLEMENT_PRIVATE_KEY`; its public address is derived at runtime.

```bash
npm run contracts:build
npm run contracts:deploy:monad-testnet
```

Set `CHALLENGE_FACTORY_ADDRESS` and `CONTRACT_DEPLOYMENT_BLOCK` from the receipt, then verify source and deployment:

```bash
npm run contracts:verify:source
npm run contracts:verify:deployment
npm run services:check
```

The source-verification command follows the [official Monad Foundry verification flow](https://docs.monad.xyz/guides/verify-smart-contract/foundry).

## Run and verify the golden path

```bash
npm run dev:api
npm run dev:worker
npm run dev:indexer
npm run dev:web
```

For the automated real-provider path, supply a short-lived real Privy company access token and two funded Monad Testnet test accounts outside the repository:

```bash
VERITY_RUN_PROVIDER_E2E=true \
E2E_PRIVY_ACCESS_TOKEN=... \
E2E_COMPANY_PRIVATE_KEY=... \
E2E_SOLVER_PRIVATE_KEY=... \
node --env-file=.env --test test/e2e/provider-flow.test.mjs
```

The test executes company sign-in → private grader preflight → factory funding → confirmed index discovery → wallet-required real source-file submission → fresh E2B grading → failing/no-payout, timeout, grader-error, duplicate/replay negatives → EIP-712 settlement → verified-wallet payout → confirmed frontend/API state. It never creates test auth bypasses or records tokens, private keys, grader feedback, sandbox IDs, private logs, or storage paths.
