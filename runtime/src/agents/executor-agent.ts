import fs from "node:fs";
import path from "node:path";
import type { AgentLog, ArtifactEnvelope, ExecutionPlan, ExecutionTraceEntry, ProofBundleRecord, RunRecord, TaskRecord } from "../core/types.js";
import { ProviderRouter } from "../providers/router.js";
import { buildWorkspaceEvidence } from "../tools/workspace-evidence.js";
import { hashJson } from "../utils/hash.js";
import { makeId } from "../utils/id.js";
import { validateArtifact } from "../validators/profiles.js";

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
    proofBundlePath: string;
    agentLog: AgentLog;
    logPath: string;
  }> {
    const startedAt = Date.now();
    const taskDir = path.join(this.artifactDir, task.id);
    const evidenceSnapshotDir = path.join(taskDir, "evidence_snapshots");
    fs.mkdirSync(taskDir, { recursive: true });
    const evidence = buildWorkspaceEvidence(task, this.workspaceRoot, evidenceSnapshotDir);
    const evidencePolicy = parseEvidencePolicy(task.evidencePolicyJson);
    const baseRepoContext = {
      workspaceRoot: evidence.workspaceRoot,
      fileCount: evidence.fileCount,
      topFiles: evidence.topFiles,
      commitmentProfile: task.commitmentProfile ?? null,
      evidencePolicy,
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

      const candidateVerification = verifyArtifactPayload(
        task,
        candidateArtifact.payload,
        outputSchema,
        evidence.files,
        plan,
        this.workspaceRoot
      );
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
    if (!verification.schemaSatisfied || verification.notes.length > 0) {
      const reasons = [
        ...verification.missingFields.map((field) => `missing field: ${field}`),
        ...verification.notes
      ];
      throw new Error(
        `Executor verification gate blocked submission after ${attempts.length}/${plan.maxAttempts} attempts: ${reasons.join(
          "; "
        )}`
      );
    }

    artifactPath = path.join(taskDir, "artifact.json");
    const logPath = path.join(taskDir, "agent_log.json");
    const proofBundlePath = path.join(taskDir, "proof_bundle.json");
    const artifactFileRef = path.basename(artifactPath);
    const logFileRef = path.basename(logPath);
    const proofBundleFileRef = path.basename(proofBundlePath);
    const artifactHash = hashJson(artifact);
    const budget = {
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
    } satisfies AgentLog["budget"];
    const guardrails = {
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
        "Hash the full proof bundle before onchain submission.",
        "Persist artifact.json, agent_log.json, and proof_bundle.json before returning a proof hash."
      ]
    } satisfies AgentLog["guardrails"];
    const proofBundle = buildProofBundleRecord({
      task,
      artifact,
      artifactPath,
      logPath,
      evidence,
      plan,
      verification,
      attempts,
      budget,
      guardrails
    });
    proofHash = proofBundle.proofHash;
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
        taskHash: task.taskHash,
        commitmentProfile: task.commitmentProfile ?? null,
        evidencePolicy
      },
      evidence,
      plan,
      verification,
      budget,
      guardrails,
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
          artifactPath: artifactFileRef,
          logPath: logFileRef,
          proofBundlePath: proofBundleFileRef
        },
        onchain: {
          acceptTxHash: null,
          proofHash,
          artifactHash,
          submitTxHash: null,
          finalizeTxHash: null,
          disputeTxHash: null,
          resolveTxHash: null
        }
      },
      artifactPath: artifactFileRef,
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
          summary: "Prepared the full proof bundle hash for onchain submission.",
          outputs: {
            proofHash
          }
        }
      ]
    };
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    fs.writeFileSync(logPath, JSON.stringify(agentLog, null, 2));
    fs.writeFileSync(proofBundlePath, JSON.stringify(proofBundle, null, 2));

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

    return { run, artifact, proofHash, artifactPath, proofBundlePath, agentLog, logPath };
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
  task: TaskRecord,
  payload: Record<string, unknown>,
  outputSchema: Record<string, string>,
  evidenceFiles: AgentLog["evidence"]["files"],
  plan: ExecutionPlan,
  workspaceRoot: string
): AgentLog["verification"] {
  return validateArtifact({
    task,
    payload,
    outputSchema,
    evidenceFiles,
    plan,
    workspaceRoot
  });
}

function buildProofBundleRecord(input: {
  task: TaskRecord;
  artifact: ArtifactEnvelope;
  artifactPath: string;
  logPath: string;
  evidence: AgentLog["evidence"];
  plan: ExecutionPlan;
  verification: AgentLog["verification"];
  attempts: AttemptRecord[];
  budget: AgentLog["budget"];
  guardrails: AgentLog["guardrails"];
}): ProofBundleRecord {
  const createdAt = Date.now();
  const executionTrace: ExecutionTraceEntry[] = input.attempts.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    provider: attempt.provider,
    model: attempt.model,
    artifactHash: hashJson(attempt.artifact),
    verificationHash: hashJson(attempt.verification)
  }));
  const bundleBase = {
    schemaVersion: "v1" as const,
    taskId: input.task.id,
    taskHash: input.task.taskHash,
    covenantId: input.task.covenantId,
    artifactHash: hashJson(input.artifact),
    verificationHash: hashJson(input.verification),
    evidenceRoot: hashJson(
      input.evidence.files.map((file) => ({
        path: file.path,
        contentHash: file.contentHash
      }))
    ),
    planHash: hashJson(input.plan),
    budgetHash: hashJson(input.budget),
    guardrailsHash: hashJson(input.guardrails),
    executionTrace,
    executionTraceHash: hashJson(executionTrace),
    validatorResultsHash: hashJson(input.verification.validatorResults),
    artifactPath: path.basename(input.artifactPath),
    agentLogPath: path.basename(input.logPath),
    createdAt
  };
  const proofHash = hashJson(bundleBase);
  return {
    ...bundleBase,
    operatorAttestation: null,
    proofHash
  };
}

function parseEvidencePolicy(value: string | null | undefined): AgentLog["task"]["evidencePolicy"] {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NonNullable<AgentLog["task"]["evidencePolicy"]>>;
    const requiredPaths = Array.isArray(parsed.requiredPaths)
      ? [...new Set(parsed.requiredPaths.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))]
      : [];
    const rationale = Array.isArray(parsed.rationale)
      ? [...new Set(parsed.rationale.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))]
      : [];

    if (requiredPaths.length === 0 && rationale.length === 0) {
      return null;
    }

    return { requiredPaths, rationale };
  } catch {
    return null;
  }
}
