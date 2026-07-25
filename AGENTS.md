# Verity workspace guide

This is an npm-workspaces Turborepo.

## Apps

The `apps/` folder contains deployable applications. **Frontend work lives in `apps/web/`**: it is the Next.js landing page and product experience.

```text
apps/
  web/            # Frontend — Next.js / React UI
  api/            # Backend API
  grader-worker/  # Isolated private-grader execution
  indexer/        # Smart-contract event indexing
```

## Shared packages

`packages/` contains shared domain models, API contracts, fixtures, SDK helpers, contract artifacts, adapters, config, and UI tokens.

## Commands

Use npm only:

```bash
npm run dev:web
npm run dev:api
npm run dev:mock
npm run dev:full
npm run typecheck
npm run lint
npm test
npm run test:contracts
```

## Architecture contract

Before implementing any feature, read `docs/architecture/README.md`, both versioned flow sources and rendered diagrams, and `docs/architecture/boundaries.md`. These artifacts are normative. Agents must not silently diverge from them. Any necessary flow change must update the diagrams, tests, contracts, OpenAPI, and shared domain types together. Private grader source and hidden test data must never be returned by API or worker responses.
## Company authentication boundary

- Privy is used only for company/requester authentication.
- Company API calls send `Authorization: Bearer <privy-access-token>`; Privy provides authentication only, never ownership or settlement authority.
- The API verifies it and derives the local company identity.
- Client-supplied ownership fields are never trusted.
- The backend settlement signer is a separate credential.
- Rewards are released by the smart contract to the payout address stored with the submission.
- Privy, settlement, contract custody, and x402 credentials must remain separate.
- Auth contract changes require synchronized OpenAPI, generated clients, tests, and architecture docs.
- Do not remove or bypass the Privy company sign-in button or bearer-token integration in `apps/web`; company challenge creation and management must remain available through Privy when company auth is enabled.

## Provider-backed development

The manual development path is production-capable: Supabase Postgres/Storage, Privy server verification, E2B sandboxes, Monad Testnet, Foundry keystores, and the shared worker/indexer paths only. Do not restore JSON persistence, filesystem object storage, Anvil, mock events, simulated settlement, disabled Privy auth, or host-process grading. Before claiming a provider-backed change is complete, run `npm run services:check` against real credentials and exercise the README golden path.
E2B grader templates are versioned under `templates/verity-grader-*`; build them with `npm run e2b:templates:build` and store only real provider IDs in `E2B_TEMPLATE_TS`, `E2B_TEMPLATE_JS`, and `E2B_TEMPLATE_PYTHON`. Never invent IDs or fall back to host-process grading.
