# TrustCommit

TrustCommit turns autonomous agents into accountable onchain counterparties through stake-backed covenants, execution receipts, and disputeable proof trails.

## Overview

Autonomous agents can already act, but they are still difficult to trust with real commitments. TrustCommit makes those commitments legible and enforceable:

- agents register into a trust layer and post stake
- creators open covenant-backed tasks
- executors produce evidence-grounded artifacts and proof hashes
- every run exports `agent.json`, `artifact.json`, and `agent_log.json`
- disputes can be resolved against a persistent receipt trail

Core narrative:

`Not just agents that can act. Agents that can be held accountable.`

## Architecture

### Core Components

**Agent Identity (ERC-721)**
- Each agent is represented as an NFT
- Separates ownership from execution wallet
- Enables agent transfer and marketplace potential

**Staking System**
- Self-staking model (agent stakes for itself)
- ERC-20 token-based (configurable at deployment)
- Lock mechanism prevents withdrawal during covenant execution

**Reputation Scoring**
- 0-10000 basis points (0-100% with 2 decimal precision)
- Updated by trusted oracle role
- Immutable history via events

**Covenant Commitments**
- Task commitments are escrowed in `Covenant`
- Executors submit proof hashes for completion
- Finalization, disputes, cancellation, and slashing are all onchain

**Execution Receipts**
- Runtime exports structured manifests and logs
- Executor records inspected files, content hashes, plan, verification, and retry state
- Proof hashes anchor the execution record onchain

**Receipt Chain**
- Identity, commitment, execution artifacts, and onchain settlement are treated as one linked receipt chain
- `agent.json` describes the operator and runtime capabilities
- `agent_log.json` records budget policy, guardrails, verification, and receipt-chain fields
- `artifact.json` and covenant tx hashes make each task outcome inspectable end-to-end

## Quick Start

### Local Demo

```bash
anvil
npm run runtime -- demo:run
```

### Public Deployment

- Deployment guide: [DEPLOYMENT.md](/C:/Users/SerEN/TrustCommit/DEPLOYMENT.md)
- Submission framing: [SUBMISSION.md](/C:/Users/SerEN/TrustCommit/docs/SUBMISSION.md)

### Key Features

1. **registerAgent**: Mint agent NFT with initial reputation (50%)
2. **stake/withdrawStake**: Manage agent's economic guarantee
3. **lockStake/unlockStake**: Reserve funds during covenant execution (Covenant role only)
4. **slash**: Penalize violations by transferring locked stake (Covenant role only)
5. **commitReputation**: Update agent scores based on performance (Oracle role only)

## Contract Addresses

### Public Testnet
- TrustRegistry: `[Pending public deployment]`
- Covenant: `[Pending public deployment]`
- Stake Token: `[Pending public deployment]`
- Payment Token: `[Pending public deployment]`

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
- `manual arbiter`: reserved as a CLI-compatible interface so the MVP can upgrade cleanly to an AI arbiter later

The runtime persists task state in SQLite under `.trustcommit/runtime.db` and stores full artifacts in `.trustcommit/artifacts/`.
It also exports a repo-level `agent.json` manifest at `.trustcommit/agent.json` and a per-task `agent_log.json` beside each `artifact.json`.

Run the local demo on Anvil:
```bash
anvil
npm run runtime -- demo:run
```

Useful commands:
```bash
npm run runtime -- runtime:init
npm run runtime -- demo:bootstrap
npm run runtime -- providers:health
npm run runtime -- agent:manifest
npm run runtime -- task:list
npm run runtime -- task:create --title "Summarize repo" --instructions "Inspect the workspace and return JSON"
npm run runtime -- task:details --id <task-id>
npm run runtime -- task:run --id <task-id>
npm run runtime -- task:finalize --id <task-id>
npm run runtime -- server:start --port 3000
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
POST /tasks/:id/finalize
POST /tasks/:id/dispute
POST /tasks/:id/arbiter
```

The executor now records a grounded execution evidence chain before submitting onchain proofs:
- real file inspections with content hashes and excerpts
- a structured execution plan with explicit success criteria
- a grounded execution loop: plan -> inspect -> generate -> verify -> optional retry
- a truthful `agent_log.json` describing task ingest, workspace inspection, artifact generation, verification, and proof submission
- run metadata in SQLite that links each task execution to its exported log path
- explicit compute-budget fields such as attempts used, model calls, and evidence files considered
- explicit guardrails covering pre-execution checks, execution constraints, and pre-commit safety checks
- a receipt-chain section linking identity context, covenant commitment, execution artifacts, and onchain receipt hashes

### Deploy
```bash
npm run deploy:stack
npm run verify:deployment
```

The deploy flow uses [DeployTrustCommitStack.s.sol](/C:/Users/SerEN/TrustCommit/script/DeployTrustCommitStack.s.sol). If `STAKE_TOKEN_ADDRESS` and `PAYMENT_TOKEN_ADDRESS` are unset, it deploys a shared mock ERC20 automatically and uses it for both stake and payment.

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

1. Complete public testnet deployment and record explorer links
2. Finalize submission README, video, and track framing
3. Layer interoperability standards such as ERC-8004 without rewriting the core contracts
4. Upgrade the arbiter path after deployment baseline is stable

## License

MIT
