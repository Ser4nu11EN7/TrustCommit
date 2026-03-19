import type {
  AgentLog,
  ArbiterDecision,
  ArbiterReviewLog,
  DisputeEvidenceRecord,
  DisputeRecord,
  ProofBundleRecord,
  TaskRecord
} from "../core/types.js";
import { ProviderRouter } from "../providers/router.js";
import { hashJson } from "../utils/hash.js";

export class AiArbiter {
  public constructor(private readonly providers: ProviderRouter) {}

  public async decide(
    task: TaskRecord,
    input: {
      disputeRecord: DisputeRecord;
      disputeEvidence: DisputeEvidenceRecord;
      agentLog: AgentLog | null;
      artifactPayload: Record<string, unknown> | null;
      proofBundle: ProofBundleRecord | null;
    }
  ): Promise<{ decision: ArbiterDecision; resolutionHash: `0x${string}`; arbiterLog: ArbiterReviewLog }> {
    const result = await this.providers.generateArbiterDecision(
      task,
      {
        disputeReason: input.disputeRecord.reason,
        disputeEvidenceHash: input.disputeRecord.evidenceHash,
        disputeEvidence: input.disputeEvidence,
        artifactPayload: input.artifactPayload,
        proofBundle: input.proofBundle,
        agentVerification: input.agentLog
          ? {
              schemaSatisfied: input.agentLog.verification.schemaSatisfied,
              missingFields: input.agentLog.verification.missingFields,
              notes: input.agentLog.verification.notes
            }
          : null,
        budget: input.agentLog?.budget ?? null,
        guardrails: input.agentLog?.guardrails ?? null,
        receiptChain: input.agentLog?.receiptChain ?? null
      },
      {
        systemPrompt:
          "You are the accountable arbiter for TrustCommit. Review contested agent work using only the provided receipt trail, verification state, dispute reason, and execution evidence. Return a JSON verdict only.",
        userPrompt:
          "Decide whether the creator or executor should win this dispute. Return JSON with winner, reason, confidence, and rationale. Favor the executor only if the receipt trail and verification snapshot support the submission. Favor the creator if the accountable evidence is incomplete, contradicted, or unsafe to settle."
      }
    );

    const createdAt = Date.now();
    const decision: ArbiterDecision = {
      taskId: task.id,
      winner: normalizeWinner(result.value.winner),
      reason: normalizeReason(result.value.reason),
      createdAt,
      confidence: normalizeConfidence(result.value.confidence),
      rationale: normalizeRationale(result.value.rationale),
      reviewMode: "ai"
    };
    const resolutionHash = hashJson(decision);
    const arbiterLog: ArbiterReviewLog = {
      schemaVersion: "v1",
      taskId: task.id,
      provider: result.provider,
      model: result.model,
      createdAt,
      dispute: {
        reason: input.disputeRecord.reason,
        evidenceHash: input.disputeRecord.evidenceHash
      },
      disputeEvidence: {
        verificationSnapshot: input.disputeEvidence.verificationSnapshot,
        receiptSnapshot: input.disputeEvidence.receiptSnapshot,
        artifactSnapshot: input.disputeEvidence.artifactSnapshot,
        evidencePacks: input.disputeEvidence.evidencePacks
      },
      verificationSnapshot: {
        profile: input.agentLog?.verification.profile ?? null,
        schemaSatisfied: input.agentLog?.verification.schemaSatisfied ?? false,
        notes: input.agentLog?.verification.notes ?? ["No agent log was available to the arbiter."],
        proofHash: input.agentLog?.proofHash ?? task.proofHash
      },
      decision,
      guardrails: [
        "Use only the recorded dispute, verification, and receipt trail context.",
        "Prefer creator if the accountable evidence is incomplete or contradicted.",
        "Return a deterministic structured verdict before computing the onchain resolution hash."
      ],
      resolutionHash
    };

    return {
      decision,
      resolutionHash,
      arbiterLog
    };
  }
}

function normalizeWinner(value: unknown): "creator" | "executor" {
  return value === "executor" ? "executor" : "creator";
}

function normalizeReason(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "Arbiter could not justify settlement in favor of the executor, so the creator prevails.";
}

function normalizeConfidence(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeRationale(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["Arbiter returned no structured rationale."];
  }
  const filtered = value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).slice(0, 4);
  return filtered.length > 0 ? filtered : ["Arbiter returned no structured rationale."];
}
