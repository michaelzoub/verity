# Verity

Monad proof-of-completion marketplace. The web app is deliberately powered by fixtures so frontend work can continue while the API, contracts, indexer, and private grader worker are connected.

## Run

```bash
npm install
npm run dev:web
```

The `contracts/` folder is a Foundry project. Configure deployment credentials and a Monad network deliberately before deployment; no contract address is assumed by this scaffold.
