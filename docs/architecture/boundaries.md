# System boundaries

`apps/web` consumes deterministic fixture data by default. It may therefore be built and reviewed independently from the API or chain deployment.

The API persists private grader settings and commitment material. `apps/grader-worker` receives a submission plus a private configuration in an isolated runtime and returns only a normalized outcome. The API authenticates that outcome to `ChallengeEscrow`; the contract never makes an HTTP request and never sees grader code or test data.

`apps/indexer` consumes `ChallengeCreated` and `SubmissionFinalized` events and produces marketplace and dashboard projections.
