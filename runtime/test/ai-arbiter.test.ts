import test from "node:test";
import assert from "node:assert/strict";
import { AiArbiter } from "../src/agents/ai-arbiter.js";
import { ProviderRouter } from "../src/providers/router.js";
import type {
  ArbiterDecision,
  ExecutionPlan,
  GeneratedTaskPlan,
  ModelProvider,
  ProviderContext,
  TaskRecord,
  TaskSpec
} from "../src/core/types.js";

class FakeArbiterProvider implements ModelProvider {
  public readonly name = "mock" as const;

  public async generateTaskPlan(input: TaskSpec, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "arbiter-mock",
      value: input satisfies GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(_task: TaskRecord, _repoContext: Record<string, unknown>, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "arbiter-mock",
      value: {
        summary: "stub",
        steps: ["inspect"],
        successCriteria: ["return json"],
        evidenceFocus: [],
        maxAttempts: 1
      } satisfies ExecutionPlan
    };
  }

  public async generateArtifact(_task: TaskRecord, _repoContext: Record<string, unknown>, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "arbiter-mock",
      value: {
        summary: "stub"
      }
    };
  }

  public async generateArbiterDecision(
    _task: TaskRecord,
    reviewContext: Record<string, unknown>,
    _context: ProviderContext
  ) {
    return {
      provider: "mock",
      model: "arbiter-mock",
      value: {
        winner: reviewContext.agentVerification && (reviewContext.agentVerification as { schemaSatisfied?: boolean }).schemaSatisfied
          ? "executor"
          : "creator",
        reason: "The structured receipt trail did not justify settlement in favor of the executor.",
        confidence: "high",
        rationale: [
          "Dispute reason was reviewed.",
          "Verification snapshot did not justify automatic executor settlement."
        ]
      } satisfies Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">
    };
  }
}

test("ai arbiter returns a structured accountable decision", async () => {
  const router = new ProviderRouter("mock", "mock", {
    mock: new FakeArbiterProvider()
  });
  const arbiter = new AiArbiter(router);
  const task: TaskRecord = {
    id: "task_arbiter",
    title: "Review disputed covenant",
    instructions: "Decide whether the receipt trail is good enough.",
    outputSchemaJson: "{\"summary\":\"string\"}",
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "disputed",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    taskHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const result = await arbiter.decide(task, {
    disputeRecord: {
      schemaVersion: "v1",
      taskId: task.id,
      reason: "Creator disputed the quality of the receipt trail.",
      evidenceHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
      createdAt: Date.now(),
      txHash: "0x5555555555555555555555555555555555555555555555555555555555555555"
    },
    disputeEvidence: {
      schemaVersion: "v1",
      taskId: task.id,
      reason: "Creator disputed the quality of the receipt trail.",
      createdAt: Date.now(),
      taskSnapshot: {
        status: "disputed",
        covenantId: task.covenantId,
        taskHash: task.taskHash,
        proofHash: task.proofHash
      },
      artifactSnapshot: {
        artifactPath: "artifact.json",
        summary: "Receipt trail looked incomplete.",
        payloadHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
        proofBundleHash: "0xabababababababababababababababababababababababababababababababab"
      },
      verificationSnapshot: {
        profile: "baseline",
        schemaSatisfied: false,
        missingFields: ["summary"],
        notes: ["Schema verification failed."],
        validatorResults: []
      },
      executionEvidence: {
        inspectedFiles: [],
        budget: null,
        guardrails: null
      },
      receiptSnapshot: {
        createTxHash: null,
        submitTxHash: null,
        finalizeTxHash: null,
        disputeTxHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
        resolveTxHash: null
      },
      receiptHeadHash: null,
      chainActions: [],
      evidencePacks: []
    },
    agentLog: {
      schemaVersion: "v1",
      taskId: task.id,
      role: "executor",
      provider: "mock",
      model: "mock",
      startedAt: Date.now(),
      completedAt: Date.now(),
      task: {
        title: task.title,
        instructions: task.instructions,
        outputSchema: { summary: "string" },
        covenantId: task.covenantId,
        taskHash: task.taskHash
      },
      evidence: {
        schemaVersion: "v1",
        taskId: task.id,
        workspaceRoot: "C:/demo",
        observedAt: Date.now(),
        topFiles: ["README.md"],
        fileCount: 1,
        files: []
      },
      plan: {
        summary: "Inspect then generate",
        steps: ["inspect", "generate"],
        successCriteria: ["schema present"],
        evidenceFocus: ["README.md"],
        maxAttempts: 2
      },
      verification: {
        profile: "baseline",
        schemaSatisfied: false,
        missingFields: ["summary"],
        notes: ["Schema verification failed."],
        validatorResults: [
          {
            name: "schema_presence",
            passed: false,
            details: "Schema verification failed."
          }
        ]
      },
      budget: {
        policy: [],
        attemptsAllowed: 2,
        attemptsUsed: 1,
        modelCalls: 2,
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
          trustRegistry: "0x6666666666666666666666666666666666666666666666666666666666666666",
          operator: "0x7777777777777777777777777777777777777777"
        },
        taskCommitment: {
          taskHash: task.taskHash,
          covenantId: task.covenantId
        },
        executionArtifacts: {
          artifactPath: "artifact.json",
          logPath: "agent_log.json",
          proofBundlePath: "proof_bundle.json"
        },
        onchain: {
          proofHash: task.proofHash!,
          artifactHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
          submitTxHash: null,
          finalizeTxHash: null,
          disputeTxHash: null,
          resolveTxHash: null
        }
      },
      artifactPath: "artifact.json",
      proofHash: task.proofHash!,
      steps: []
    },
    artifactPayload: {
      summary: "Receipt trail looked incomplete."
    },
    proofBundle: {
      schemaVersion: "v1",
      taskId: task.id,
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      artifactHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      verificationHash: "0xdededededededededededededededededededededededededededededededede",
      evidenceRoot: "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
      planHash: "0x1212121212121212121212121212121212121212121212121212121212121212",
      budgetHash: "0x1313131313131313131313131313131313131313131313131313131313131313",
      guardrailsHash: "0x1414141414141414141414141414141414141414141414141414141414141414",
      executionTrace: [
        {
          attemptNumber: 1,
          provider: "mock",
          model: "mock",
          artifactHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
          verificationHash: "0xdededededededededededededededededededededededededededededededede"
        }
      ],
      executionTraceHash: "0x1515151515151515151515151515151515151515151515151515151515151515",
      validatorResultsHash: "0x1616161616161616161616161616161616161616161616161616161616161616",
      artifactPath: "artifact.json",
      agentLogPath: "agent_log.json",
      createdAt: Date.now(),
      operatorAttestation: null,
      proofHash: task.proofHash!
    }
  });

  assert.equal(result.decision.reviewMode, "ai");
  assert.equal(result.decision.winner, "creator");
  assert.equal(result.decision.confidence, "high");
  assert.ok(result.decision.rationale.length >= 1);
  assert.equal(result.arbiterLog.decision.reviewMode, "ai");
  assert.equal(result.arbiterLog.disputeEvidence.artifactSnapshot.summary, "Receipt trail looked incomplete.");
  assert.equal(result.arbiterLog.disputeEvidence.evidencePacks.length, 0);
  assert.ok(result.resolutionHash.startsWith("0x"));
});
