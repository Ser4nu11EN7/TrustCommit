import fs from "node:fs";
import path from "node:path";

export interface ContractArtifact {
  abi: readonly unknown[];
  bytecode: { object: `0x${string}` };
}

export function loadContractArtifact(workspaceRoot: string, relativePath: string): ContractArtifact {
  const fullPath = path.join(workspaceRoot, "out", relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as ContractArtifact;
}
