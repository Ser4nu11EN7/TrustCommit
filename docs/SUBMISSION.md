# TrustCommit Submission Frame

## One-Line Pitch

TrustCommit makes autonomous agents prove why their actions deserve to settle.

## Core Problem

Autonomous agents can already act on behalf of users and organizations, but they are still hard to trust with real commitments. When an agent exceeds a boundary, makes the wrong decision, or ignores a policy constraint, most teams get an output but no defensible proof of why that action should stand.

## Core Answer

TrustCommit turns agent actions into a reviewable settlement path. It gives agents:
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

1. a creator agent opens a covenant with explicit boundaries
2. an executor agent reviews preserved evidence, then produces one bounded action result
3. the runtime verifies that result against the covenant before any proof can settle
4. the executor signs and submits the full proof bundle and receipt head onchain
5. anyone can independently replay verification with `task:verify` or inspect the exported portable bundle
6. if the action is challenged, the system resolves the dispute against the preserved receipt and evidence trail

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

`an autonomous agent should not just act — it should prove why that action deserves to settle`

Working one-liner:

`TrustCommit is covenant, proof, and dispute resolution for autonomous agents operating under explicit commitments.`

## Required Proof Points

- public deployment addresses
- explorer-verifiable tx hashes
- short demo video
- public repo
- conversation log: `docs/CONVERSATION_LOG.md`
- judge evidence pack: `docs/JUDGE_EVIDENCE_PACK.zh-CN.md`
- README with architecture and receipt flow

## Current Demo Links

- provisional demo part 1: `https://www.loom.com/share/4da0c67e7c544418a061551ef095b946`
- provisional demo part 2: `https://www.loom.com/share/89a074ecbade45e0973ca6218ed2112b`
- note: current Loom demos are temporary and may be replaced by a cleaner final recording

## Current Base Sepolia Evidence

- TrustRegistry: `0x8BC8519dcB8d09e34295d1293C45B536a9acB6Ae`
- Covenant: `0x173Ba54B0c8Ef0D0e6Ee4905A81Ff268907A079E`
- Shared token: `0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78`
- deploy txs:
  - token `0xf879fe3890b42d0ea97c9aac765303af2ddc3e37fd74cb17bbf8ad15cbfc46e0`
  - registry `0x87a717bd6c0cf5102024535aa2ea06713cf7b002b89cddfb7468a6225bf581dd`
  - covenant `0x0aaf7ba70c58510258764b1b3fd7f94ba9c777d10f9487ee1994fe8a10c473ce`
  - covenant role grant `0xc00ab73dc656e9c33fe196426d0a198dfc2c4466f70ec225c4bb56503664f477`
- verified public submit flow:
  - task `task_fd3e380d-a74d-4f42-a69b-18059b169daf`
  - verifier `77 / 77 verified`
- verified public dispute flow:
  - task `task_c3bbe5fd-27c4-4cec-8f17-db021d218e70`
  - verifier `95 / 95 verified`
  - receipts: create, accept, submit, dispute, resolve are all present in `.trustcommit/public-proof/task_c3bbe5fd-27c4-4cec-8f17-db021d218e70/`
