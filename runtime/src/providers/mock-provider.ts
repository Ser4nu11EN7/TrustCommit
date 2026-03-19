import type {
  ExecutionPlan,
  GeneratedTaskPlan,
  ModelProvider,
  ModelResult,
  ProviderContext,
  TaskRecord,
  TaskSpec
} from "../core/types.js";

export class MockProvider implements ModelProvider {
  public readonly name = "mock";

  public async generateTaskPlan(input: TaskSpec, _context: ProviderContext): Promise<ModelResult<GeneratedTaskPlan>> {
    return {
      provider: this.name,
      model: "deterministic-mock",
      value: {
        ...input,
        title: input.title.trim() || "TrustCommit Demo Task",
        instructions: input.instructions.trim()
      }
    };
  }

  public async generateExecutionPlan(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    _context: ProviderContext
  ): Promise<ModelResult<ExecutionPlan>> {
    const files = Array.isArray(repoContext.topFiles) ? (repoContext.topFiles as string[]) : [];
    return {
      provider: this.name,
      model: "deterministic-mock",
      value: {
        summary: `Plan a grounded artifact for "${task.title}" using inspected workspace evidence.`,
        steps: [
          "Review the task requirements and expected schema.",
          "Inspect the workspace evidence set and prioritize the most relevant files.",
          "Generate a structured artifact grounded in the inspected evidence.",
          "Verify that the artifact only references inspected files and satisfies the schema."
        ],
        successCriteria: [
          "All required schema fields are present.",
          "Artifact references only inspected files.",
          "Summary and notes are non-empty."
        ],
        evidenceFocus: files.slice(0, 4),
        maxAttempts: 2
      }
    };
  }

  public async generateArtifact(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    _context: ProviderContext
  ): Promise<ModelResult<Record<string, unknown>>> {
    const files =
      (repoContext.inspectedFiles as Array<{ path: string }> | undefined)?.map((file) => file.path) ??
      ((repoContext.topFiles as string[] | undefined) ?? []);
    const plan = repoContext.plan as ExecutionPlan | undefined;
    const previousFailure = repoContext.previousFailure as string | undefined;
    return {
      provider: this.name,
      model: "deterministic-mock",
      value: {
        taskTitle: task.title,
        summary: `Completed structured task for "${task.title}" against the current workspace using a grounded execution plan.`,
        inspectedFiles: files.slice(0, 5),
        notes: [
          `Execution plan: ${plan?.summary ?? "default mock plan"}`,
          previousFailure ? `Recovered after verification feedback: ${previousFailure}` : "Artifact passed first-pass verification.",
          "Swap in OpenAI/Claude providers later without changing the task pipeline."
        ]
      }
    };
  }
}
