import type { GeneratedTaskPlan, TaskRecord, TaskSpec } from "../core/types.js";
import { hashJson } from "../utils/hash.js";
import { makeId } from "../utils/id.js";
import { ProviderRouter } from "../providers/router.js";

export interface DraftTask {
  record: Omit<TaskRecord, "covenantId" | "proofHash" | "artifactPath">;
  deadlineHours: number;
}

export class CreatorAgent {
  public constructor(private readonly providers: ProviderRouter) {}

  public async createDraft(input: TaskSpec): Promise<DraftTask> {
    const result = await this.providers.generateTaskPlan(input, {
      systemPrompt:
        "You are the creator agent for TrustCommit. Normalize the task into a concise, structured covenant-friendly plan.",
      userPrompt:
        "Convert the incoming task spec into a structured task plan suitable for onchain creation. Keep reward/stake/deadline practical."
    });
    const plan = normalizeTaskPlan(input, result.value as Partial<GeneratedTaskPlan>);
    const now = Date.now();
    const taskId = makeId("task");
    const taskHash = hashJson({
      title: plan.title,
      instructions: plan.instructions,
      outputSchema: plan.outputSchema
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
        executorAgentId: 1,
        createdBy: result.provider,
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
