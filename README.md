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

Manually exercise: Privy login → local company account → private grader preflight → factory-funded escrow → confirmed indexer listing → verified payout-wallet submission → fresh E2B grade → exact threshold check → EIP-712 finalize and payout/no-payout → confirmed indexer projection → UI/API final state. Also exercise timeout/invalid no-payout and post-deadline refund paths, worker retries, duplicate callbacks, nonce replay, and indexer restart/idempotency. Record real transaction hashes, E2B sandbox IDs, and final Supabase rows without recording secrets.
