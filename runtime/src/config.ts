import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { RuntimeConfig } from "./core/types.js";

dotenv.config();

const DEFAULT_DATA_DIR = ".trustcommit";

export function resolveRuntimeConfig(workspaceRoot = process.cwd()): RuntimeConfig {
  const dataDir = path.join(workspaceRoot, DEFAULT_DATA_DIR);
  const dbPath = path.join(dataDir, "runtime.db");
  const artifactDir = path.join(dataDir, "artifacts");
  const configPath = path.join(dataDir, "config.json");

  let persisted: Partial<RuntimeConfig> = {};
  if (fs.existsSync(configPath)) {
    persisted = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<RuntimeConfig>;
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
    accounts: persisted.accounts
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
