import fs from "node:fs";
import path from "node:path";
import type {
  AgentLog,
  ArbiterReviewLog,
  DisputeEvidenceRecord,
  PortableTaskBundleManifest,
  ProofBundleRecord,
  TaskChainContext,
  TaskDetails,
  TaskVerificationReport
} from "../core/types.js";
import { hashJson } from "../utils/hash.js";

export function exportPortableTaskBundle(
  details: TaskDetails,
  verification: TaskVerificationReport,
  outputDir: string
): { outputDir: string; manifestPath: string; manifest: PortableTaskBundleManifest } {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const includedFiles: string[] = [];
  const fileHashes: Record<string, `0x${string}`> = {};
  const writeJson = (relativePath: string, payload: unknown) => {
    const targetPath = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
    includedFiles.push(relativePath.replaceAll("\\", "/"));
    fileHashes[relativePath.replaceAll("\\", "/")] = hashJson(payload);
  };

  writeJson("task.json", details.task);
  writeJson("verification_report.json", verification);

  if (details.artifact) {
    writeJson("artifact.json", details.artifact);
  }
  if (details.agentLog) {
    writeJson("agent_log.json", sanitizeAgentLog(details.agentLog));
  }
  if (details.proofBundle) {
    writeJson("proof_bundle.json", sanitizeProofBundle(details.proofBundle));
  }
  if (details.chainContext) {
    writeJson("chain_context.json", sanitizeChainContext(details.chainContext));
  }
  if (details.receiptRecord) {
    writeJson("receipt_record.json", details.receiptRecord);
  }
  for (const [index, event] of details.receiptEvents.entries()) {
    writeJson(`receipt_events/${String(index + 1).padStart(3, "0")}_${event.event}.json`, event);
  }
  if (details.disputeRecord) {
    writeJson("dispute.json", details.disputeRecord);
  }
  if (details.disputeEvidence) {
    writeJson("dispute_evidence.json", sanitizeDisputeEvidence(details.disputeEvidence));
  }
  if (details.resolutionRecord) {
    writeJson("resolution.json", details.resolutionRecord);
  }
  if (details.arbiterLog) {
    writeJson("arbiter_log.json", sanitizeArbiterLog(details.arbiterLog));
  }

  copyEvidenceSnapshots(details, outputDir, includedFiles, fileHashes);

  const manifest: PortableTaskBundleManifest = {
    schemaVersion: "v1",
    taskId: details.task.id,
    exportedAt: Date.now(),
    verificationStatus: verification.status,
    proofHash: details.task.proofHash,
    receiptHead: details.receiptRecord?.headHash ?? null,
    chainId: details.chainContext?.chainId ?? null,
    covenantId: details.task.covenantId,
    includedFiles: [...includedFiles, "portable_bundle.json"],
    fileHashes
  };
  const manifestPath = path.join(outputDir, "portable_bundle.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  includedFiles.push("portable_bundle.json");
  fileHashes["portable_bundle.json"] = hashJson(manifest);

  return {
    outputDir,
    manifestPath,
    manifest
  };
}

function sanitizeAgentLog(agentLog: AgentLog): AgentLog {
  return {
    ...agentLog,
    evidence: {
      ...agentLog.evidence,
      workspaceRoot: "."
    },
    receiptChain: {
      ...agentLog.receiptChain,
      executionArtifacts: {
        artifactPath: "artifact.json",
        logPath: "agent_log.json",
        proofBundlePath: "proof_bundle.json"
      }
    },
    artifactPath: "artifact.json"
  };
}

function sanitizeProofBundle(proofBundle: ProofBundleRecord): ProofBundleRecord {
  return {
    ...proofBundle,
    artifactPath: "artifact.json",
    agentLogPath: "agent_log.json"
  };
}

function sanitizeDisputeEvidence(disputeEvidence: DisputeEvidenceRecord): DisputeEvidenceRecord {
  return {
    ...disputeEvidence,
    artifactSnapshot: {
      ...disputeEvidence.artifactSnapshot,
      artifactPath: disputeEvidence.artifactSnapshot.artifactPath ? "artifact.json" : null
    }
  };
}

function sanitizeArbiterLog(arbiterLog: ArbiterReviewLog): ArbiterReviewLog {
  return {
    ...arbiterLog,
    disputeEvidence: {
      ...arbiterLog.disputeEvidence,
      artifactSnapshot: {
        ...arbiterLog.disputeEvidence.artifactSnapshot,
        artifactPath: arbiterLog.disputeEvidence.artifactSnapshot.artifactPath ? "artifact.json" : null
      }
    }
  };
}

function sanitizeChainContext(chainContext: TaskChainContext): TaskChainContext {
  const isLocalRpc = /127\.0\.0\.1|localhost|anvil/i.test(chainContext.rpcUrl);
  return {
    ...chainContext,
    rpcUrl: isLocalRpc ? "redacted-local-rpc" : chainContext.rpcUrl
  };
}

function copyEvidenceSnapshots(
  details: TaskDetails,
  outputDir: string,
  includedFiles: string[],
  fileHashes: Record<string, `0x${string}`>
): void {
  for (const file of details.agentLog?.evidence.files ?? []) {
    if (!file.snapshotPath) {
      continue;
    }
    const relativeSnapshotPath = file.snapshotPath.replaceAll("\\", "/");
    const sourcePath = path.resolve(details.agentLog?.evidence.workspaceRoot ?? ".", file.snapshotPath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(outputDir, relativeSnapshotPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    includedFiles.push(relativeSnapshotPath);
    fileHashes[relativeSnapshotPath] = hashJson({
      path: file.path,
      contentHash: file.contentHash
    });
  }
}
