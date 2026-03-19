import fs from "node:fs";
import path from "node:path";
import type { AgentLog, ArtifactEnvelope, ExecutionPlan, RunRecord, TaskRecord } from "../core/types.js";
import { ProviderRouter } from "../providers/router.js";
import { buildWorkspaceEvidence } from "../tools/workspace-evidence.js";
import { hashJson } from "../utils/hash.js";
import { makeId } from "../utils/id.js";

export class ExecutorAgent {
  public constructor(
    private readonly providers: ProviderRouter,
    private readonly workspaceRoot: string,
    private readonly artifactDir: string,
    private receiptContext: {
      trustRegistry: `0x${string}` | null;
      operator: `0x${string}` | null;
    } = {
      trustRegistry: null,
      operator: null
    }
  ) {}

  public setReceiptContext(context: { trustRegistry: `0x${string}` | null; operator: `0x${string}` | null }): void {
    this.receiptContext = context;
  }

  public async executeTask(task: TaskRecord): Promise<{
    run: RunRecord;
    artifact: ArtifactEnvelope;
    proofHash: `0x${string}`;
    artifactPath: string;
    agentLog: AgentLog;
    logPath: string;
  }> {
    const startedAt = Date.now();
    const evidence = buildWorkspaceEvidence(task, this.workspaceRoot);
    const baseRepoContext = {
      workspaceRoot: evidence.workspaceRoot,
      fileCount: evidence.fileCount,
      topFiles: evidence.topFiles,
      inspectedFiles: evidence.files.map((file) => ({
        path: file.path,
        contentHash: file.contentHash,
        excerpt: file.excerpt,
        bytes: file.bytes
      }))
    };
    const outputSchema = JSON.parse(task.outputSchemaJson) as Record<string, string>;
    const planResult = await this.providers.generateExecutionPlan(task, baseRepoContext, {
      systemPrompt:
        "You are the executor planner for TrustCommit. Produce a concise grounded execution plan with success criteria based only on the provided workspace evidence.",
      userPrompt:
        "Create a JSON execution plan for this task. Keep it practical, evidence-grounded, and suitable for a maximum of two execution attempts."
    });
    const plan = normalizeExecutionPlan(planResult.value, evidence.files.map((file) => file.path));
    const inspection = inspectPreconditions(task, outputSchema, evidence.files.map((file) => file.path));
    if (!inspection.ok) {
      throw new Error(`Executor precondition check failed: ${inspection.issues.join("; ")}`);
    }

    const attempts: AttemptRecord[] = [];
    let latestProvider = planResult.provider;
    let latestModel = planResult.model;
    let artifact: ArtifactEnvelope | null = null;
    let proofHash: `0x${string}` | null = null;
    let artifactPath: string | null = null;
    let verification: AgentLog["verification"] | null = null;

    for (let attemptIndex = 0; attemptIndex < plan.maxAttempts; attemptIndex += 1) {
      const previousAttempt = attempts.at(-1);
      const attemptResult = await this.providers.generateArtifact(task, {
        ...baseRepoContext,
        plan,
        attemptNumber: attemptIndex + 1,
        previousFailure: previousAttempt?.verification.notes.join("; ") ?? null
      }, {
      systemPrompt:
          "You are the executor agent for TrustCommit. Produce a concise structured artifact that can be hashed and committed onchain. Ground the artifact in the inspected file evidence and execution plan you were given.",
      userPrompt:
          "Execute the task against the local workspace context and return a JSON artifact with useful structured fields. Only claim evidence from files that appear in the inspectedFiles input. If a previous attempt failed verification, address that feedback explicitly."
      });

      latestProvider = attemptResult.provider;
      latestModel = attemptResult.model;
      const candidateArtifact: ArtifactEnvelope = {
        schemaVersion: "v1",
        taskId: task.id,
        producedBy: "executor",
        createdAt: Date.now(),
        payload: attemptResult.value
      };

      const candidateVerification = verifyArtifactPayload(candidateArtifact.payload, outputSchema, evidence.files.map((file) => file.path), plan);
      attempts.push({
        attemptNumber: attemptIndex + 1,
        provider: attemptResult.provider,
        model: attemptResult.model,
        artifact: candidateArtifact,
        verification: candidateVerification
      });

      artifact = candidateArtifact;
      verification = candidateVerification;
      if (candidateVerification.schemaSatisfied && candidateVerification.notes.length === 0) {
        break;
      }
    }

    if (!artifact || !verification) {
      throw new Error("Executor failed to produce an artifact");
    }

    const taskDir = path.join(this.artifactDir, task.id);
    fs.mkdirSync(taskDir, { recursive: true });
    artifactPath = path.join(taskDir, "artifact.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    proofHash = hashJson(artifact);
    const logPath = path.join(taskDir, "agent_log.json");
    const agentLog: AgentLog = {
      schemaVersion: "v1",
      taskId: task.id,
      role: "executor",
      provider: latestProvider,
      model: latestModel,
      startedAt,
      completedAt: Date.now(),
      task: {
        title: task.title,
        instructions: task.instructions,
        outputSchema,
        covenantId: task.covenantId,
        taskHash: task.taskHash
      },
      evidence,
      plan,
      verification,
      budget: {
        policy: [
          "Execution plans are capped to two artifact attempts.",
          "Workspace evidence is fixed before model generation begins.",
          "Only inspected files may appear in the final receipt trail."
        ],
        attemptsAllowed: plan.maxAttempts,
        attemptsUsed: attempts.length,
        modelCalls: 1 + attempts.length,
        verificationPasses: attempts.length,
        evidenceFilesConsidered: evidence.files.length
      },
      guardrails: {
        preExecution: [
          "Reject empty task instructions.",
          "Reject empty output schemas.",
          "Abort if no workspace evidence can be inspected."
        ],
        duringExecution: [
          "Restrict evidence references to inspected workspace files.",
          "Retry only after verification feedback and never exceed the attempt cap.",
          "Keep execution grounded in the precomputed evidence set."
        ],
        preCommit: [
          "Require expected schema fields before a clean verification pass.",
          "Hash the canonical artifact JSON before onchain submission.",
          "Persist artifact.json and agent_log.json before returning a proof hash."
        ]
      },
      receiptChain: {
        identityLayer: {
          trustRegistry: this.receiptContext.trustRegistry,
          operator: this.receiptContext.operator
        },
        taskCommitment: {
          taskHash: task.taskHash,
          covenantId: task.covenantId
        },
        executionArtifacts: {
          artifactPath,
          logPath
        },
        onchain: {
          proofHash,
          submitTxHash: null,
          finalizeTxHash: null,
          disputeTxHash: null,
          resolveTxHash: null
        }
      },
      artifactPath,
      proofHash,
      steps: [
        {
          id: "task_ingest",
          type: "task_ingest",
          status: "completed",
          observedAt: startedAt,
          summary: "Loaded the covenant-backed task requirements and expected output schema.",
          inputs: {
            title: task.title,
            covenantId: task.covenantId,
            taskHash: task.taskHash
          },
          outputs: {
            requiredFields: Object.keys(outputSchema)
          }
        },
        {
          id: "execution_plan",
          type: "execution_plan",
          status: "completed",
          observedAt: startedAt + 1,
          summary: "Built a grounded execution plan with explicit success criteria before artifact generation.",
          outputs: {
            summary: plan.summary,
            steps: plan.steps,
            successCriteria: plan.successCriteria,
            evidenceFocus: plan.evidenceFocus,
            maxAttempts: plan.maxAttempts
          }
        },
        {
          id: "workspace_inspection",
          type: "workspace_inspection",
          status: "completed",
          observedAt: evidence.observedAt,
          summary: "Inspected workspace files and recorded content hashes before generating the artifact.",
          outputs: {
            inspectedFileCount: evidence.files.length,
            preconditions: inspection
          },
          evidenceRefs: evidence.files.map((file) => file.path)
        },
        ...attempts.flatMap((attempt, index) => {
          const attemptBase = evidence.observedAt + 1 + index * 3;
          const steps: AgentLog["steps"] = [
            {
              id: `artifact_generation_${attempt.attemptNumber}`,
              type: "artifact_generation",
              status: "completed",
              observedAt: attemptBase,
              summary:
                attempt.attemptNumber === 1
                  ? "Generated the first artifact candidate from the grounded plan and evidence."
                  : `Generated corrected artifact attempt ${attempt.attemptNumber} after verification feedback.`,
              inputs: {
                provider: attempt.provider,
                model: attempt.model,
                attemptNumber: attempt.attemptNumber
              },
              outputs: {
                artifactFields: Object.keys(attempt.artifact.payload)
              },
              evidenceRefs: evidence.files.map((file) => file.path)
            },
            {
              id: `artifact_verification_${attempt.attemptNumber}`,
              type: "artifact_verification",
              status: "completed",
              observedAt: attemptBase + 1,
              summary: "Checked the generated artifact against schema, evidence scope, and plan success criteria.",
              outputs: attempt.verification
            }
          ];

          if (attempt.attemptNumber < attempts.length) {
            steps.push({
              id: `artifact_retry_${attempt.attemptNumber + 1}`,
              type: "artifact_retry",
              status: "completed",
              observedAt: attemptBase + 2,
              summary: `Verification requested another attempt because issues remained after attempt ${attempt.attemptNumber}.`,
              outputs: {
                retryReason: attempt.verification.notes
              }
            });
          }

          return steps;
        }),
        {
          id: "proof_submission",
          type: "proof_submission",
          status: "completed",
          observedAt: evidence.observedAt + 10,
          summary: "Prepared the canonical artifact hash for onchain submission.",
          outputs: {
            proofHash
          }
        }
      ]
    };
    fs.writeFileSync(logPath, JSON.stringify(agentLog, null, 2));

    const now = Date.now();
    const run: RunRecord = {
      id: makeId("run"),
      taskId: task.id,
      agentRole: "executor",
      provider: latestProvider,
      model: latestModel,
      status: "completed",
      inputJson: JSON.stringify({
        taskHash: task.taskHash,
        plan,
        inspectedFiles: evidence.files.map((file) => ({
          path: file.path,
          contentHash: file.contentHash
        }))
      }),
      logPath,
      outputJson: JSON.stringify(artifact.payload),
      error: null,
      createdAt: now,
      updatedAt: now
    };

    return { run, artifact, proofHash, artifactPath, agentLog, logPath };
  }
}

interface AttemptRecord {
  attemptNumber: number;
  provider: string;
  model: string;
  artifact: ArtifactEnvelope;
  verification: AgentLog["verification"];
}

function normalizeExecutionPlan(plan: ExecutionPlan, availableEvidence: string[]): ExecutionPlan {
  const evidenceFocus = Array.isArray(plan.evidenceFocus)
    ? plan.evidenceFocus.filter((path) => availableEvidence.includes(path)).slice(0, 4)
    : [];
  return {
    summary: typeof plan.summary === "string" && plan.summary.trim() ? plan.summary.trim() : "Produce a grounded artifact from the inspected evidence.",
    steps: Array.isArray(plan.steps) && plan.steps.length > 0
      ? plan.steps.filter((step): step is string => typeof step === "string" && !!step.trim()).slice(0, 5)
      : ["Inspect the evidence set.", "Generate a grounded artifact.", "Verify it against the task requirements."],
    successCriteria: Array.isArray(plan.successCriteria) && plan.successCriteria.length > 0
      ? plan.successCriteria.filter((criterion): criterion is string => typeof criterion === "string" && !!criterion.trim()).slice(0, 5)
      : ["All required schema fields are present.", "Only inspected files are referenced."],
    evidenceFocus,
    maxAttempts:
      typeof plan.maxAttempts === "number" && Number.isFinite(plan.maxAttempts)
        ? Math.max(1, Math.min(2, Math.round(plan.maxAttempts)))
        : 2
  };
}

function inspectPreconditions(task: TaskRecord, outputSchema: Record<string, string>, inspectedPaths: string[]) {
  const issues: string[] = [];
  if (inspectedPaths.length === 0) {
    issues.push("No inspected files were available.");
  }
  if (Object.keys(outputSchema).length === 0) {
    issues.push("Task output schema is empty.");
  }
  if (!task.instructions.trim()) {
    issues.push("Task instructions were empty.");
  }
  return {
    ok: issues.length === 0,
    issues,
    inspectedPaths
  };
}

function verifyArtifactPayload(
  payload: Record<string, unknown>,
  outputSchema: Record<string, string>,
  inspectedPaths: string[],
  plan: ExecutionPlan
): AgentLog["verification"] {
  const missingFields = Object.keys(outputSchema).filter((key) => !(key in payload));
  const notes: string[] = [];
  if (typeof payload.summary !== "string" || payload.summary.trim().length < 20) {
    notes.push("Artifact summary was too short to be credible.");
  }
  if (!Array.isArray(payload.notes) || payload.notes.length === 0) {
    notes.push("Artifact notes were missing.");
  }
  if ("inspectedFiles" in payload && Array.isArray(payload.inspectedFiles)) {
    const inspectedFiles = payload.inspectedFiles
      .map((value) => {
        if (typeof value === "string") {
          return value;
        }
        if (typeof value === "object" && value && "path" in value && typeof value.path === "string") {
          return value.path;
        }
        return null;
      })
      .filter((value): value is string => value !== null);
    const unknownPaths = inspectedFiles.filter((value) => !inspectedPaths.includes(value));
    if (unknownPaths.length > 0) {
      notes.push(`Artifact referenced files outside the inspected evidence set: ${unknownPaths.join(", ")}`);
    }
  } else {
    notes.push("Artifact did not include an inspectedFiles field.");
  }
  if (plan.evidenceFocus.length > 0 && Array.isArray(payload.inspectedFiles)) {
    const inspectedFiles = payload.inspectedFiles
      .map((value) => {
        if (typeof value === "string") {
          return value;
        }
        if (typeof value === "object" && value && "path" in value && typeof value.path === "string") {
          return value.path;
        }
        return null;
      })
      .filter((value): value is string => value !== null);
    const focusedMatches = plan.evidenceFocus.filter((path) => inspectedFiles.includes(path));
    if (focusedMatches.length === 0) {
      notes.push("Artifact did not incorporate any of the plan's evidence focus files.");
    }
  }

  return {
    schemaSatisfied: missingFields.length === 0 && notes.length === 0,
    missingFields,
    notes
  };
}
