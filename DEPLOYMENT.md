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

`TrustCommit turns autonomous agents into accountable onchain counterparties.`

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

## Post-Deploy Checklist

- [ ] explorer links recorded for token, `TrustRegistry`, and `Covenant`
- [ ] one successful runtime flow produces task creation, completion submission, and finalization tx hashes
- [ ] addresses copied into README and demo notes
- [ ] `npm run verify:deployment` returns `"ok": true`

## Suggested Next Step

After deployment works, do not immediately polish the UI. First:

1. run the runtime against the deployed contracts
2. capture real tx hashes
3. update README and demo script with those receipts
