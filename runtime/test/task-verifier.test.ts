import test from "node:test";
import assert from "node:assert/strict";
import { stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArtifactEnvelope, AgentLog, ProofBundleRecord, ReceiptEventRecord, ReceiptRecord, TaskDetails, TaskRecord } from "../src/core/types.js";
import { verifyTaskDetails } from "../src/verifier/task-verifier.js";
import { hashJson } from "../src/utils/hash.js";

const EXECUTOR = privateKeyToAccount("0x59c6995e998f97a5a0044976f7dc0a2a7f4d17a7f0ee06b6b24bdb6d0d6f315f");
const CREATOR = privateKeyToAccount("0x8b3a350cf5c34c9194ca3a545d68b54d58d7bf63f33dfb20259d2360e6a0e07a");

test("task verifier accepts a signed proof bundle and receipt chain", async () => {
  const details = await makeTaskDetails();
  const report = await verifyTaskDetails(details);

  assert.equal(report.status, "verified");
  assert.equal(report.summary.errors, 0);
  assert.ok(report.summary.passed > 10);
});

test("task verifier flags a tampered receipt chain", async () => {
  const details = await makeTaskDetails();
  details.receiptRecord = {
    ...details.receiptRecord!,
    headHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  };

  const report = await verifyTaskDetails(details);

  assert.equal(report.status, "flagged");
  assert.ok(report.checks.some((check) => check.name === "receiptRecord.headHash" && !check.passed));
});

async function makeTaskDetails(): Promise<TaskDetails> {
  const task: TaskRecord = {
    id: "task_verify",
    title: "Select a compliant vendor for the autonomous support queue",
    instructions: "Choose the compliant vendor and commit the accountable result.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      selectedVendor: "string",
      summary: "string",
      decisionReason: "string",
      budgetAssessment: "string",
      complianceChecks: "string[]",
      inspectedFiles: "string[]",
      notes: "string[]"
    }),
    reward: 10_000_000,
    requiredStake: 500_000_000,
    deadlineTs: 1,
    status: "completed",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: null,
    taskHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    artifactPath: ".trustcommit/artifacts/task_verify/artifact.json",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const artifact: ArtifactEnvelope = {
    schemaVersion: "v1",
    taskId: task.id,
    producedBy: "executor",
    createdAt: Date.now(),
    payload: {
      taskTitle: task.title,
      selectedVendor: "Vendor A",
      summary: "Vendor A stays within the monthly budget ceiling and meets logging plus retention controls.",
      decisionReason: "Vendor A is the only option that satisfies the procurement brief without budget overrun.",
      budgetAssessment: "Under ceiling",
      complianceChecks: ["99.95% uptime", "30-day retention", "structured audit exports"],
      inspectedFiles: ["demo-fixtures/procurement-brief.md", "demo-fixtures/vendor-a.json"],
      notes: ["Grounded in the inspected procurement fixtures."]
    }
  };

  const verification: AgentLog["verification"] = {
    profile: "baseline+structured_commitment+procurement_commitment",
    schemaSatisfied: true,
    missingFields: [],
    notes: [],
    validatorResults: [
      { name: "schema_presence", passed: true, details: "All required schema fields were present." },
      { name: "structured_task_title", passed: true, details: "taskTitle matched the commitment title." },
      { name: "procurement_vendor_selection", passed: true, details: "selectedVendor was provided." },
      { name: "procurement_budget_assessment", passed: true, details: "budgetAssessment was provided." }
    ]
  };

  const budget: AgentLog["budget"] = {
    policy: [
      "Execution plans are capped to two artifact attempts.",
      "Workspace evidence is fixed before model generation begins.",
      "Only inspected files may appear in the final receipt trail."
    ],
    attemptsAllowed: 2,
    attemptsUsed: 1,
    modelCalls: 2,
    verificationPasses: 1,
    evidenceFilesConsidered: 2
  };

  const guardrails: AgentLog["guardrails"] = {
    preExecution: ["Reject empty task instructions.", "Reject empty output schemas.", "Abort if no workspace evidence can be inspected."],
    duringExecution: ["Restrict evidence references to inspected workspace files.", "Retry only after verification feedback and never exceed the attempt cap.", "Keep execution grounded in the precomputed evidence set."],
    preCommit: ["Require expected schema fields before a clean verification pass.", "Hash the full proof bundle before onchain submission.", "Persist artifact.json, agent_log.json, and proof_bundle.json before returning a proof hash."]
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
      outputSchema: JSON.parse(task.outputSchemaJson) as Record<string, string>,
      covenantId: task.covenantId,
      taskHash: task.taskHash
    },
    evidence: {
      schemaVersion: "v1",
      taskId: task.id,
      workspaceRoot: "/workspace/trustcommit",
      observedAt: Date.now(),
      topFiles: ["demo-fixtures/procurement-brief.md", "demo-fixtures/vendor-a.json"],
      fileCount: 2,
      files: [
        {
          path: "demo-fixtures/procurement-brief.md",
          contentHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
          excerpt: "Budget ceiling is 10,000 mUSDC per month.",
          bytes: 128,
          observedAt: Date.now()
        },
        {
          path: "demo-fixtures/vendor-a.json",
          contentHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
          excerpt: "{\"vendor\":\"Vendor A\"}",
          bytes: 256,
          observedAt: Date.now()
        }
      ]
    },
    plan: {
      summary: "Inspect the procurement brief, compare vendor constraints, and choose the compliant option.",
      steps: ["Inspect the procurement brief.", "Compare vendor constraints.", "Return the compliant vendor decision."],
      successCriteria: ["All schema fields are present.", "Only inspected files are referenced."],
      evidenceFocus: ["demo-fixtures/procurement-brief.md", "demo-fixtures/vendor-a.json"],
      maxAttempts: 2
    },
    verification,
    budget,
    guardrails,
    receiptChain: {
      identityLayer: {
        trustRegistry: "0x5555555555555555555555555555555555555555555555555555555555555555",
        operator: EXECUTOR.address
      },
      taskCommitment: {
        taskHash: task.taskHash,
        covenantId: task.covenantId
      },
      executionArtifacts: {
        artifactPath: task.artifactPath!,
        logPath: ".trustcommit/artifacts/task_verify/agent_log.json",
        proofBundlePath: ".trustcommit/artifacts/task_verify/proof_bundle.json"
      },
      onchain: {
        acceptTxHash: "0x5656565656565656565656565656565656565656565656565656565656565656",
        proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        artifactHash: hashJson(artifact),
        submitTxHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
        finalizeTxHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
        disputeTxHash: null,
        resolveTxHash: null
      }
    },
    artifactPath: task.artifactPath!,
    proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    steps: []
  };

  const executionTrace = [
    {
      attemptNumber: 1,
      provider: "mock",
      model: "deterministic-mock",
      artifactHash: hashJson(artifact),
      verificationHash: hashJson(verification)
    }
  ];

  const proofBundleBase = {
    schemaVersion: "v1" as const,
    taskId: task.id,
    taskHash: task.taskHash,
    covenantId: task.covenantId,
    artifactHash: hashJson(artifact),
    verificationHash: hashJson(verification),
    evidenceRoot: hashJson(
      agentLog.evidence.files.map((file) => ({
        path: file.path,
        contentHash: file.contentHash
      }))
    ),
    planHash: hashJson(agentLog.plan),
    budgetHash: hashJson(budget),
    guardrailsHash: hashJson(guardrails),
    executionTrace,
    executionTraceHash: hashJson(executionTrace),
    validatorResultsHash: hashJson(verification.validatorResults),
    artifactPath: task.artifactPath!,
    agentLogPath: ".trustcommit/artifacts/task_verify/agent_log.json",
    createdAt: Date.now()
  };
  const proofHash = hashJson(proofBundleBase);
  task.proofHash = proofHash;
  agentLog.proofHash = proofHash;
  agentLog.receiptChain.onchain.proofHash = proofHash;

  const proofBundle: ProofBundleRecord = {
    ...proofBundleBase,
    operatorAttestation: await sign(EXECUTOR, "proof_bundle", proofHash),
    proofHash
  };

  const createEvent = await makeEvent({
    task,
    sequence: 1,
    event: "createCovenant",
    actor: "creator",
    txHash: "0x1010101010101010101010101010101010101010101010101010101010101010",
    prevHash: null,
    snapshot: {
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      proofHash: null
    },
    signer: CREATOR
  });
  const acceptEvent = await makeEvent({
    task,
    sequence: 2,
    event: "acceptCovenant",
    actor: "executor",
    txHash: "0x5656565656565656565656565656565656565656565656565656565656565656",
    prevHash: createEvent.eventHash,
    snapshot: {
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      proofHash
    },
    signer: EXECUTOR
  });
  const submitEvent = await makeEvent({
    task,
    sequence: 3,
    event: "submitCompletion",
    actor: "executor",
    txHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
    prevHash: acceptEvent.eventHash,
    snapshot: {
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      proofHash
    },
    signer: EXECUTOR
  });
  const finalizeEvent = await makeEvent({
    task,
    sequence: 4,
    event: "finalizeCompletion",
    actor: "deployer",
    txHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
    prevHash: submitEvent.eventHash,
    snapshot: {
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      proofHash
    },
    signer: EXECUTOR
  });

  const receiptEvents = [createEvent, acceptEvent, submitEvent, finalizeEvent];
  const receiptRecord: ReceiptRecord = {
    schemaVersion: "v2",
    taskId: task.id,
    taskHash: task.taskHash,
    covenantId: task.covenantId,
    proofHash,
    anchoredReceiptHead: submitEvent.eventHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    headHash: finalizeEvent.eventHash,
    eventCount: receiptEvents.length,
    eventFiles: [
      "receipt_events/001_createCovenant.json",
      "receipt_events/002_acceptCovenant.json",
      "receipt_events/003_submitCompletion.json",
      "receipt_events/004_finalizeCompletion.json"
    ],
    receipts: {
      createTxHash: createEvent.txHash,
      acceptTxHash: acceptEvent.txHash,
      submitTxHash: submitEvent.txHash,
      finalizeTxHash: finalizeEvent.txHash,
      disputeTxHash: null,
      resolveTxHash: null
    }
  };

  return {
    task,
    artifact,
    agentLog,
    proofBundle,
    chainContext: null,
    receiptRecord,
    receiptEvents,
    disputeRecord: null,
    disputeEvidence: null,
    resolutionRecord: null,
    arbiterLog: null,
    runs: [],
    chainActions: []
  };
}

async function makeEvent(input: {
  task: TaskRecord;
  sequence: number;
  event: ReceiptEventRecord["event"];
  actor: string;
  txHash: string;
  prevHash: `0x${string}` | null;
  snapshot: ReceiptEventRecord["snapshot"];
  signer: ReturnType<typeof privateKeyToAccount>;
}): Promise<ReceiptEventRecord> {
  const base = {
    schemaVersion: "v1" as const,
    taskId: input.task.id,
    sequence: input.sequence,
    event: input.event,
    actor: input.actor,
    txHash: input.txHash,
    createdAt: Date.now(),
    prevHash: input.prevHash,
    snapshot: input.snapshot,
    metadata: {}
  };
  const eventHash = hashJson(base);
  return {
    ...base,
    attestation: await sign(input.signer, input.event, eventHash),
    eventHash
  };
}

async function sign(account: ReturnType<typeof privateKeyToAccount>, purpose: string, payloadHash: `0x${string}`) {
  const statement = `TrustCommit:${purpose}:${payloadHash}`;
  return {
    signer: account.address,
    signedAt: Date.now(),
    scheme: "eip191" as const,
    purpose,
    statement,
    payloadHash,
    signature: await account.signMessage({
      message: { raw: stringToHex(statement) }
    })
  };
}
