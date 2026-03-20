import type {
  ArbiterDecision,
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
    const outputSchema = JSON.parse(task.outputSchemaJson) as Record<string, string>;
    const payload: Record<string, unknown> = {};
    let selectedValue: string | null = null;

    for (const key of Object.keys(outputSchema)) {
      if (key === "taskTitle") {
        payload[key] = task.title;
        continue;
      }
      if (key === "summary") {
        payload[key] = selectedValue
          ? `Completed structured task for "${task.title}" and selected ${selectedValue} against the current workspace using a grounded execution plan.`
          : `Completed structured task for "${task.title}" against the current workspace using a grounded execution plan.`;
        continue;
      }
      if (key === "inspectedFiles") {
        payload[key] = files.slice(0, 5);
        continue;
      }
      if (key === "notes") {
        payload[key] = [
          `Execution plan: ${plan?.summary ?? "default mock plan"}`,
          previousFailure ? `Recovered after verification feedback: ${previousFailure}` : "Artifact passed first-pass verification.",
          "Swap in OpenAI/Claude providers later without changing the task pipeline."
        ];
        continue;
      }
      if (key.toLowerCase().includes("vendor")) {
        payload[key] = "Vendor A";
        selectedValue = "Vendor A";
        continue;
      }
      if (key.toLowerCase().includes("selectedplan")) {
        payload[key] = "Patch Plan A";
        selectedValue = "Patch Plan A";
        continue;
      }
      if (key.toLowerCase().includes("selectedrequest")) {
        payload[key] = "Access Request A";
        selectedValue = "Access Request A";
        continue;
      }
      if (key.toLowerCase().includes("selectedoption")) {
        payload[key] = "Primary Option";
        selectedValue = String(payload[key]);
        continue;
      }
      if (key.toLowerCase().includes("remediationplan")) {
        payload[key] =
          "Apply Patch Plan A to the checkout and payments flows, preserve audit logging, add regression tests, and avoid touching sensitive auth code.";
        continue;
      }
      if (key.toLowerCase().includes("filestomodify") || key.toLowerCase().includes("touchedfiles")) {
        payload[key] = ["src/checkout.ts", "src/payments.ts"];
        continue;
      }
      if (key.toLowerCase().includes("acceptance")) {
        payload[key] = ["Input sanitization enforced", "Audit logging preserved", "Targeted unit tests added"];
        continue;
      }
      if (key.toLowerCase().includes("residualrisk")) {
        payload[key] = "Low residual risk after preserving audit logging and constraining the patch to checkout-related files.";
        continue;
      }
      if (key.toLowerCase().includes("budget")) {
        payload[key] = "Selected vendor remains within the stated budget ceiling.";
        continue;
      }
      if (key.toLowerCase().includes("policy")) {
        payload[key] = [
          "EU region only",
          "Read-only access",
          "No biometric data",
          "Ticket reference present",
          "Maximum duration under 30 days"
        ];
        continue;
      }
      if (key.toLowerCase().includes("requiredcontrol")) {
        payload[key] = ["Read-only access", "Ticket reference", "Maximum duration"];
        continue;
      }
      if (key.toLowerCase().includes("compliance") || key.toLowerCase().includes("check")) {
        payload[key] = [
          "Quote includes audit logs export.",
          "Vendor advertises retention controls aligned with the task brief."
        ];
        continue;
      }
      if (key.toLowerCase().includes("decision") || key.toLowerCase().includes("reason")) {
        payload[key] = selectedValue
          ? `${selectedValue} best satisfies the budget, logging, and policy requirements from the task brief.`
          : "The selected option best satisfies the budget, logging, and policy requirements from the task brief.";
        continue;
      }
      payload[key] = `${key} generated by deterministic mock provider.`;
    }

    return {
      provider: this.name,
      model: "deterministic-mock",
      value: payload
    };
  }

  public async generateArbiterDecision(
    task: TaskRecord,
    reviewContext: Record<string, unknown>,
    _context: ProviderContext
  ): Promise<ModelResult<Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">>> {
    const disputeEvidence =
      (reviewContext.disputeEvidence as {
        verificationSnapshot?: { schemaSatisfied?: boolean; notes?: string[]; profile?: string };
        evidencePacks?: Array<{ packType?: string; facts?: string[] }>;
      } | undefined) ?? {};
    const verification =
      disputeEvidence.verificationSnapshot ??
      ((reviewContext.agentVerification as { schemaSatisfied?: boolean; notes?: string[]; profile?: string } | undefined) ?? {});
    const disputeReason = String(reviewContext.disputeReason ?? "No explicit dispute reason provided.");
    const evidencePacks = Array.isArray(disputeEvidence.evidencePacks) ? disputeEvidence.evidencePacks : [];
    const schemaSatisfied = verification.schemaSatisfied !== false;
    return {
      provider: this.name,
      model: "deterministic-mock",
      value: {
        winner: schemaSatisfied ? "executor" : "creator",
        reason: schemaSatisfied
          ? "Executor satisfied the expected schema and preserved the accountable receipt trail."
          : "Creator won because the accountable receipt trail did not satisfy the arbiter checks.",
        confidence: schemaSatisfied ? "medium" : "high",
        rationale: [
          `Dispute reason reviewed: ${disputeReason}`,
          `Validator profile reviewed: ${String(verification.profile ?? "unknown")}`,
          `Typed evidence packs reviewed: ${evidencePacks.length}`,
          schemaSatisfied
            ? "Artifact verification passed at the time of review."
            : `Verification issues remained: ${(verification.notes ?? []).join("; ") || "unspecified verification failures"}`
        ]
      }
    };
  }
}
