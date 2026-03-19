import { ChainAdapter } from "./chain/chain-adapter.js";
import { resolveRuntimeConfig, ensureRuntimeDirectories, persistRuntimeConfig } from "./config.js";
import fs from "node:fs";
import type { AgentLog, AgentManifest, ArtifactEnvelope, ProviderHealthStatus, RuntimeConfig, TaskDetails, TaskRecord, TaskSpec } from "./core/types.js";
import { CreatorAgent } from "./agents/creator-agent.js";
import { ExecutorAgent } from "./agents/executor-agent.js";
import { ManualArbiter } from "./agents/manual-arbiter.js";
import { openDatabase } from "./storage/database.js";
import { TaskStore } from "./storage/task-store.js";
import { ProviderRouter } from "./providers/router.js";
import { hashJson } from "./utils/hash.js";
import { buildAgentManifest, writeAgentManifest } from "./manifests/agent-manifest.js";

export class TrustCommitRuntime {
  public config: RuntimeConfig;
  private readonly store: TaskStore;
  private readonly chain: ChainAdapter;
  private readonly providers: ProviderRouter;
  private readonly creator: CreatorAgent;
  private readonly executor: ExecutorAgent;
  private readonly arbiter: ManualArbiter;

  public constructor(workspaceRoot = process.cwd()) {
    this.config = resolveRuntimeConfig(workspaceRoot);
    ensureRuntimeDirectories(this.config);
    const db = openDatabase(this.config.dbPath);
    this.store = new TaskStore(db);
    this.chain = new ChainAdapter(this.config);
    this.providers = new ProviderRouter(this.config.primaryProvider, this.config.fallbackProvider);
    this.creator = new CreatorAgent(this.providers);
    this.executor = new ExecutorAgent(this.providers, workspaceRoot, this.config.artifactDir);
    this.executor.setReceiptContext({
      trustRegistry: this.config.addresses?.trustRegistry ?? null,
      operator: this.config.accounts?.executor?.address ?? null
    });
    this.arbiter = new ManualArbiter();
  }

  public async init(): Promise<void> {
    ensureRuntimeDirectories(this.config);
    persistRuntimeConfig(this.config);
    writeAgentManifest(this.config, this.config.dataDir);
    this.executor.setReceiptContext({
      trustRegistry: this.config.addresses?.trustRegistry ?? null,
      operator: this.config.accounts?.executor?.address ?? null
    });
  }

  public async bootstrapDemo(): Promise<RuntimeConfig> {
    const next = await this.chain.bootstrapLocalDemo();
    this.config = next;
    this.chain.setConfig(next);
    persistRuntimeConfig(next);
    writeAgentManifest(next, next.dataDir);
    this.executor.setReceiptContext({
      trustRegistry: next.addresses?.trustRegistry ?? null,
      operator: next.accounts?.executor?.address ?? null
    });
    return next;
  }

  public listTasks(): TaskRecord[] {
    return this.store.listTasks();
  }

  public getTask(taskId: string): TaskRecord | null {
    return this.store.getTask(taskId);
  }

  public getTaskDetails(taskId: string): TaskDetails | null {
    const task = this.store.getTask(taskId);
    if (!task) {
      return null;
    }

    let artifact: ArtifactEnvelope | null = null;
    if (task.artifactPath && fs.existsSync(task.artifactPath)) {
      artifact = JSON.parse(fs.readFileSync(task.artifactPath, "utf8")) as ArtifactEnvelope;
    }
    let agentLog: AgentLog | null = null;
    const latestRun = this.store.listRuns(taskId).at(-1) ?? null;
    if (latestRun?.logPath && fs.existsSync(latestRun.logPath)) {
      agentLog = JSON.parse(fs.readFileSync(latestRun.logPath, "utf8")) as AgentLog;
    }

    return {
      task,
      artifact,
      agentLog,
      runs: this.store.listRuns(taskId),
      chainActions: this.store.listChainActions(taskId)
    };
  }

  public getAgentManifest(): AgentManifest {
    return buildAgentManifest(this.config);
  }

  public async getProviderHealth(forceRefresh = false): Promise<Record<"openai" | "claude" | "mock", ProviderHealthStatus>> {
    return this.providers.getHealth(forceRefresh);
  }

  public async createTask(input: TaskSpec): Promise<TaskRecord> {
    const draft = await this.creator.createDraft(input);
    const chainNow = await this.chain.getCurrentTimestamp();
    const draftRecord = {
      ...draft.record,
      deadlineTs: chainNow + draft.deadlineHours * 60 * 60
    };
    const tx = await this.chain.createCovenant({ ...draftRecord, covenantId: null, proofHash: null, artifactPath: null });
    const record: TaskRecord = {
      ...draftRecord,
      covenantId: tx.covenantId,
      proofHash: null,
      artifactPath: null,
      status: "created",
      updatedAt: Date.now()
    };
    this.store.saveTask(record);
    this.store.saveChainAction(record.id, "createCovenant", "creator", tx.txHash);
    return record;
  }

  public async runTask(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const output = await this.executor.executeTask(task);
    this.store.saveRun(output.run);
    const txHash = await this.chain.submitCompletion({
      ...task,
      proofHash: output.proofHash
    });
    this.store.updateTaskStatus(taskId, "submitted", {
      proofHash: output.proofHash,
      artifactPath: output.artifactPath
    });
    this.store.saveChainAction(taskId, "submitCompletion", "executor", txHash);
    this.updateAgentLogReceipts(taskId, {
      submitTxHash: txHash
    });
    return this.requireTask(taskId);
  }

  public async finalizeTask(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const txHash = await this.chain.finalizeCompletion(task);
    this.store.updateTaskStatus(taskId, "completed");
    this.store.saveChainAction(taskId, "finalizeCompletion", "deployer", txHash);
    this.updateAgentLogReceipts(taskId, {
      finalizeTxHash: txHash
    });
    return this.requireTask(taskId);
  }

  public async disputeTask(taskId: string, reason: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const txHash = await this.chain.dispute(task, hashJson({ taskId, reason }));
    this.store.updateTaskStatus(taskId, "disputed");
    this.store.saveChainAction(taskId, "disputeCovenant", "creator", txHash);
    this.updateAgentLogReceipts(taskId, {
      disputeTxHash: txHash
    });
    return this.requireTask(taskId);
  }

  public async arbiterReview(taskId: string, winner: "creator" | "executor", reason: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const { resolutionHash } = this.arbiter.decide(task, winner, reason);
    const txHash = await this.chain.resolveDispute(task, winner === "executor", resolutionHash);
    this.store.updateTaskStatus(taskId, winner === "executor" ? "completed" : "slashed");
    this.store.saveChainAction(taskId, "resolveDispute", "arbiter", txHash);
    this.updateAgentLogReceipts(taskId, {
      resolveTxHash: txHash
    });
    return this.requireTask(taskId);
  }

  public async demoRun(): Promise<{ task: TaskRecord; status: number; executorBalance: bigint }> {
    await this.init();
    await this.bootstrapDemo();
    const task = await this.createTask({
      title: "Summarize the TrustCommit workspace",
      instructions: "Inspect the current repository and produce a structured JSON summary for a project operator.",
      outputSchema: {
        taskTitle: "string",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      },
      reward: 10_000_000,
      requiredStake: 500_000_000,
      deadlineHours: 24
    });
    await this.runTask(task.id);
    const finalized = await this.finalizeTask(task.id);
    const status = await this.chain.getCovenantStatus(finalized.covenantId!);
    const executorBalance = await this.chain.getExecutorBalance();
    return { task: finalized, status, executorBalance };
  }

  private requireTask(taskId: string): TaskRecord {
    const task = this.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  private updateAgentLogReceipts(
    taskId: string,
    updates: Partial<AgentLog["receiptChain"]["onchain"]>
  ): void {
    const latestRun = this.store.listRuns(taskId).at(-1) ?? null;
    if (!latestRun?.logPath || !fs.existsSync(latestRun.logPath)) {
      return;
    }

    const agentLog = JSON.parse(fs.readFileSync(latestRun.logPath, "utf8")) as AgentLog;
    agentLog.receiptChain = {
      ...agentLog.receiptChain,
      onchain: {
        ...agentLog.receiptChain.onchain,
        ...updates
      }
    };
    fs.writeFileSync(latestRun.logPath, JSON.stringify(agentLog, null, 2));
  }
}
