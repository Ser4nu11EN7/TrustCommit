import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function findExecutableOnPath(candidates: string[]): string | null {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(entry, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function resolveForgePath(): string {
  if (process.env.FORGE_BIN && fs.existsSync(process.env.FORGE_BIN)) {
    return process.env.FORGE_BIN;
  }

  const homeCandidate =
    process.platform === "win32"
      ? path.join(os.homedir(), ".foundry", "bin", "forge.exe")
      : path.join(os.homedir(), ".foundry", "bin", "forge");

  if (fs.existsSync(homeCandidate)) {
    return homeCandidate;
  }

  const onPath = process.platform === "win32"
    ? findExecutableOnPath(["forge.exe", "forge.cmd", "forge.bat", "forge"])
    : findExecutableOnPath(["forge"]);

  if (!onPath) {
    throw new Error("Could not find forge. Set FORGE_BIN or add Foundry to PATH.");
  }

  return onPath;
}

const network = process.argv.includes("--network")
  ? process.argv[process.argv.indexOf("--network") + 1]
  : process.env.FORGE_NETWORK ?? "base_sepolia";

const rpcUrl = process.env.DEPLOY_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.TC_RPC_URL;

if (!rpcUrl) {
  throw new Error("No RPC URL configured. Set DEPLOY_RPC_URL, BASE_SEPOLIA_RPC_URL, or TC_RPC_URL.");
}

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is required for deployment.");
}

const args = [
  "script",
  "script/DeployTrustCommitStack.s.sol:DeployTrustCommitStack",
  "--rpc-url",
  network === "custom" ? rpcUrl : network,
  "--broadcast"
];

const result = spawnSync(resolveForgePath(), args, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL ?? rpcUrl
  }
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
