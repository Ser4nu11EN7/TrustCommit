import dotenv from "dotenv";
import { createPublicClient, formatEther, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { resolveRuntimeConfig } from "../runtime/src/config.js";
import type { AccountConfig, RuntimeConfig } from "../runtime/src/core/types.js";

dotenv.config();

type Severity = "blocker" | "warning";

type Finding = {
  severity: Severity;
  code: string;
  message: string;
};

type AccountSnapshot = {
  role: string;
  address: `0x${string}`;
  writable: boolean;
  balanceWei?: string;
  balanceEth?: string;
};

function normalizeAddress(address: string): `0x${string}` {
  return getAddress(address) as `0x${string}`;
}

function maybePrivateKeyAddress(privateKey?: string): `0x${string}` | undefined {
  if (!privateKey) {
    return undefined;
  }
  return normalizeAddress(privateKeyToAccount(privateKey as `0x${string}`).address);
}

function collectFindings(
  findings: Finding[],
  severity: Severity,
  code: string,
  message: string
): void {
  findings.push({ severity, code, message });
}

async function main(): Promise<void> {
  const runtimeConfig = resolveRuntimeConfig(process.cwd());
  const rpcUrl = process.env.DEPLOY_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.TC_RPC_URL;
  const findings: Finding[] = [];

  if (!rpcUrl) {
    collectFindings(findings, "blocker", "missing_rpc", "Set DEPLOY_RPC_URL, BASE_SEPOLIA_RPC_URL, or TC_RPC_URL.");
  }

  if (!process.env.PRIVATE_KEY) {
    collectFindings(findings, "blocker", "missing_deployer_key", "Set PRIVATE_KEY for the public deployer wallet.");
  }

  if (!process.env.ARBITER_ADDRESS) {
    collectFindings(findings, "blocker", "missing_arbiter_address", "Set ARBITER_ADDRESS for Covenant deployment.");
  }

  if (!process.env.MIN_REWARD) {
    collectFindings(findings, "warning", "missing_min_reward", "MIN_REWARD is unset; deployment will fall back to script defaults.");
  }

  const deployerAddress = maybePrivateKeyAddress(process.env.PRIVATE_KEY);
  const accountSnapshots: AccountSnapshot[] = [];

  if (deployerAddress) {
    accountSnapshots.push({
      role: "deployer",
      address: deployerAddress,
      writable: true
    });
  }

  const runtimeAccounts = (runtimeConfig.accounts ?? {}) as NonNullable<RuntimeConfig["accounts"]>;
  for (const [role, account] of Object.entries(runtimeAccounts) as [string, AccountConfig | undefined][]) {
    if (!account?.address) {
      continue;
    }
    accountSnapshots.push({
      role,
      address: normalizeAddress(account.address),
      writable: Boolean(account.privateKey)
    });
  }

  const addressToRoles = new Map<string, string[]>();
  for (const snapshot of accountSnapshots) {
    const key = snapshot.address.toLowerCase();
    const existing = addressToRoles.get(key) ?? [];
    existing.push(snapshot.role);
    addressToRoles.set(key, existing);
  }

  for (const [address, roles] of addressToRoles.entries()) {
    if (roles.length <= 1) {
      continue;
    }
    collectFindings(
      findings,
      "warning",
      "shared_authority",
      `Roles ${roles.join(", ")} collapse onto ${address}. Public deployment should keep deployer, creator, executorOwner, executionWallet, and arbiter separated where possible.`
    );
  }

  const executionWallet = runtimeAccounts.executionWallet?.address ?? runtimeAccounts.executor?.address;
  const executorOwner = runtimeAccounts.executorOwner?.address;
  if (executionWallet && executorOwner && executionWallet.toLowerCase() === executorOwner.toLowerCase()) {
    collectFindings(
      findings,
      "warning",
      "execution_owner_overlap",
      "executionWallet and executorOwner resolve to the same address. The registry can still work, but authority separation is weaker."
    );
  }

  let chainId: number | undefined;
  let latestBlock: bigint | undefined;
  if (rpcUrl) {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      chainId = Number(await client.getChainId());
      latestBlock = await client.getBlockNumber();

      for (const snapshot of accountSnapshots) {
        const balance = await client.getBalance({ address: snapshot.address });
        snapshot.balanceWei = balance.toString();
        snapshot.balanceEth = formatEther(balance);
        if (snapshot.writable && balance === 0n) {
          collectFindings(
            findings,
            "warning",
            "unfunded_account",
            `${snapshot.role} (${snapshot.address}) has zero native balance on chain ${chainId}.`
          );
        }
      }

      if (chainId !== 31337) {
        for (const snapshot of accountSnapshots) {
          if (!snapshot.writable) {
            collectFindings(
              findings,
              "blocker",
              "missing_private_key",
              `${snapshot.role} (${snapshot.address}) is configured without a private key and cannot sign on chain ${chainId}.`
            );
          }
        }
      }
    } catch (error) {
      collectFindings(
        findings,
        "blocker",
        "rpc_unreachable",
        `Could not connect to ${rpcUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const report = {
    ok: findings.every((finding) => finding.severity !== "blocker"),
    rpcUrl: rpcUrl ?? null,
    chainId: chainId ?? null,
    latestBlock: latestBlock?.toString() ?? null,
    accounts: accountSnapshots,
    env: {
      hasPrivateKey: Boolean(process.env.PRIVATE_KEY),
      hasArbiterAddress: Boolean(process.env.ARBITER_ADDRESS),
      hasMinReward: Boolean(process.env.MIN_REWARD),
      hasStakeTokenAddress: Boolean(process.env.STAKE_TOKEN_ADDRESS),
      hasPaymentTokenAddress: Boolean(process.env.PAYMENT_TOKEN_ADDRESS),
      hasTrustRegistryAddress: Boolean(process.env.TRUST_REGISTRY_ADDRESS),
      hasCovenantAddress: Boolean(process.env.COVENANT_ADDRESS)
    },
    findings
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

await main();
