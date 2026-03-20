import type { DatabaseSync } from "node:sqlite";
import type { ChainActionRecord, RunRecord, TaskRecord, TaskStatus } from "../core/types.js";

type SqlRecord = Record<string, string | number | bigint | null>;

function mapTask(row: Record<string, unknown>): TaskRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    instructions: String(row.instructions),
    outputSchemaJson: String(row.output_schema_json),
    reward: Number(row.reward),
    requiredStake: Number(row.required_stake),
    deadlineTs: Number(row.deadline_ts),
    status: row.status as TaskStatus,
    covenantId: (row.covenant_id as `0x${string}` | null) ?? null,
    executorAgentId: Number(row.executor_agent_id),
    createdBy: String(row.created_by),
    commitmentProfile: (row.commitment_profile as string | null) ?? null,
    evidencePolicyJson: (row.evidence_policy_json as string | null) ?? null,
    proofHash: (row.proof_hash as `0x${string}` | null) ?? null,
    taskHash: (row.task_hash as `0x${string}` | null) ?? null,
    artifactPath: (row.artifact_path as string | null) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    agentRole: row.agent_role as RunRecord["agentRole"],
    provider: String(row.provider),
    model: String(row.model),
    status: row.status as RunRecord["status"],
    inputJson: (row.input_json as string | null) ?? null,
    logPath: (row.log_path as string | null) ?? null,
    outputJson: (row.output_json as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapChainAction(row: Record<string, unknown>): ChainActionRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    action: String(row.action),
    actor: String(row.actor),
    txHash: String(row.tx_hash),
    createdAt: Number(row.created_at)
  };
}

export class TaskStore {
  public constructor(private readonly db: DatabaseSync) {}

  public saveTask(task: TaskRecord): void {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO tasks (
          id, title, instructions, output_schema_json, reward, required_stake,
          deadline_ts, status, covenant_id, executor_agent_id, created_by, commitment_profile, evidence_policy_json,
          proof_hash, task_hash, artifact_path, created_at, updated_at
        ) VALUES (
          @id, @title, @instructions, @outputSchemaJson, @reward, @requiredStake,
          @deadlineTs, @status, @covenantId, @executorAgentId, @createdBy, @commitmentProfile, @evidencePolicyJson,
          @proofHash, @taskHash, @artifactPath, @createdAt, @updatedAt
        )
      `)
      .run(toSqlRecord(task as unknown as Record<string, unknown>));
  }

  public getTask(id: string): TaskRecord | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? mapTask(row) : null;
  }

  public listTasks(): TaskRecord[] {
    return (this.db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all() as Record<string, unknown>[]).map(mapTask);
  }

  public findByStatus(status: TaskStatus): TaskRecord[] {
    return (this.db.prepare(`SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC`).all(status) as Record<
      string,
      unknown
    >[]).map(mapTask);
  }

  public updateTaskStatus(
    id: string,
    status: TaskStatus,
    patch: Partial<Pick<TaskRecord, "proofHash" | "artifactPath" | "covenantId" | "taskHash">> = {}
  ): void {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    this.saveTask({
      ...task,
      ...patch,
      status,
      updatedAt: Date.now()
    });
  }

  public saveRun(run: RunRecord): void {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO runs (
          id, task_id, agent_role, provider, model, status,
          input_json, log_path, output_json, error, created_at, updated_at
        ) VALUES (
          @id, @taskId, @agentRole, @provider, @model, @status,
          @inputJson, @logPath, @outputJson, @error, @createdAt, @updatedAt
        )
      `)
      .run(toSqlRecord(run as unknown as Record<string, unknown>));
  }

  public saveChainAction(taskId: string, action: string, actor: string, txHash: string): void {
    this.db
      .prepare(`
        INSERT INTO chain_actions (id, task_id, action, actor, tx_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(`${action}_${Date.now()}`, taskId, action, actor, txHash, Date.now());
  }

  public listRuns(taskId: string): RunRecord[] {
    return (this.db.prepare(`SELECT * FROM runs WHERE task_id = ? ORDER BY created_at ASC`).all(taskId) as Record<
      string,
      unknown
    >[]).map(mapRun);
  }

  public listChainActions(taskId: string): ChainActionRecord[] {
    return (this.db
      .prepare(`SELECT * FROM chain_actions WHERE task_id = ? ORDER BY created_at ASC`)
      .all(taskId) as Record<string, unknown>[]).map(mapChainAction);
  }
}

function toSqlRecord(input: Record<string, unknown>): SqlRecord {
  const output: SqlRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      output[key] = value;
      continue;
    }
    throw new Error(`Unsupported SQLite parameter type for ${key}`);
  }
  return output;
}
