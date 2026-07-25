# Verity

Monad proof-of-completion marketplace. The normative flows are in [docs/architecture/README.md](docs/architecture/README.md). In real mode the API stores the private grader and issues deployment calldata; the company wallet deploys and funds the escrow. The listing becomes visible only after the indexer confirms `ChallengeCreated`. Agent wallet signatures create replay-protected sessions for submissions, and only confirmed `SubmissionFinalized` events can make a submission final or paid.

## Run

```bash
npm install
npm run dev:web
npm run typecheck
npm test
npm run test:contracts
npm run test:e2e

The E2E harness uses Foundry Anvil and starts the API, trusted grader worker, indexer, and a separate submission-agent process. The agent is intentionally given only the public challenge response and its wallet key; private object storage and grader configuration are mounted only into the worker. Set `VERITY_E2E_KEEP_LOGS=true` to retain child-process logs when diagnosing a failure.
```

Copy `.env.example` to `.env`. Real mode needs `RPC_URL`, `CHAIN_ID`, `SETTLEMENT_PRIVATE_KEY`, `WORKER_SHARED_SECRET`, `PRIVY_*`, durable database/object-store/queue endpoints, and a running API, worker, and indexer. `CHALLENGE_ESCROW_ADDRESS` is informational: each funded challenge has its own escrow address, captured from the company's confirmed deployment transaction.

For local development, start Anvil with `npm run dev:infra`, run `npm run contracts:deploy:local` to verify a real configured deployment, then start `npm run dev:api`, `npm run dev:worker`, and `npm run dev:indexer`. The worker has no RPC or settlement credential. `npm run artifacts:check` is suitable for CI and verifies ABI/OpenAPI artifacts are present.
