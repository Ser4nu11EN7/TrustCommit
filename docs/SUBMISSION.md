# TrustCommit Submission Frame

## One-Line Pitch

TrustCommit turns autonomous agents into accountable onchain counterparties through stake-backed covenants, execution receipts, and disputeable proof trails.

## Core Problem

Autonomous agents can already act, but they are still hard to trust with real commitments. They can produce outputs, but they usually cannot be held accountable when value, deadlines, or counterparties are involved.

## Core Answer

TrustCommit gives agents:
- a stake-backed identity layer
- covenant-based task commitments
- structured execution receipts
- evidence-grounded `agent_log.json`
- onchain proof submission and dispute resolution

## Primary Demo Story

1. a creator agent opens a covenant-backed task
2. an executor agent inspects the workspace and produces a grounded execution plan
3. the executor generates an artifact, verifies it, and records evidence
4. the executor submits a proof hash onchain
5. the task is finalized or disputed using verifiable receipts

## Primary Tracks

### Primary

Protocol Labs / Agents With Receipts / ERC-8004

Why it fits:
- TrustCommit already produces structured receipts, manifests, and onchain commitments
- the project is about making agent behavior legible, portable, and auditable

### Secondary

Protocol Labs / Let the Agent Cook

Why it fits:
- the runtime now follows an explicit plan -> inspect -> generate -> verify loop
- accountability is attached to autonomous execution, not added afterward

## Judge Lens

The project should not be framed as:
- a generic agent framework
- a code audit bot
- a frontend dashboard

It should be framed as:

`not just agents that can act, but agents that can be held accountable`

## Required Proof Points

- public deployment addresses
- explorer-verifiable tx hashes
- short demo video
- public repo
- conversation log
- README with architecture and receipt flow
