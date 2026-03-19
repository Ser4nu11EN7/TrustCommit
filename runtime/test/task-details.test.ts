import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TrustCommitRuntime } from "../src/runtime.js";
import type { RunRecord, TaskRecord } from "../src/core/types.js";

test("task details loads dispute and resolution sidecars", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-runtime-"));
  const runtime = new TrustCommitRuntime(workspaceDir);
  await runtime.init();

  const task: TaskRecord = {
    id: "task_dispute",
    title: "Dispute demo",
    instructions: "Create an accountable dispute trail.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      summary: "string",
      inspectedFiles: "string[]",
      notes: "string[]"
    }),
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "slashed",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    taskHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    artifactPath: path.join(workspaceDir, ".trustcommit", "artifacts", "task_dispute", "artifact.json"),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  ((runtime as unknown as { store: { saveTask: (task: TaskRecord) => void; saveRun: (run: RunRecord) => void } }).store).saveTask(task);

  const taskDir = path.join(runtime.config.artifactDir, task.id);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    task.artifactPath!,
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        producedBy: "executor",
        createdAt: Date.now(),
        payload: {
          taskTitle: "Dispute demo",
          summary: "Receipt trail is present.",
          inspectedFiles: ["README.md"],
          notes: ["Evidence was recorded before arbitration."]
        }
      },
      null,
      2
    )
  );

  const logPath = path.join(taskDir, "agent_log.json");
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
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
          outputSchema: {
            taskTitle: "string",
            summary: "string",
            inspectedFiles: "string[]",
            notes: "string[]"
          },
          covenantId: task.covenantId,
          taskHash: task.taskHash
        },
        evidence: {
          schemaVersion: "v1",
          taskId: task.id,
          workspaceRoot: workspaceDir,
          observedAt: Date.now(),
          topFiles: ["README.md"],
          fileCount: 1,
          files: [
            {
              path: "README.md",
              contentHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
              excerpt: "demo",
              bytes: 4,
              observedAt: Date.now()
            }
          ]
        },
        plan: {
          summary: "Inspect then verify",
          steps: ["inspect", "verify"],
          successCriteria: ["receipt chain exists"],
          evidenceFocus: ["README.md"],
          maxAttempts: 2
        },
        verification: {
          profile: "baseline+procurement_commitment",
          schemaSatisfied: true,
          missingFields: [],
          notes: [],
          validatorResults: [
            {
              name: "fixture_validator",
              passed: true,
              details: "Fixture validation succeeded."
            }
          ]
        },
        budget: {
          policy: ["cap attempts"],
          attemptsAllowed: 2,
          attemptsUsed: 1,
          modelCalls: 2,
          verificationPasses: 1,
          evidenceFilesConsidered: 1
        },
        guardrails: {
          preExecution: ["require evidence"],
          duringExecution: ["stay grounded"],
          preCommit: ["persist logs before commit"]
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
          artifactPath: task.artifactPath,
          logPath,
          proofBundlePath: path.join(taskDir, "proof_bundle.json")
        },
        onchain: {
          proofHash: task.proofHash,
          artifactHash: "0xabababababababababababababababababababababababababababababababab",
          submitTxHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
          finalizeTxHash: null,
          disputeTxHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
            resolveTxHash: "0x9999999999999999999999999999999999999999999999999999999999999999"
          }
        },
        artifactPath: task.artifactPath,
        proofHash: task.proofHash,
        steps: []
      },
      null,
      2
    )
  );

  ((runtime as unknown as { store: { saveRun: (run: RunRecord) => void } }).store).saveRun({
    id: "run_dispute",
    taskId: task.id,
    agentRole: "executor",
    provider: "mock",
    model: "deterministic-mock",
    status: "completed",
    inputJson: "{}",
    logPath,
    outputJson: "{}",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  fs.writeFileSync(
    path.join(taskDir, "proof_bundle.json"),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        taskHash: task.taskHash,
        covenantId: task.covenantId,
        artifactHash: "0xabababababababababababababababababababababababababababababababab",
        verificationHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
        evidenceRoot: "0xdededededededededededededededededededededededededededededededede",
        planHash: "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
        budgetHash: "0x1212121212121212121212121212121212121212121212121212121212121212",
        guardrailsHash: "0x1313131313131313131313131313131313131313131313131313131313131313",
        executionTrace: [
          {
            attemptNumber: 1,
            provider: "mock",
            model: "deterministic-mock",
            artifactHash: "0xabababababababababababababababababababababababababababababababab",
            verificationHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"
          }
        ],
        executionTraceHash: "0x1414141414141414141414141414141414141414141414141414141414141414",
        validatorResultsHash: "0x1515151515151515151515151515151515151515151515151515151515151515",
        artifactPath: task.artifactPath,
        agentLogPath: logPath,
        createdAt: Date.now(),
        operatorAttestation: null,
        proofHash: task.proofHash
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(taskDir, "dispute.json"),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        reason: "Creator requested review.",
        evidenceHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: Date.now(),
        txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(taskDir, "dispute_evidence.json"),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        reason: "Creator requested review.",
        createdAt: Date.now(),
        taskSnapshot: {
          status: "disputed",
          covenantId: task.covenantId,
          taskHash: task.taskHash,
          proofHash: task.proofHash
        },
        artifactSnapshot: {
          artifactPath: task.artifactPath,
          summary: "Receipt trail is present.",
          payloadHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          proofBundleHash: task.proofHash
        },
        verificationSnapshot: {
          profile: "baseline+procurement_commitment",
          schemaSatisfied: true,
          missingFields: [],
          notes: [],
          validatorResults: []
        },
        executionEvidence: {
          inspectedFiles: [
            {
              path: "README.md",
              contentHash: "0x4444444444444444444444444444444444444444444444444444444444444444"
            }
          ],
          budget: null,
          guardrails: null
        },
        receiptSnapshot: {
          createTxHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
          submitTxHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
          finalizeTxHash: null,
          disputeTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          resolveTxHash: null
        },
        receiptHeadHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        chainActions: [
          {
            action: "submitCompletion",
            actor: "executor",
            txHash: "0x7777777777777777777777777777777777777777777777777777777777777777"
          }
        ],
        evidencePacks: [
          {
            schemaVersion: "v1",
            packType: "verification",
            label: "Deterministic verification and validator profile results",
            subject: "verification",
            payloadHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            facts: ["profile=baseline+procurement_commitment"],
            linkedArtifacts: ["agent_log.json", "proof_bundle.json"]
          }
        ]
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(taskDir, "resolution.json"),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        winner: "creator",
        reason: "Arbiter slashed the executor.",
        resolutionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        createdAt: Date.now(),
        txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        outcome: "slashed"
      },
      null,
      2
    )
  );
  const receiptEventFiles = [
    path.join("receipt_events", "001_createCovenant.json"),
    path.join("receipt_events", "002_submitCompletion.json")
  ];
  fs.mkdirSync(path.join(taskDir, "receipt_events"), { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, receiptEventFiles[0]),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        sequence: 1,
        event: "createCovenant",
        actor: "creator",
        txHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
        createdAt: Date.now(),
        prevHash: null,
        snapshot: {
          taskHash: task.taskHash,
          covenantId: task.covenantId,
          proofHash: null
        },
        metadata: {},
        attestation: null,
        eventHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(taskDir, receiptEventFiles[1]),
    JSON.stringify(
      {
        schemaVersion: "v1",
        taskId: task.id,
        sequence: 2,
        event: "submitCompletion",
        actor: "executor",
        txHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
        createdAt: Date.now(),
        prevHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        snapshot: {
          taskHash: task.taskHash,
          covenantId: task.covenantId,
          proofHash: task.proofHash
        },
        metadata: {},
        attestation: null,
        eventHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(taskDir, "receipt_record.json"),
    JSON.stringify(
      {
        schemaVersion: "v2",
        taskId: task.id,
        taskHash: task.taskHash,
        covenantId: task.covenantId,
        proofHash: task.proofHash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        headHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        eventCount: 2,
        eventFiles: receiptEventFiles,
        receipts: {
          createTxHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
          submitTxHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
          finalizeTxHash: null,
          disputeTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          resolveTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        }
      },
      null,
      2
    )
  );

  const details = runtime.getTaskDetails(task.id);

  assert.ok(details);
  assert.equal(details?.proofBundle?.proofHash, task.proofHash);
  assert.equal(details?.receiptRecord?.receipts.submitTxHash, "0x7777777777777777777777777777777777777777777777777777777777777777");
  assert.equal(details?.receiptEvents.length, 2);
  assert.equal(details?.disputeRecord?.reason, "Creator requested review.");
  assert.equal(details?.disputeEvidence?.artifactSnapshot.summary, "Receipt trail is present.");
  assert.equal(details?.disputeEvidence?.evidencePacks.length, 1);
  assert.equal(details?.resolutionRecord?.winner, "creator");
  assert.equal(details?.resolutionRecord?.outcome, "slashed");
  assert.equal(details?.agentLog?.receiptChain.onchain.disputeTxHash, "0x8888888888888888888888888888888888888888888888888888888888888888");
});
