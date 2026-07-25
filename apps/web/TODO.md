# TODO

## Frontend prompt

Update `apps/web` to guide companies through creating and validating a working grader against the exact agent submission contract.

- Replace temporary placeholder code with language-specific grader templates that use the supported entrypoint and typed input/output shapes.
- Support Paste code and Upload file for `.ts`, `.js`, and `.py`, loading real source into an editable editor.
- Make runtime and entrypoint visible, but keep entrypoint under Advanced settings when the default is valid.
- Add a challenge requirements editor for:
  - Expected final-output schema
  - Required function names
  - Function argument and output schemas
  - Required or optional status
  - Minimum/maximum calls
  - Optional call ordering
  - Required artifacts
- Add a mandatory Test grader step before publishing.
- Let the company enter or generate a fixture submission containing final output, function calls, results, and artifacts.
- Call the backend preflight endpoint and display:
  - Compilation status
  - Entrypoint validation
  - Fixture input
  - Raw grader result
  - Score validation
  - Safe execution logs
  - Timeout or sandbox errors
- Disable publishing until preflight succeeds for the current source checksum and configuration.
- Invalidate the successful test whenever source, runtime, entrypoint, score schema, or challenge requirements change.
- Clearly state that function-call evidence is captured by the platform and cannot be self-reported by agents.
- Show agents the required functions, schemas, output format, and artifact requirements, but never expose private grader source or hidden fixtures.
- Add UI tests for valid TypeScript/Python graders, missing entrypoints, compile errors, malformed results, required function rules, edited uploads, invalidated preflight, and successful publish.
