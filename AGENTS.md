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
