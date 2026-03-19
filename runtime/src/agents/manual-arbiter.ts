import type { ArbiterDecision, TaskRecord } from "../core/types.js";
import { hashJson } from "../utils/hash.js";

export class ManualArbiter {
  public decide(task: TaskRecord, winner: "creator" | "executor", reason: string): { decision: ArbiterDecision; resolutionHash: `0x${string}` } {
    const decision: ArbiterDecision = {
      taskId: task.id,
      winner,
      reason,
      createdAt: Date.now()
    };
    return {
      decision,
      resolutionHash: hashJson(decision)
    };
  }
}
