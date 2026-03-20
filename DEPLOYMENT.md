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
- `.env` populated from [.env.example](/C:/Users/SerEN/TrustCommit/.env.example)

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

The deploy script runs [DeployTrustCommitStack.s.sol](/C:/Users/SerEN/TrustCommit/script/DeployTrustCommitStack.s.sol), which:

1. deploys a mock token if no token addresses are provided
2. deploys [TrustRegistry.sol](/C:/Users/SerEN/TrustCommit/contracts/TrustRegistry.sol)
3. deploys [Covenant.sol](/C:/Users/SerEN/TrustCommit/contracts/Covenant.sol)
4. grants `COVENANT_ROLE` on the registry to the covenant contract

## Save the Addresses

After deployment, copy the printed addresses back into `.env`:

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

Use `dispute` when you need a same-day publicly settled outcome. `finalizeCompletion` still respects the onchain 7-day dispute window on public chains.

## Post-Deploy Checklist

- [ ] explorer links recorded for token, `TrustRegistry`, and `Covenant`
- [ ] one successful runtime flow produces task creation, acceptance, submission, and either dispute+resolution or post-window finalization tx hashes
- [ ] addresses copied into README and demo notes
- [ ] `npm run verify:deployment` returns `"ok": true`

## Suggested Next Step

After deployment works, do not immediately polish the UI. First:

1. run the runtime against the deployed contracts
2. capture real tx hashes
3. update README and demo script with those receipts
