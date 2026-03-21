import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AccountConfig, RuntimeConfig } from "./core/types.js";

dotenv.config();

const DEFAULT_DATA_DIR = ".trustcommit";

function resolveDataDir(workspaceRoot: string): string {
  if (process.env.TC_DATA_DIR) {
    return path.isAbsolute(process.env.TC_DATA_DIR)
      ? process.env.TC_DATA_DIR
      : path.join(workspaceRoot, process.env.TC_DATA_DIR);
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", "trustcommit");
  }

  return path.join(workspaceRoot, DEFAULT_DATA_DIR);
}

function envAddress(name: string): `0x${string}` | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  return value as `0x${string}`;
}

function envAccount(
  addressKey: string,
  privateKeyKey: string,
  fallback?: AccountConfig
): AccountConfig | undefined {
  const address = process.env[addressKey] as `0x${string}` | undefined;
  const privateKey = process.env[privateKeyKey] as `0x${string}` | undefined;
  if (!address && !privateKey) {
    return fallback;
  }
  if (!address) {
    throw new Error(`${addressKey} is required when ${privateKeyKey} is set.`);
  }
  return {
    address,
    privateKey: privateKey ?? fallback?.privateKey
  };
}

function hasAnyRuntimeAccountEnv(): boolean {
  return [
    "TC_DEPLOYER_ADDRESS",
    "TC_DEPLOYER_PRIVATE_KEY",
    "TC_CREATOR_ADDRESS",
    "TC_CREATOR_PRIVATE_KEY",
    "TC_EXECUTOR_ADDRESS",
    "TC_EXECUTOR_PRIVATE_KEY",
    "TC_EXECUTOR_OWNER_ADDRESS",
    "TC_EXECUTOR_OWNER_PRIVATE_KEY",
    "TC_EXECUTION_WALLET_ADDRESS",
    "TC_EXECUTION_WALLET_PRIVATE_KEY",
    "TC_ARBITER_ADDRESS",
    "TC_ARBITER_PRIVATE_KEY"
  ].some((key) => Boolean(process.env[key]));
}

export function resolveRuntimeConfig(workspaceRoot = process.cwd()): RuntimeConfig {
  const dataDir = resolveDataDir(workspaceRoot);
  const dbPath = path.join(dataDir, "runtime.db");
  const artifactDir = path.join(dataDir, "artifacts");
  const configPath = path.join(dataDir, "config.json");

  let persisted: Partial<RuntimeConfig> = {};
  if (fs.existsSync(configPath)) {
    persisted = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<RuntimeConfig>;
  }

  const persistedAccounts = persisted.accounts;

  const accounts = persistedAccounts || hasAnyRuntimeAccountEnv()
    ? {
        deployer: envAccount("TC_DEPLOYER_ADDRESS", "TC_DEPLOYER_PRIVATE_KEY", persistedAccounts?.deployer),
        creator: envAccount("TC_CREATOR_ADDRESS", "TC_CREATOR_PRIVATE_KEY", persistedAccounts?.creator),
        executor: envAccount("TC_EXECUTOR_ADDRESS", "TC_EXECUTOR_PRIVATE_KEY", persistedAccounts?.executor),
        executorOwner: envAccount(
          "TC_EXECUTOR_OWNER_ADDRESS",
          "TC_EXECUTOR_OWNER_PRIVATE_KEY",
          persistedAccounts?.executorOwner
        ),
        executionWallet: envAccount(
          "TC_EXECUTION_WALLET_ADDRESS",
          "TC_EXECUTION_WALLET_PRIVATE_KEY",
          persistedAccounts?.executionWallet
        ),
        arbiter: envAccount("TC_ARBITER_ADDRESS", "TC_ARBITER_PRIVATE_KEY", persistedAccounts?.arbiter)
      }
    : undefined;

  if (accounts && (!accounts.deployer || !accounts.creator || !accounts.executor || !accounts.arbiter)) {
    throw new Error("Runtime accounts are partially configured. Set deployer, creator, executor, and arbiter accounts together.");
  }

  const envToken = envAddress("PAYMENT_TOKEN_ADDRESS") ?? envAddress("STAKE_TOKEN_ADDRESS");
  const envTrustRegistry = envAddress("TRUST_REGISTRY_ADDRESS");
  const envCovenant = envAddress("COVENANT_ADDRESS");
  const addresses =
    envToken && envTrustRegistry && envCovenant
      ? {
          token: envToken,
          trustRegistry: envTrustRegistry,
          covenant: envCovenant
        }
      : persisted.addresses;

  return {
    workspaceRoot,
    dataDir,
    dbPath,
    artifactDir,
    rpcUrl: process.env.TC_RPC_URL ?? persisted.rpcUrl ?? "http://127.0.0.1:8545",
    chainId: process.env.TC_CHAIN_ID ? Number(process.env.TC_CHAIN_ID) : persisted.chainId,
    primaryProvider: (process.env.TC_PRIMARY_PROVIDER as RuntimeConfig["primaryProvider"]) ?? persisted.primaryProvider ?? "mock",
    fallbackProvider:
      (process.env.TC_FALLBACK_PROVIDER as RuntimeConfig["fallbackProvider"]) ?? persisted.fallbackProvider ?? "mock",
    addresses,
    accounts: accounts as RuntimeConfig["accounts"]
  };
}

export function ensureRuntimeDirectories(config: RuntimeConfig): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.artifactDir, { recursive: true });
}

export function persistRuntimeConfig(config: RuntimeConfig): void {
  ensureRuntimeDirectories(config);
  const configPath = path.join(config.dataDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
