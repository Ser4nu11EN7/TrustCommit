import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ExecutorAgent } from "../src/agents/executor-agent.js";
import type { ExecutionPlan, GeneratedTaskPlan, ModelProvider, ProviderContext, TaskRecord, TaskSpec } from "../src/core/types.js";
import { ProviderRouter } from "../src/providers/router.js";

class FakeProvider implements ModelProvider {
  public readonly name = "mock" as const;

  public async generateTaskPlan(input: TaskSpec, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "mock-test",
      value: {
        ...input
      } satisfies GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(_task: TaskRecord, repoContext: Record<string, unknown>, _context: ProviderContext) {
    const evidenceFocus = Array.isArray(repoContext.inspectedFiles)
      ? repoContext.inspectedFiles.map((file) => (file as { path: string }).path).slice(0, 2)
      : [];

    return {
      provider: "mock",
      model: "mock-test",
      value: {
        summary: "Plan a grounded summary using inspected workspace evidence.",
        steps: ["Inspect evidence", "Generate artifact", "Verify artifact"],
        successCriteria: ["All schema fields are present", "Only inspected files are referenced"],
        evidenceFocus,
        maxAttempts: 2
      } satisfies ExecutionPlan
    };
  }

  public async generateArtifact(task: TaskRecord, repoContext: Record<string, unknown>, _context: ProviderContext) {
    const inspectedFiles = Array.isArray(repoContext.inspectedFiles)
      ? repoContext.inspectedFiles.map((file) => (file as { path: string }).path)
      : [];

    return {
      provider: "mock",
      model: "mock-test",
      value: {
        taskTitle: task.title,
        summary: "Collected grounded evidence from the workspace.",
        inspectedFiles,
        notes: ["Generated from inspected repo evidence."]
      }
    };
  }
}

class BadArtifactProvider implements ModelProvider {
  public readonly name = "mock" as const;

  public async generateTaskPlan(input: TaskSpec, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "mock-test",
      value: {
        ...input
      } satisfies GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(_task: TaskRecord, repoContext: Record<string, unknown>, _context: ProviderContext) {
    const evidenceFocus = Array.isArray(repoContext.inspectedFiles)
      ? repoContext.inspectedFiles.map((file) => (file as { path: string }).path).slice(0, 2)
      : [];

    return {
      provider: "mock",
      model: "mock-test",
      value: {
        summary: "Plan a grounded summary using inspected workspace evidence.",
        steps: ["Inspect evidence", "Generate artifact", "Verify artifact"],
        successCriteria: ["All schema fields are present", "Only inspected files are referenced"],
        evidenceFocus,
        maxAttempts: 2
      } satisfies ExecutionPlan
    };
  }

  public async generateArtifact(_task: TaskRecord, _repoContext: Record<string, unknown>, _context: ProviderContext) {
    return {
      provider: "mock",
      model: "mock-test",
      value: {
        taskTitle: "Bad artifact",
        summary: "too short",
        inspectedFiles: ["NOT_INSPECTED.md"],
        notes: []
      }
    };
  }
}

test("executor agent exports artifact and grounded agent log", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-executor-"));
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo\nTrustCommit workspace.");
  fs.mkdirSync(path.join(workspaceDir, "runtime", "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "runtime", "src", "runtime.ts"), "export const runtime = true;\n");
  fs.writeFileSync(path.join(workspaceDir, "package.json"), "{\"name\":\"demo\"}\n");

  const artifactDir = path.join(workspaceDir, ".trustcommit", "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });

  const router = new ProviderRouter("mock", "mock", {
    mock: new FakeProvider()
  });
  const executor = new ExecutorAgent(router, workspaceDir, artifactDir);
  const task: TaskRecord = {
    id: "task_1",
    title: "Summarize the repo",
    instructions: "Inspect the local workspace and return a structured summary.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      summary: "string",
      inspectedFiles: "string[]",
      notes: "string[]"
    }),
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "created",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: null,
    taskHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const result = await executor.executeTask(task);
  const artifact = JSON.parse(fs.readFileSync(result.artifactPath, "utf8")) as { payload: { inspectedFiles: string[] } };
  const proofBundle = JSON.parse(
    fs.readFileSync(path.join(path.dirname(result.artifactPath), "proof_bundle.json"), "utf8")
  ) as { proofHash: string; artifactHash: string; executionTrace: Array<{ attemptNumber: number; provider: string; model: string; artifactHash: string; verificationHash: string }> };
  const agentLog = JSON.parse(fs.readFileSync(result.logPath, "utf8")) as {
    plan: { steps: string[]; maxAttempts: number };
    evidence: { files: Array<{ path: string; contentHash: string }> };
    verification: {
      schemaSatisfied: boolean;
      missingFields: string[];
      validatorResults: Array<{ name: string; passed: boolean }>;
    };
    budget: { attemptsUsed: number; modelCalls: number };
    guardrails: { preExecution: string[]; duringExecution: string[]; preCommit: string[] };
    receiptChain: {
      taskCommitment: { covenantId: string | null; taskHash: string | null };
      executionArtifacts: { proofBundlePath: string };
      onchain: { proofHash: string; artifactHash: string; submitTxHash: string | null };
    };
    steps: Array<{ type: string }>;
  };

  assert.ok(fs.existsSync(result.artifactPath));
  assert.ok(fs.existsSync(result.logPath));
  assert.ok(fs.existsSync(path.join(path.dirname(result.artifactPath), "proof_bundle.json")));
  assert.equal(result.run.logPath, result.logPath);
  assert.equal(agentLog.verification.schemaSatisfied, true);
  assert.deepEqual(agentLog.verification.missingFields, []);
  assert.ok(agentLog.verification.validatorResults.length >= 4);
  assert.ok(agentLog.evidence.files.length >= 2);
  assert.equal(agentLog.plan.maxAttempts, 2);
  assert.equal(agentLog.budget.attemptsUsed, 1);
  assert.equal(agentLog.budget.modelCalls, 2);
  assert.equal(agentLog.guardrails.preExecution.length, 3);
  assert.equal(agentLog.guardrails.duringExecution.length, 3);
  assert.equal(agentLog.guardrails.preCommit.length, 3);
  assert.equal(agentLog.receiptChain.taskCommitment.covenantId, task.covenantId);
  assert.equal(agentLog.receiptChain.taskCommitment.taskHash, task.taskHash);
  assert.ok(agentLog.receiptChain.onchain.proofHash.startsWith("0x"));
  assert.ok(agentLog.receiptChain.onchain.artifactHash.startsWith("0x"));
  assert.equal(agentLog.receiptChain.onchain.submitTxHash, null);
  assert.equal(agentLog.receiptChain.executionArtifacts.proofBundlePath.endsWith("proof_bundle.json"), true);
  assert.equal(proofBundle.proofHash, agentLog.receiptChain.onchain.proofHash);
  assert.equal(proofBundle.artifactHash, agentLog.receiptChain.onchain.artifactHash);
  assert.equal(proofBundle.executionTrace.length, 1);
  assert.equal(proofBundle.executionTrace[0]?.attemptNumber, 1);
  assert.equal(proofBundle.executionTrace[0]?.provider, "mock");
  assert.ok(agentLog.evidence.files.every((file) => file.contentHash.startsWith("0x")));
  assert.deepEqual(
    artifact.payload.inspectedFiles.sort(),
    agentLog.evidence.files.map((file) => file.path).sort()
  );
  assert.deepEqual(
    agentLog.steps.map((step) => step.type),
    ["task_ingest", "execution_plan", "workspace_inspection", "artifact_generation", "artifact_verification", "proof_submission"]
  );
});

test("executor agent blocks submission when verification never passes", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-executor-fail-"));
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo\nTrustCommit workspace.");
  fs.mkdirSync(path.join(workspaceDir, "runtime", "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "runtime", "src", "runtime.ts"), "export const runtime = true;\n");
  fs.writeFileSync(path.join(workspaceDir, "package.json"), "{\"name\":\"demo\"}\n");

  const artifactDir = path.join(workspaceDir, ".trustcommit", "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });

  const router = new ProviderRouter("mock", "mock", {
    mock: new BadArtifactProvider()
  });
  const executor = new ExecutorAgent(router, workspaceDir, artifactDir);
  const task: TaskRecord = {
    id: "task_fail",
    title: "Summarize the repo",
    instructions: "Inspect the local workspace and return a structured summary.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      summary: "string",
      inspectedFiles: "string[]",
      notes: "string[]"
    }),
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "created",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: null,
    taskHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await assert.rejects(
    () => executor.executeTask(task),
    /Executor verification gate blocked submission after 2\/2 attempts/
  );
  assert.equal(fs.existsSync(path.join(artifactDir, task.id, "artifact.json")), false);
});
