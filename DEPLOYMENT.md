# TrustCommit Deployment

This guide is optimized for hackathon delivery: deploy the full TrustCommit stack, verify it on a public explorer, then use those receipts in the README and demo video.

## Goal

Deploy a working stack with:
- stake token
- payment token
- `TrustRegistry`
- `Covenant`
- arbiter role assigned

The deployment output should give you real contract addresses and explorer-verifiable receipts that support the core narrative:

`TrustCommit makes agents sign for what they do.`

## Prerequisites

- Foundry installed: `forge --version`
- Node.js 24+
- funded deployer wallet on the target network
- `.env` populated from [.env.example](./.env.example)

## Environment

Minimum required variables:

```bash
PRIVATE_KEY=0x...
ARBITER_ADDRESS=0x...
MIN_REWARD=1000000
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Before you broadcast anything, run:

```bash
npm run preflight:public
```

This preflight reports the exact blockers for a public deployment, including:

- missing RPC or deployer key
- unfunded wallets
- runtime accounts that still rely on Anvil unlocked-address mode
- authority overlap between deployer, creator, executor owner, execution wallet, and arbiter

Optional token variables:

```bash
STAKE_TOKEN_ADDRESS=0x...
PAYMENT_TOKEN_ADDRESS=0x...
```

If both token addresses are omitted, the full-stack deploy script will deploy one shared mock ERC20 and use it for both stake and payment.

## One-Command Stack Deploy

Default network:

```bash
npm run deploy:stack
```

Explicit network alias:

```bash
npm run deploy:stack -- --network base_sepolia
```

Custom RPC:

```bash
DEPLOY_RPC_URL=https://your-rpc.example npm run deploy:stack -- --network custom
```

The deploy script runs [DeployTrustCommitStack.s.sol](./script/DeployTrustCommitStack.s.sol), which:

1. deploys a mock token if no token addresses are provided
2. deploys [TrustRegistry.sol](./contracts/TrustRegistry.sol)
3. deploys [Covenant.sol](./contracts/Covenant.sol)
4. grants `COVENANT_ROLE` on the registry to the covenant contract

## Save the Addresses

Current Base Sepolia deployment:

```bash
STAKE_TOKEN_ADDRESS=0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78
PAYMENT_TOKEN_ADDRESS=0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78
TRUST_REGISTRY_ADDRESS=0x8BC8519dcB8d09e34295d1293C45B536a9acB6Ae
COVENANT_ADDRESS=0x173Ba54B0c8Ef0D0e6Ee4905A81Ff268907A079E
ARBITER_ADDRESS=0xd30ebf0D2a65D3beEA7a63E0Fee19Adf9daa2b12
```

Deployment receipts:
- Mock token: `0xf879fe3890b42d0ea97c9aac765303af2ddc3e37fd74cb17bbf8ad15cbfc46e0`
- TrustRegistry: `0x87a717bd6c0cf5102024535aa2ea06713cf7b002b89cddfb7468a6225bf581dd`
- Covenant: `0x0aaf7ba70c58510258764b1b3fd7f94ba9c777d10f9487ee1994fe8a10c473ce`
- Grant `COVENANT_ROLE`: `0xc00ab73dc656e9c33fe196426d0a198dfc2c4466f70ec225c4bb56503664f477`

If you redeploy later, copy the printed addresses back into `.env`:

```bash
STAKE_TOKEN_ADDRESS=0x...
PAYMENT_TOKEN_ADDRESS=0x...
TRUST_REGISTRY_ADDRESS=0x...
COVENANT_ADDRESS=0x...
```

## Verify the Deployment

Once addresses are saved:

```bash
npm run verify:deployment
```

This script checks:

- bytecode exists at the deployed addresses
- `TrustRegistry.stakeToken()` matches `STAKE_TOKEN_ADDRESS`
- `Covenant.paymentToken()` matches `PAYMENT_TOKEN_ADDRESS`
- `Covenant.trustRegistry()` matches `TRUST_REGISTRY_ADDRESS`
- `COVENANT_ROLE` is granted on the registry
- `ARBITER_ROLE` is granted on the covenant

## Sync the Runtime to Public Contracts

Once the addresses are written into `.env`, persist the public chain context into `.trustcommit/config.json`:

```bash
npm run prepare:public -- --config-only
```

This records:

- live `chainId`
- runtime `rpcUrl`
- `trustRegistry`, `covenant`, and token addresses
- the current public runtime account map

## Prepare Public Runtime Actors

If you deployed a shared mock token, you can prepare the public runtime actors with one command:

```bash
npm run prepare:public
```

This script:

1. mints payment tokens to the creator wallet
2. mints stake tokens to the executor owner wallet
3. registers the executor agent on `TrustRegistry`
4. stakes the executor agent
5. rotates the execution wallet if `executorOwner` and `executionWallet` differ

If you are using a non-mintable token, skip the mint phase and fund the wallets manually first:

```bash
npm run prepare:public -- --skip-mint
```

The script writes a structured report to:

```text
.trustcommit/public-proof/public-prep/public-prep.json
```

Current prepared public executor:
- `agentId = 3`
- register tx: `0xefa52180c8343efdde39b9d7bd27b5da9249faa8347492e6d02f54baf0e997a6`
- stake tx: `0xf305d6769dcdef9e5a45ac27a1a70a946ccb04cb76fa03c84681265772ebf3b6`

## Generate Public Proof

After the actors are ready, generate public evidence with one of these flows:

```bash
npm run public:flow -- --mode submit
npm run public:flow -- --mode dispute
```

- `submit` creates, accepts, executes, verifies, and exports a public procurement covenant bundle
- `dispute` does the same, then opens a dispute and resolves it immediately through the arbiter path

Both flows write a portable bundle and summary file under:

```text
.trustcommit/public-proof/<task-id>/
```

Current verified public examples:
- happy path submit:
  - task `task_fd3e380d-a74d-4f42-a69b-18059b169daf`
  - verifier `77 / 77 verified`
  - create `0x86dd54c19f8f5cff6c9f03998c6602940d84e0483b9d04bf59ef6ef361323b03`
  - accept `0xd9d1a2b0c1e1799e5ef9800f171d024c11d19a228c373a44eb58778cee95f304`
  - submit `0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e`
- dispute path:
  - task `task_c3bbe5fd-27c4-4cec-8f17-db021d218e70`
  - verifier `95 / 95 verified`
  - create `0xa1b110a3683978f06e5106437ea1def6745671b254ccb00290f7df6c650647e1`
  - accept `0x9eb0940b037f358e00d1adef9c80c8f411a9ed0b4c53f75deb40b1992590671d`
  - submit `0x563e9015dbf375eba65486f1945967559fd85ad536e38073075b7eaeb2af20a9`
  - dispute `0x0c68c5078f30b6cb4b91864b7408c186fd50b125505da429da3fce9786ad5637`
  - resolve `0x590ff831de9ef02cb6af0d2cde52774c46280faf3ae0ada5ef733ff36113cfbb`

Use `dispute` when you need a same-day publicly settled outcome. `finalizeCompletion` still respects the onchain 7-day dispute window on public chains.

## Post-Deploy Checklist

- [ ] explorer links recorded for token, `TrustRegistry`, and `Covenant`
- [x] one successful runtime flow produces task creation, acceptance, submission, and either dispute+resolution or post-window finalization tx hashes
- [x] addresses copied into README and demo notes
- [x] `npm run verify:deployment` returns `"ok": true`

## Suggested Next Step

After deployment works, do not immediately polish the UI. First:

1. run the runtime against the deployed contracts
2. capture real tx hashes
3. update README and submission materials with those receipts
