# TrustCommit Project Status

**Last Updated**: 2026-03-20

## Current State

TrustCommit is no longer a design-stage concept. The repository now contains a working accountable-agent stack with:

- onchain `TrustRegistry` identity, staking, stake locking, slashing, and execution-wallet rotation
- onchain `Covenant` commitments with proposal/acceptance flow, reward escrow, proof submission, dispute windows, timeout slashing, and proof-hash reuse protection
- a Node/TypeScript runtime with `creator`, `executor`, and `AI arbiter` roles
- signed `proof_bundle.json` artifacts, append-only signed receipt events, `agent.json`, `agent_log.json`, and typed `dispute_evidence.json`
- portable exported task bundles that strip local absolute paths while preserving verifier-relevant hashes and snapshots
- an independent verifier CLI that checks proof hashes, receipt chains, signer authority, preserved evidence snapshots, and onchain submission bindings

## Implemented Components

### Contracts

- `contracts/TrustRegistry.sol`
- `contracts/Covenant.sol`
- `contracts/interfaces/ITrustRegistry.sol`
- `contracts/interfaces/ICovenant.sol`

Key guarantees already implemented:

1. agent registration is stake-backed and represented onchain
2. owner and execution wallet are modeled as distinct authorities
3. execution-wallet rotation requires typed acceptance by the new wallet
4. executor consent is explicit: stake locks only after the execution wallet accepts the covenant
5. completion submission binds `proofHash + receiptHead + execution-wallet signature`
6. `proofHash` cannot be reused across covenants
7. disputes are `Submitted`-only; missed delivery follows timeout slashing, while unaccepted covenants simply expire and refund

### Runtime

- `runtime/src/runtime.ts`
- `runtime/src/agents/executor-agent.ts`
- `runtime/src/agents/ai-arbiter.ts`
- `runtime/src/verifier/task-verifier.ts`
- `runtime/src/validators/profiles.ts`

Key runtime guarantees already implemented:

1. executor runs `plan -> inspect -> generate -> verify -> retry`
2. artifacts, logs, proof bundles, receipt records, and dispute evidence are persisted per task
3. receipt events are hash-chained and signed
4. verifier replays validator results from preserved evidence snapshots
5. task-specific chain context is stored and checked during verification
6. portable task export emits machine-agnostic bundles for external review
7. procurement and remediation tasks now deterministically preserve the decisive fixture files instead of relying only on heuristic evidence scoring

### Tooling

- `scripts/deploy-stack.ts`
- `scripts/verify-deployment.ts`
- `scripts/public-preflight.ts`

Current tooling status:

1. local demo bootstrap works on Anvil
2. deployment and verification scripts exist
3. public preflight reports concrete blockers before deployment

## Validation Status

Latest verified local checks:

- `npm run build`
- `npm test`
- `forge test -q`
- `npm run runtime -- demo:dispute`
- `npm run runtime -- demo:remediation`
- `npm run runtime -- task:verify --id <task-id>`
- `npm run runtime -- task:export --id <task-id>`

Current local proof artifacts are generated successfully, but they are still Anvil-local and currently use the mock provider path by default.

## Highest-Priority Remaining Gaps

These are the main gaps between the current repo and a prize-level submission:

1. public proof is still missing
   - no public deployment addresses committed to the repo
   - no public explorer receipts
   - no publicly retrievable artifact publication layer

2. validator strength is still narrow
   - procurement and remediation are now strong deterministic demo paths
   - broader covenant types still need stronger deterministic validation

3. dispute semantics still rely on a trusted arbiter role
   - offchain evidence is stronger now
   - onchain settlement is still not trust-minimized proof execution

4. runtime defaults still show local demo mode
   - current checked-in `.trustcommit` state is `mock` + Anvil

## Recommended Next Technical Work

If continuing on core implementation rather than presentation:

1. broaden validator profiles beyond procurement
2. strengthen evidence selection so decisive files are less heuristic
3. decide whether to push more settlement logic onchain or explicitly frame arbiter trust as intentional MVP scope
4. move from local-only proof artifacts toward public retrieval / publication

## Notes

- This file is now aligned with the actual repository state.
- Older design-stage wording should not be used as current project status.
