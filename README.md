# TrustCommit

TrustCommit makes agents sign for what they do.

## Overview

Autonomous agents can already act, but they are still difficult to trust with real commitments. TrustCommit turns agent procurement into something legible and enforceable:

- agents register into a trust layer and post stake
- creators open covenant-backed task proposals
- executors explicitly accept covenants before stake locks and timeout slashing become possible
- executors produce evidence-grounded artifacts and full proof-bundle hashes
- every run exports `agent.json`, `artifact.json`, `agent_log.json`, and `proof_bundle.json`
- disputes can be resolved against a persistent receipt trail

Core narrative:

`Not just agents that can act. Agents that can be held accountable.`

Practical framing:

`TrustCommit is covenant, escrow, and dispute resolution for autonomous agents.`

## Architecture

### Core Components

**Agent Identity**
- Agents register into `TrustRegistry` and operate with stake-backed execution rights
- Ownership is separated from the execution wallet
- The runtime models the NFT owner and execution wallet as distinct authorities
- The runtime exports manifests that keep the identity layer interoperable with ERC-8004-style receipts

**Staking System**
- Self-staking model (agent stakes for itself)
- ERC-20 token-based (configurable at deployment)
- Lock mechanism prevents withdrawal during covenant execution

**Reputation Scoring**
- 0-10000 basis points (0-100% with 2 decimal precision)
- Updated by trusted oracle role
- Immutable history via events

**Covenant Commitments**
- Task commitments are proposed in `Covenant`, then explicitly accepted by the executor execution wallet
- Executors submit proof hashes for completion
- Finalization, disputes, cancellation, and slashing are all onchain

**Execution Receipts**
- Runtime exports structured manifests and logs
- Executor records inspected files, content hashes, plan, verification, and retry state
- Proof hashes anchor the full execution bundle onchain, not just the artifact payload

**Receipt Chain**
- Identity, commitment, execution artifacts, and onchain settlement are treated as one linked receipt chain
- `agent.json` describes the executor owner, execution wallet, and runtime capabilities
- `agent_log.json` records budget policy, guardrails, verification, and the immutable pre-submit execution record
- `proof_bundle.json` commits the artifact, evidence root, plan, verification, validator profiles, and execution trace into one bundle hash
- `proof_bundle.json` is signed by the executor as an operator attestation
- `receipt_record.json` is a hash-chained receipt index backed by append-only signed receipt event files
- `submitCompletion` now binds `proofHash + receiptHead + operator signature` onchain, so settlement is tied to a specific execution-wallet attestation
- `dispute_evidence.json` and covenant tx hashes make each task outcome inspectable end-to-end
- `dispute_evidence.json` now exports typed evidence packs (`identity`, `commitment`, `execution`, `verification`, `receipts`, `dispute`) so arbitration can review fixed evidence strata instead of a loose blob
- procurement and remediation tasks now deterministically include the decisive fixture files in the evidence set instead of relying on generic scoring alone
- `task:export` emits a portable bundle that strips local absolute paths from exported artifacts while preserving verifier-relevant hashes and snapshots

## Quick Start

### Local Demo

```bash
anvil
npm run runtime -- demo:run
npm run runtime -- demo:dispute
npm run runtime -- demo:remediation
```

### Public Deployment

- Deployment guide: [DEPLOYMENT.md](/C:/Users/SerEN/TrustCommit/DEPLOYMENT.md)
- Submission framing: [SUBMISSION.md](/C:/Users/SerEN/TrustCommit/docs/SUBMISSION.md)

### Key Features

1. **registerAgent**: Mint agent NFT with initial reputation (50%)
2. **stake/withdrawStake**: Manage agent's economic guarantee
3. **lockStake/unlockStake**: Reserve funds during covenant execution after executor acceptance (Covenant role only)
4. **slash**: Penalize violations by transferring locked stake (Covenant role only)
5. **commitReputation**: Update agent scores based on performance (Oracle role only)

## Contract Addresses

### Public Testnet
- Network: `Base Sepolia` (`chainId 84532`)
- TrustRegistry: `0x8BC8519dcB8d09e34295d1293C45B536a9acB6Ae`
- Covenant: `0x173Ba54B0c8Ef0D0e6Ee4905A81Ff268907A079E`
- Stake Token: `0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78`
- Payment Token: `0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78`
- Deploy receipts:
  - Mock token: `0xf879fe3890b42d0ea97c9aac765303af2ddc3e37fd74cb17bbf8ad15cbfc46e0`
  - TrustRegistry: `0x87a717bd6c0cf5102024535aa2ea06713cf7b002b89cddfb7468a6225bf581dd`
  - Covenant: `0x0aaf7ba70c58510258764b1b3fd7f94ba9c777d10f9487ee1994fe8a10c473ce`
  - Grant `COVENANT_ROLE`: `0xc00ab73dc656e9c33fe196426d0a198dfc2c4466f70ec225c4bb56503664f477`

### Public Proof Examples
- Verified submit flow:
  - task: `task_fd3e380d-a74d-4f42-a69b-18059b169daf`
  - covenant: `0x7e5e5d2e38cc1c0139a4b21105694384e2d6c0ed9ab4e793d302a4a557ede09b`
  - receipts: `create 0x86dd54c19f8f5cff6c9f03998c6602940d84e0483b9d04bf59ef6ef361323b03`, `accept 0xd9d1a2b0c1e1799e5ef9800f171d024c11d19a228c373a44eb58778cee95f304`, `submit 0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e`
  - verifier: `77 / 77 verified`
- Verified dispute flow:
  - task: `task_c3bbe5fd-27c4-4cec-8f17-db021d218e70`
  - covenant: `0xc495ec810e34caaf74d18eb886066f34b39e251699511cd19ca89691c7611467`
  - receipts: `create 0xa1b110a3683978f06e5106437ea1def6745671b254ccb00290f7df6c650647e1`, `accept 0x9eb0940b037f358e00d1adef9c80c8f411a9ed0b4c53f75deb40b1992590671d`, `submit 0x563e9015dbf375eba65486f1945967559fd85ad536e38073075b7eaeb2af20a9`, `dispute 0x0c68c5078f30b6cb4b91864b7408c186fd50b125505da429da3fce9786ad5637`, `resolve 0x590ff831de9ef02cb6af0d2cde52774c46280faf3ae0ada5ef733ff36113cfbb`
  - verifier: `95 / 95 verified`
  - export: `.trustcommit/public-proof/task_c3bbe5fd-27c4-4cec-8f17-db021d218e70/`

## Usage

### For Agent Operators

```solidity
// 1. Register your agent
uint256 agentId = registry.registerAgent(
    msg.sender,
    "ipfs://QmAgent123",
    keccak256("agent-profile-data")
);

// 2. Stake tokens
token.approve(address(registry), 1000e18);
registry.stake(agentId, 1000e18);

// 3. Your agent can now participate in covenants
```

### For Covenant Contracts

```solidity
// 1. Lock stake before task execution
registry.lockStake(agentId, covenantId, requiredAmount);

// 2. On violation, slash the agent
registry.slash(agentId, covenantId, penaltyAmount, victimAddress, reasonHash);

// 3. On success, unlock stake
registry.unlockStake(agentId, covenantId);
```

### For Oracle Services

```solidity
// Update reputation based on performance data
registry.commitReputation(agentId, newScoreBps, evidenceRoot);
```

## Security Model

**Access Control**
- `DEFAULT_ADMIN_ROLE`: Deploy, grant roles, pause/unpause
- `COVENANT_ROLE`: Lock/unlock/slash stake
- `ORACLE_ROLE`: Update reputation scores

**Safety Features**
- ReentrancyGuard on all fund transfers
- Pausable for emergency stops
- Cannot withdraw locked stake
- Cannot slash more than locked amount

## Development

### Prerequisites
- Foundry (forge, cast, anvil)
- OpenZeppelin Contracts v5.x
- Node.js 24+

### Install Dependencies
```bash
forge install OpenZeppelin/openzeppelin-contracts
npm install
```

### Run Tests
```bash
forge test -vv
npm test
```

### Agent Runtime MVP
The repo now includes a CLI-first agent runtime under [runtime/src/cli.ts](/C:/Users/SerEN/TrustCommit/runtime/src/cli.ts). It implements the hackathon MVP:

- `creator agent`: normalizes a structured task spec into covenant-ready data
- `executor agent`: inspects the workspace, generates a structured artifact, hashes it, and submits completion onchain
- `AI arbiter`: reviews structured dispute evidence, receipt snapshots, and execution verification before resolving onchain
- `manual arbiter`: remains available as a strict fallback path

The runtime persists task state in SQLite under `.trustcommit/runtime.db` and stores full artifacts in `.trustcommit/artifacts/`.
It also exports a repo-level `agent.json` manifest at `.trustcommit/agent.json` and per-task artifacts such as `artifact.json`, `agent_log.json`, `proof_bundle.json`, `receipt_record.json`, `dispute_evidence.json`, and `arbiter_log.json`.

Run the local demo on Anvil:
```bash
anvil
npm run runtime -- demo:run
```

Useful commands:
```bash
npm run runtime -- runtime:init
npm run runtime -- demo:bootstrap
npm run runtime -- demo:dispute
npm run runtime -- demo:remediation
npm run runtime -- providers:health
npm run runtime -- agent:manifest
npm run runtime -- task:list
npm run runtime -- task:create --title "Summarize repo" --instructions "Inspect the workspace and return JSON"
npm run runtime -- task:details --id <task-id>
npm run runtime -- task:verify --id <task-id>
npm run runtime -- task:export --id <task-id>
npm run runtime -- task:run --id <task-id>
npm run runtime -- task:finalize --id <task-id>
npm run runtime -- server:start --port 3000
npm run preflight:public
npm run prepare:public -- --config-only
npm run prepare:public
npm run public:flow -- --mode submit
npm run public:flow -- --mode dispute
```

Provider notes:
```bash
# OpenAI primary, Claude fallback
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export TC_PRIMARY_PROVIDER=openai
export TC_FALLBACK_PROVIDER=claude
```

If `ANTHROPIC_API_KEY` is not set but a local authenticated `claude` CLI is available, the runtime will use the Claude CLI as the real fallback provider for local development and demos. You can override the binary path with `CLAUDE_CLI_PATH`.

The local HTTP API is intentionally thin and calls the same runtime methods as the CLI. Default host is `127.0.0.1` and default port is `3000`.

Available endpoints:
```text
GET  /health
GET  /agent/manifest
GET  /tasks
GET  /tasks/:id
POST /tasks
POST /tasks/:id/run
GET  /tasks/:id/verify
POST /tasks/:id/export
POST /tasks/:id/finalize
POST /tasks/:id/dispute
POST /tasks/:id/arbiter
```

The executor now records a grounded execution evidence chain before submitting onchain proofs:
- real file inspections with content hashes and excerpts
- a structured execution plan with explicit success criteria
- a grounded execution loop: plan -> inspect -> generate -> verify -> optional retry
- a truthful `agent_log.json` describing task ingest, workspace inspection, artifact generation, verification, and the pre-submit proof record
- a `proof_bundle.json` that commits artifact, evidence root, plan, verification, budget, and validator hashes into one onchain proof
- a signed `proof_bundle.json` attestation so the operator cannot deny the committed bundle locally
- run metadata in SQLite that links each task execution to its exported log path
- explicit compute-budget fields such as attempts used, model calls, and evidence files considered
- explicit guardrails covering pre-execution checks, execution constraints, and pre-commit safety checks
- a hard verification gate: failed artifacts do not get submitted onchain
- validator profiles (`baseline`, `structured_commitment`, `procurement_commitment`) so deterministic checks stay attached to the covenant type instead of only schema hygiene
- composable validator profiles (`selection_commitment`, `budget_commitment`, `compliance_commitment`) so covenant rules can generalize beyond the procurement demo
- a second strong covenant class, `remediation_commitment`, with deterministic checks for required files, forbidden files, audit-log preservation, test coverage, sanitization, and lowest-risk plan selection
- a hash-chained `receipt_record.json` index plus append-only signed `receipt_events/*.json` files so onchain receipts do not require mutating `agent_log.json`
- sidecar `dispute.json`, `dispute_evidence.json`, `resolution.json`, and `arbiter_log.json` artifacts for contested tasks
- an independent `task:verify` command that recomputes the proof bundle hash, verifies receipt-chain signatures, and checks that the receipt head matches the append-only event log
- a portable export path that emits publishable bundles with relative artifact refs instead of machine-local Windows paths

### Deploy
```bash
npm run deploy:stack
npm run verify:deployment
```

The deploy flow uses [DeployTrustCommitStack.s.sol](/C:/Users/SerEN/TrustCommit/script/DeployTrustCommitStack.s.sol). If `STAKE_TOKEN_ADDRESS` and `PAYMENT_TOKEN_ADDRESS` are unset, it deploys a shared mock ERC20 automatically and uses it for both stake and payment.

### Public Proof Flow
Once public addresses are saved into `.env`, prepare the runtime and public actors:

```bash
npm run preflight:public
npm run prepare:public -- --config-only
npm run prepare:public
```

Then generate public evidence:

```bash
npm run public:flow -- --mode submit
npm run public:flow -- --mode dispute
```

`submit` gives you a same-day public proof bundle and receipt trail, while `dispute` gives you a same-day resolution path without waiting for the 7-day dispute window to expire.

## Events

All state changes emit events for off-chain indexing:
- `AgentRegistered(agentId, owner, profileHash)`
- `StakeDeposited(agentId, amount, newBalance)`
- `StakeWithdrawn(agentId, amount, newBalance)`
- `StakeLocked(agentId, covenantId, amount)`
- `StakeUnlocked(agentId, covenantId, amount)`
- `StakeSlashed(agentId, covenantId, amount, receiver)`
- `ReputationUpdated(agentId, newScoreBps, evidenceRoot)`

## Next Steps

1. Record explorer links and public review bundle links in the submission draft
2. Finalize the short demo video around the verified Base Sepolia procurement flow
3. Layer interoperability standards such as ERC-8004 without rewriting the core contracts
4. Upgrade the arbiter path after the public proof story is locked

## License

MIT
