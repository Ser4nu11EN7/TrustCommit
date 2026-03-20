import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AgentLog,
  ArbiterReviewLog,
  PortableTaskBundleManifest,
  ProofBundleRecord,
  ReceiptRecord,
  TaskDetails,
  TaskRecord,
  TaskVerificationReport
} from "../src/core/types.js";
import { exportPortableTaskBundle } from "../src/exporters/task-bundle.js";

test("portable task bundle export strips local absolute paths and emits a manifest", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-export-workspace-"));
  const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-export-output-"));
  const snapshotPath = path.join(workspaceRoot, ".trustcommit", "artifacts", "task_export", "evidence_snapshots", "demo-fixtures", "brief.md");
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, "brief");

  const task: TaskRecord = {
    id: "task_export",
    title: "Export a portable receipt bundle",
    instructions: "Export a portable receipt bundle without leaking local machine paths.",
    outputSchemaJson: JSON.stringify({ summary: "string", inspectedFiles: "string[]", notes: "string[]" }),
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "completed",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    taskHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    artifactPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/artifact.json",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const agentLog: AgentLog = {
    schemaVersion: "v1",
    taskId: task.id,
    role: "executor",
    provider: "mock",
    model: "deterministic-mock",
    startedAt: Date.now(),
    completedAt: Date.now(),
    task: {
      title: task.title,
      instructions: task.instructions,
      outputSchema: { summary: "string", inspectedFiles: "string[]", notes: "string[]" },
      covenantId: task.covenantId,
      taskHash: task.taskHash
    },
    evidence: {
      schemaVersion: "v1",
      taskId: task.id,
      workspaceRoot,
      observedAt: Date.now(),
      topFiles: ["demo-fixtures/brief.md"],
      fileCount: 1,
      files: [
        {
          path: "demo-fixtures/brief.md",
          contentHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
          excerpt: "brief",
          bytes: 5,
          observedAt: Date.now(),
          snapshotPath: ".trustcommit/artifacts/task_export/evidence_snapshots/demo-fixtures/brief.md"
        }
      ]
    },
    plan: {
      summary: "Review the brief and export the portable bundle.",
      steps: ["Inspect", "Export"],
      successCriteria: ["Bundle is portable."],
      evidenceFocus: ["demo-fixtures/brief.md"],
      maxAttempts: 1
    },
    verification: {
      profile: "baseline",
      schemaSatisfied: true,
      missingFields: [],
      notes: [],
      validatorResults: []
    },
    budget: {
      policy: ["One attempt"],
      attemptsAllowed: 1,
      attemptsUsed: 1,
      modelCalls: 1,
      verificationPasses: 1,
      evidenceFilesConsidered: 1
    },
    guardrails: {
      preExecution: [],
      duringExecution: [],
      preCommit: []
    },
    receiptChain: {
      identityLayer: {
        trustRegistry: "0x5555555555555555555555555555555555555555555555555555555555555555",
        operator: "0x6666666666666666666666666666666666666666"
      },
      taskCommitment: {
        taskHash: task.taskHash,
        covenantId: task.covenantId
      },
      executionArtifacts: {
        artifactPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/artifact.json",
        logPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/agent_log.json",
        proofBundlePath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/proof_bundle.json"
      },
      onchain: {
        acceptTxHash: null,
        proofHash: task.proofHash!,
        artifactHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
        submitTxHash: null,
        finalizeTxHash: null,
        disputeTxHash: null,
        resolveTxHash: null
      }
    },
    artifactPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/artifact.json",
    proofHash: task.proofHash!,
    steps: []
  };

  const proofBundle: ProofBundleRecord = {
    schemaVersion: "v1",
    taskId: task.id,
    taskHash: task.taskHash,
    covenantId: task.covenantId,
    artifactHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
    verificationHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
    evidenceRoot: "0x9999999999999999999999999999999999999999999999999999999999999999",
    planHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    budgetHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    guardrailsHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    executionTrace: [],
    executionTraceHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    validatorResultsHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    artifactPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/artifact.json",
    agentLogPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/agent_log.json",
    createdAt: Date.now(),
    operatorAttestation: null,
    proofHash: task.proofHash!
  };

  const receiptRecord: ReceiptRecord = {
    schemaVersion: "v2",
    taskId: task.id,
    taskHash: task.taskHash,
    covenantId: task.covenantId,
    proofHash: task.proofHash!,
    anchoredReceiptHead: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    headHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    eventCount: 0,
    eventFiles: [],
    receipts: {
      createTxHash: null,
      acceptTxHash: null,
      submitTxHash: null,
      finalizeTxHash: null,
      disputeTxHash: null,
      resolveTxHash: null
    }
  };

  const arbiterLog: ArbiterReviewLog = {
    schemaVersion: "v1",
    taskId: task.id,
    provider: "mock",
    model: "deterministic-mock",
    createdAt: Date.now(),
    dispute: {
      reason: "none",
      evidenceHash: null
    },
    disputeEvidence: {
      verificationSnapshot: null,
      receiptSnapshot: receiptRecord.receipts,
      artifactSnapshot: {
        artifactPath: "C:/Users/SerEN/TrustCommit/.trustcommit/artifacts/task_export/artifact.json",
        summary: null,
        payloadHash: null,
        proofBundleHash: null
      },
      evidencePacks: []
    },
    verificationSnapshot: {
      profile: "baseline",
      schemaSatisfied: true,
      notes: [],
      proofHash: task.proofHash!
    },
    rawDecision: null,
    decision: {
      taskId: task.id,
      winner: "executor",
      reason: "Clean settlement.",
      createdAt: Date.now(),
      confidence: "high",
      rationale: ["All checks passed."],
      reviewMode: "manual"
    },
    settlementGuard: {
      applied: true,
      overridden: false,
      reasons: []
    },
    guardrails: [],
    resolutionHash: "0xabababababababababababababababababababababababababababababababab"
  };

  const verification: TaskVerificationReport = {
    schemaVersion: "v1",
    taskId: task.id,
    createdAt: Date.now(),
    status: "verified",
    summary: { passed: 1, warnings: 0, errors: 0, total: 1 },
    checks: []
  };

  const details: TaskDetails = {
    task,
    artifact: {
      schemaVersion: "v1",
      taskId: task.id,
      producedBy: "executor",
      createdAt: Date.now(),
      payload: {
        summary: "portable",
        inspectedFiles: ["demo-fixtures/brief.md"],
        notes: ["portable"]
      }
    },
    agentLog,
    proofBundle,
    chainContext: {
      schemaVersion: "v1",
      taskId: task.id,
      createdAt: Date.now(),
      chainId: 31337,
      rpcUrl: "http://127.0.0.1:8545",
      addresses: {
        token: "0x1111111111111111111111111111111111111111111111111111111111111111",
        trustRegistry: "0x2222222222222222222222222222222222222222222222222222222222222222",
        covenant: "0x3333333333333333333333333333333333333333333333333333333333333333"
      },
      actors: {
        deployer: "0x4444444444444444444444444444444444444444",
        creator: "0x5555555555555555555555555555555555555555",
        executorOwner: "0x6666666666666666666666666666666666666666",
        executionWallet: "0x7777777777777777777777777777777777777777",
        arbiter: "0x8888888888888888888888888888888888888888"
      }
    },
    receiptRecord,
    receiptEvents: [],
    disputeRecord: null,
    disputeEvidence: null,
    resolutionRecord: null,
    arbiterLog,
    runs: [],
    chainActions: []
  };

  const exported = exportPortableTaskBundle(details, verification, path.join(exportRoot, task.id));
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, "utf8")) as PortableTaskBundleManifest;
  const agentLogExport = fs.readFileSync(path.join(exported.outputDir, "agent_log.json"), "utf8");
  const proofBundleExport = fs.readFileSync(path.join(exported.outputDir, "proof_bundle.json"), "utf8");
  const chainContextExport = fs.readFileSync(path.join(exported.outputDir, "chain_context.json"), "utf8");
  const arbiterLogExport = fs.readFileSync(path.join(exported.outputDir, "arbiter_log.json"), "utf8");

  assert.equal(manifest.taskId, task.id);
  assert.ok(manifest.includedFiles.includes("portable_bundle.json"));
  assert.ok(fs.existsSync(path.join(exported.outputDir, ".trustcommit", "artifacts", "task_export", "evidence_snapshots", "demo-fixtures", "brief.md")));
  assert.equal(agentLogExport.includes("C:/Users/SerEN"), false);
  assert.equal(proofBundleExport.includes("C:/Users/SerEN"), false);
  assert.equal(chainContextExport.includes("127.0.0.1"), false);
  assert.equal(arbiterLogExport.includes("C:/Users/SerEN"), false);
});
