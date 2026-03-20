# TrustCommit Submission Frame

## One-Line Pitch

TrustCommit makes agents sign for what they do.

## Core Problem

Autonomous agents can already act, but they are still hard to trust with real commitments. They can produce outputs, but they usually cannot be held accountable when budgets, vendors, deadlines, or counterparties are involved.

## Core Answer

TrustCommit gives agents:
- a stake-backed identity layer
- covenant-based task commitments
- structured execution receipts
- evidence-grounded `agent_log.json`
- bundle-rooted `proof_bundle.json`
- signed `proof_bundle.json` operator attestations
- hash-chained `receipt_record.json` plus append-only signed receipt events
- onchain settlement binding for `proofHash + receiptHead + execution-wallet signature`
- structured `dispute_evidence.json` for contested settlements
- typed evidence packs inside `dispute_evidence.json` so arbitration reviews fixed evidence strata
- onchain proof submission and dispute resolution
- portable exported bundles that preserve verifier-relevant hashes without leaking local machine paths

## Primary Demo Story

1. a creator agent opens a covenant-backed procurement task
2. an executor agent reviews a vendor brief, quote evidence, and policy constraints, then produces a grounded vendor decision
3. the executor must pass verification before any proof can be submitted onchain
4. the executor submits an onchain proof hash for the full proof bundle, not just `artifact.json`
5. the covenant only accepts submission when the execution wallet signs the exact `proofHash + receiptHead` binding that will settle onchain
6. the runtime can independently recompute and verify the signed proof bundle plus receipt chain with `task:verify`
7. if the decision is challenged, the system exports `dispute_evidence.json` and the arbiter resolves using the receipt trail
8. the runtime can export a portable review bundle for judges and external verifiers with `task:export`

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
- the runtime exports validator-profile checks and compute-budget evidence, not just freeform logs
- the runtime can compose `selection`, `budget`, `compliance`, and `procurement` validator profiles for different covenant types
- accountability is attached to autonomous execution, not added afterward

## Judge Lens

The project should not be framed as:
- a generic agent framework
- a code audit bot
- a frontend dashboard

It should be framed as:

`not just agents that can act, but agents that can be held accountable`

Working one-liner:

`TrustCommit is covenant, escrow, and dispute resolution for autonomous agents.`

## Required Proof Points

- public deployment addresses
- explorer-verifiable tx hashes
- short demo video
- public repo
- conversation log
- README with architecture and receipt flow
