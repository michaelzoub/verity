# Verity architecture (v1)

The canonical flow sources are the versioned Mermaid files beside this README; the SVGs are rendered review artifacts. Any interface change must update the diagrams, tests, contract ABI/address data, OpenAPI, and shared types in the same change.

Actors are the requester/company wallet, agent wallet, API, private object store, queue, restricted grader worker, ChallengeEscrow, and indexer. The wallet, contract, and worker are trust boundaries: the API may orchestrate but cannot invent a settlement result; the worker never returns grader source or hidden fixtures; the contract accepts only the authorized backend and verifies challenge terms.

On-chain state is the funded challenge terms, commitment, submission count, finalized submission hash, scaled integer score, and payout event. Off-chain state is private grader source bytes, language/runtime/entrypoint/config, score schema, solution bytes, jobs, API authentication records, projections, and indexer checkpoints. `ChallengeCreated` is owned by the contract and projected by the indexer; `SubmissionFinalized` is the settlement source of truth after confirmation.

Invariants: grader source is private and committed deterministically over canonical source, language, runtime, entrypoint, and config; challenge-defined score ranges are validated before settlement; scores are exactly scaled to Solidity `uint256` values; submissions are hashed before grading; limits are enforced before enqueue; worker outcomes are normalized; settlement is authenticated and idempotent; duplicate events and replay do not duplicate projections; mocks are available only through explicit mock mode.

Company authentication boundary: Privy access tokens are verified only by the API. A verified Privy subject resolves to a local company record and authorizes company-owned challenge and grader operations. Privy never signs settlement payloads, controls contract custody, determines payout recipients, or is available to the grader worker/indexer.
