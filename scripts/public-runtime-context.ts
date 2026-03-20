import dotenv from "dotenv";
import { createPublicClient, getAddress, http } from "viem";
import { persistRuntimeConfig, resolveRuntimeConfig } from "../runtime/src/config.js";
import type { AccountConfig, RuntimeConfig } from "../runtime/src/core/types.js";

dotenv.config();

export interface PreparedPublicRuntimeContext {
  config: RuntimeConfig;
  rpcUrl: string;
  chainId: number;
  client: ReturnType<typeof createPublicClient>;
  stakeTokenAddress: `0x${string}` | null;
  paymentTokenAddress: `0x${string}` | null;
}

function optionalAddress(value: string | undefined | null): `0x${string}` | null {
  if (!value) {
    return null;
  }
  return getAddress(value) as `0x${string}`;
}

export function parseFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function parseOption(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] ?? fallback;
}

export function requireAccount(config: RuntimeConfig, role: keyof NonNullable<RuntimeConfig["accounts"]>): AccountConfig {
  const account = config.accounts?.[role];
  if (!account?.address) {
    throw new Error(`Runtime account ${role} is not configured.`);
  }
  if (!account.privateKey) {
    throw new Error(`Runtime account ${role} is missing a private key for public chain use.`);
  }
  return account;
}

export function executorOwnerAccount(config: RuntimeConfig): AccountConfig {
  return requireAccount(config, "executorOwner");
}

export function executionWalletAccount(config: RuntimeConfig): AccountConfig {
  return config.accounts?.executionWallet?.address
    ? requireAccount(config, "executionWallet")
    : requireAccount(config, "executor");
}

export async function preparePublicRuntimeContext(
  workspaceRoot = process.cwd(),
  requireContracts = true
): Promise<PreparedPublicRuntimeContext> {
  const config = resolveRuntimeConfig(workspaceRoot);
  const rpcUrl = process.env.DEPLOY_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.TC_RPC_URL ?? config.rpcUrl;
  if (!rpcUrl) {
    throw new Error("No RPC URL configured. Set DEPLOY_RPC_URL, BASE_SEPOLIA_RPC_URL, or TC_RPC_URL.");
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = Number(await client.getChainId());

  const trustRegistry = optionalAddress(process.env.TRUST_REGISTRY_ADDRESS) ?? config.addresses?.trustRegistry ?? null;
  const covenant = optionalAddress(process.env.COVENANT_ADDRESS) ?? config.addresses?.covenant ?? null;
  const stakeTokenAddress =
    optionalAddress(process.env.STAKE_TOKEN_ADDRESS) ??
    optionalAddress(process.env.PAYMENT_TOKEN_ADDRESS) ??
    config.addresses?.token ??
    null;
  const paymentTokenAddress =
    optionalAddress(process.env.PAYMENT_TOKEN_ADDRESS) ??
    optionalAddress(process.env.STAKE_TOKEN_ADDRESS) ??
    config.addresses?.token ??
    null;

  if (requireContracts && (!trustRegistry || !covenant || !stakeTokenAddress || !paymentTokenAddress)) {
    throw new Error(
      "Public runtime contracts are incomplete. Set TRUST_REGISTRY_ADDRESS, COVENANT_ADDRESS, STAKE_TOKEN_ADDRESS, and PAYMENT_TOKEN_ADDRESS."
    );
  }

  const nextConfig: RuntimeConfig = {
    ...config,
    rpcUrl,
    chainId,
    addresses:
      trustRegistry && covenant && stakeTokenAddress
        ? {
            token: stakeTokenAddress,
            trustRegistry,
            covenant
          }
        : config.addresses
  };

  persistRuntimeConfig(nextConfig);

  return {
    config: nextConfig,
    rpcUrl,
    chainId,
    client,
    stakeTokenAddress,
    paymentTokenAddress
  };
}
