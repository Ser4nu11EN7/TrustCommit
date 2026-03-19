import fs from "node:fs";
import path from "node:path";
import type { AgentManifest, RuntimeConfig } from "../core/types.js";

export function buildAgentManifest(config: RuntimeConfig): AgentManifest {
  return {
    schemaVersion: "v1",
    name: "TrustCommit Executor",
    role: "executor",
    runtime: {
      name: "trustcommit-runtime",
      version: "0.1.0",
      providerStrategy: [config.primaryProvider, config.fallbackProvider]
    },
    operator: {
      address: config.accounts?.executor?.address ?? null
    },
    chains: {
      chainId: config.chainId ?? null,
      rpcUrl: config.rpcUrl,
      trustRegistry: config.addresses?.trustRegistry ?? null,
      covenant: config.addresses?.covenant ?? null
    },
    capabilities: [
      "create structured execution artifacts",
      "record workspace evidence hashes",
      "commit full proof bundles onchain",
      "sign proof bundles and receipt events",
      "export independently verifiable receipt trails",
      "submit covenant completion proofs",
      "support dispute review with inspectable logs"
    ],
    accountability: {
      taskCommitment: "covenant",
      identityStandard: "ERC-8004-compatible",
      proofFormat: "keccak256(canonical-proof-bundle)",
      disputeResolution: true,
      stakeBacked: true,
      receiptChain: [
        "agent identity",
        "covenant commitment",
        "artifact.json",
        "agent_log.json",
        "proof_bundle.json",
        "signed hash-chained receipt events",
        "onchain proof"
      ],
      exportedArtifacts: [
        "artifact.json",
        "agent_log.json",
        "proof_bundle.json",
        "receipt_record.json",
        "receipt_events/*.json",
        "dispute_evidence.json",
        "arbiter_log.json"
      ]
    }
  };
}

export function writeAgentManifest(config: RuntimeConfig, dataDir: string): string {
  const manifestPath = path.join(dataDir, "agent.json");
  fs.writeFileSync(manifestPath, JSON.stringify(buildAgentManifest(config), null, 2));
  return manifestPath;
}
