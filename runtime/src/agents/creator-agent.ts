import type { GeneratedTaskPlan, TaskRecord, TaskSpec } from "../core/types.js";
import { hashJson } from "../utils/hash.js";
import { makeId } from "../utils/id.js";
import { ProviderRouter } from "../providers/router.js";

export interface DraftTask {
  record: Omit<TaskRecord, "covenantId" | "proofHash" | "artifactPath">;
  deadlineHours: number;
}

export class CreatorAgent {
  public constructor(
    private readonly providers: ProviderRouter,
    private readonly executorAgentId = Number(process.env.TC_EXECUTOR_AGENT_ID ?? 1)
  ) {}

  public async createDraft(input: TaskSpec): Promise<DraftTask> {
    const result = await this.providers.generateTaskPlan(input, {
      systemPrompt:
        "You are the creator agent for TrustCommit. Normalize the task into a concise, structured covenant-friendly plan.",
      userPrompt:
        "Convert the incoming task spec into a structured task plan suitable for onchain creation. Keep reward/stake/deadline practical."
    });
    const plan = normalizeTaskPlan(input, result.value as Partial<GeneratedTaskPlan>);
    const commitmentProfile = normalizeCommitmentProfile(input.commitmentProfile ?? inferCommitmentProfile(plan));
    const evidencePolicy = normalizeEvidencePolicy(input.evidencePolicy ?? inferEvidencePolicy(commitmentProfile));
    const now = Date.now();
    const taskId = makeId("task");
    const taskHash = hashJson({
      title: plan.title,
      instructions: plan.instructions,
      outputSchema: plan.outputSchema,
      commitmentProfile,
      evidencePolicy
    });

    return {
      record: {
        id: taskId,
        title: plan.title,
        instructions: plan.instructions,
        outputSchemaJson: JSON.stringify(plan.outputSchema),
        reward: plan.reward,
        requiredStake: plan.requiredStake,
        deadlineTs: 0,
        status: "draft",
        executorAgentId: this.executorAgentId,
        createdBy: result.provider,
        commitmentProfile,
        evidencePolicyJson: evidencePolicy ? JSON.stringify(evidencePolicy) : null,
        taskHash,
        createdAt: now,
        updatedAt: now
      },
      deadlineHours: plan.deadlineHours
    };
  }
}

function normalizeTaskPlan(input: TaskSpec, candidate: Partial<GeneratedTaskPlan>): GeneratedTaskPlan {
  return {
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : input.title.trim(),
    instructions:
      typeof candidate.instructions === "string" && candidate.instructions.trim()
        ? candidate.instructions.trim()
        : input.instructions.trim(),
    outputSchema:
      candidate.outputSchema && typeof candidate.outputSchema === "object"
        ? sanitizeOutputSchema(candidate.outputSchema as Record<string, unknown>)
        : input.outputSchema,
    reward: toFiniteNumber(candidate.reward, input.reward),
    requiredStake: toFiniteNumber(candidate.requiredStake, input.requiredStake),
    deadlineHours: toFiniteNumber(candidate.deadlineHours, input.deadlineHours)
  };
}

function sanitizeOutputSchema(outputSchema: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(outputSchema).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : { summary: "string" };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function inferCommitmentProfile(plan: GeneratedTaskPlan): string | null {
  const titleAndInstructions = `${plan.title}\n${plan.instructions}`.toLowerCase();
  const schemaKeys = new Set(Object.keys(plan.outputSchema).map((key) => key.toLowerCase()));

  if (
    schemaKeys.has("selectedvendor") ||
    schemaKeys.has("budgetassessment") ||
    schemaKeys.has("compliancechecks") ||
    /vendor|procurement|quote|budget|retention|sla/.test(titleAndInstructions)
  ) {
    return "procurement_commitment";
  }

  if (
    schemaKeys.has("selectedplan") ||
    schemaKeys.has("filestomodify") ||
    schemaKeys.has("acceptancechecks") ||
    /remediation|patch plan|sanitize|audit logging|checkout/.test(titleAndInstructions)
  ) {
    return "remediation_commitment";
  }

  if (
    schemaKeys.has("selectedrequest") ||
    schemaKeys.has("policychecks") ||
    schemaKeys.has("requiredcontrols") ||
    /policy|access request|approval|tenant|pii|region|vendor access/.test(titleAndInstructions)
  ) {
    return "policy_commitment";
  }

  return "structured_commitment";
}

function inferEvidencePolicy(
  commitmentProfile: string | null
): { requiredPaths: string[]; rationale: string[] } | null {
  if (commitmentProfile === "procurement_commitment") {
    return {
      requiredPaths: [
        "demo-fixtures/procurement-brief.md",
        "demo-fixtures/vendor-a.quote.json",
        "demo-fixtures/vendor-b.quote.json",
        "demo-fixtures/vendor-c.quote.json"
      ],
      rationale: [
        "Vendor commitments must be grounded in the preserved procurement brief.",
        "Each inspected vendor quote must remain inside the evidence set for later dispute review."
      ]
    };
  }

  if (commitmentProfile === "remediation_commitment") {
    return {
      requiredPaths: [
        "demo-fixtures/remediation-brief.md",
        "demo-fixtures/patch-plan-a.json",
        "demo-fixtures/patch-plan-b.json"
      ],
      rationale: [
        "Remediation commitments must preserve the remediation brief alongside all candidate patch plans.",
        "Arbiter review must be able to reconstruct the selected plan from preserved fixtures."
      ]
    };
  }

  if (commitmentProfile === "policy_commitment") {
    return {
      requiredPaths: [
        "demo-fixtures/policy-brief.md",
        "demo-fixtures/access-request-a.json",
        "demo-fixtures/access-request-b.json"
      ],
      rationale: [
        "Policy commitments must preserve the policy brief.",
        "All candidate access requests must remain reviewable during verification and dispute resolution."
      ]
    };
  }

  return null;
}

function normalizeCommitmentProfile(value: string | null | undefined): string | null {
  if (!value || !value.trim()) {
    return null;
  }
  return value.trim().toLowerCase();
}

function normalizeEvidencePolicy(
  value: TaskSpec["evidencePolicy"]
): { requiredPaths: string[]; rationale: string[] } | null {
  if (!value) {
    return null;
  }

  const requiredPaths = [...new Set(value.requiredPaths.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))];
  const rationale = [...new Set(value.rationale.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))];

  if (requiredPaths.length === 0 && rationale.length === 0) {
    return null;
  }

  return {
    requiredPaths,
    rationale
  };
}
