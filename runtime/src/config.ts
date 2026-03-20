import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AccountConfig, RuntimeConfig } from "./core/types.js";

dotenv.config();

const DEFAULT_DATA_DIR = ".trustcommit";

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
  const dataDir = path.join(workspaceRoot, DEFAULT_DATA_DIR);
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

  return {
    workspaceRoot,
    dataDir,
    dbPath,
    artifactDir,
    rpcUrl: process.env.TC_RPC_URL ?? persisted.rpcUrl ?? "http://127.0.0.1:8545",
    primaryProvider: (process.env.TC_PRIMARY_PROVIDER as RuntimeConfig["primaryProvider"]) ?? persisted.primaryProvider ?? "mock",
    fallbackProvider:
      (process.env.TC_FALLBACK_PROVIDER as RuntimeConfig["fallbackProvider"]) ?? persisted.fallbackProvider ?? "mock",
    chainId: persisted.chainId,
    addresses: persisted.addresses,
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
