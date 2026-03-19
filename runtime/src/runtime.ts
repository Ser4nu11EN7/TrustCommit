import { ChainAdapter } from "./chain/chain-adapter.js";
import { resolveRuntimeConfig, ensureRuntimeDirectories, persistRuntimeConfig } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import type {
  AgentLog,
  AgentManifest,
  ArbiterDecision,
  ArbiterReviewLog,
  ArtifactEnvelope,
  DisputeEvidenceRecord,
  DisputeRecord,
  EvidencePackRecord,
  ProofBundleRecord,
  ProviderHealthStatus,
  ReceiptEventRecord,
  ReceiptRecord,
  ResolutionRecord,
  RuntimeConfig,
  TaskVerificationReport,
  TaskDetails,
  TaskRecord,
  TaskSpec
} from "./core/types.js";
import { CreatorAgent } from "./agents/creator-agent.js";
import { AiArbiter } from "./agents/ai-arbiter.js";
import { ExecutorAgent } from "./agents/executor-agent.js";
import { ManualArbiter } from "./agents/manual-arbiter.js";
import { openDatabase } from "./storage/database.js";
import { TaskStore } from "./storage/task-store.js";
import { ProviderRouter } from "./providers/router.js";
import { hashJson } from "./utils/hash.js";
import { buildAgentManifest, writeAgentManifest } from "./manifests/agent-manifest.js";
import { verifyTaskDetails } from "./verifier/task-verifier.js";

const DISPUTE_RECORD_FILE = "dispute.json";
const DISPUTE_EVIDENCE_FILE = "dispute_evidence.json";
const RESOLUTION_RECORD_FILE = "resolution.json";
const ARBITER_LOG_FILE = "arbiter_log.json";
const PROOF_BUNDLE_FILE = "proof_bundle.json";
const RECEIPT_RECORD_FILE = "receipt_record.json";
const RECEIPT_EVENT_DIR = "receipt_events";

export class TrustCommitRuntime {
  public config: RuntimeConfig;
  private readonly store: TaskStore;
  private readonly chain: ChainAdapter;
  private readonly providers: ProviderRouter;
  private readonly creator: CreatorAgent;
  private readonly executor: ExecutorAgent;
  private readonly aiArbiter: AiArbiter;
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
    this.aiArbiter = new AiArbiter(this.providers);
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
    const disputeRecord = this.readTaskJson<DisputeRecord>(taskId, DISPUTE_RECORD_FILE);
    const disputeEvidence = this.readTaskJson<DisputeEvidenceRecord>(taskId, DISPUTE_EVIDENCE_FILE);
    const resolutionRecord = this.readTaskJson<ResolutionRecord>(taskId, RESOLUTION_RECORD_FILE);
    const arbiterLog = this.readTaskJson<ArbiterReviewLog>(taskId, ARBITER_LOG_FILE);
    const proofBundle = this.readTaskJson<ProofBundleRecord>(taskId, PROOF_BUNDLE_FILE);
    const receiptRecord = this.readTaskJson<ReceiptRecord>(taskId, RECEIPT_RECORD_FILE);
    const receiptEvents = receiptRecord?.eventFiles
      ? receiptRecord.eventFiles
          .map((fileName) => this.readTaskJson<ReceiptEventRecord>(taskId, fileName))
          .filter((event): event is ReceiptEventRecord => event !== null)
      : [];

    return {
      task,
      artifact,
      agentLog,
      proofBundle,
      receiptRecord,
      receiptEvents,
      disputeRecord,
      disputeEvidence,
      resolutionRecord,
      arbiterLog,
      runs: this.store.listRuns(taskId),
      chainActions: this.store.listChainActions(taskId)
    };
  }

  public async verifyTask(taskId: string): Promise<TaskVerificationReport> {
    const details = this.getTaskDetails(taskId);
    if (!details) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return verifyTaskDetails(details);
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
    await this.appendReceiptEvent(record, {
      event: "createCovenant",
      actor: "creator",
      txHash: tx.txHash,
      metadata: {
        reward: record.reward,
        requiredStake: record.requiredStake
      }
    });
    return record;
  }

  public async runTask(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const output = await this.executor.executeTask(task);
    const proofBundle = this.readTaskJson<ProofBundleRecord>(task.id, PROOF_BUNDLE_FILE);
    if (proofBundle) {
      const operatorAttestation = await this.chain.signRolePayload("executor", "proof_bundle", output.proofHash);
      this.writeTaskJson(task.id, PROOF_BUNDLE_FILE, {
        ...proofBundle,
        operatorAttestation
      });
    }
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
    await this.appendReceiptEvent(
      {
        ...task,
        proofHash: output.proofHash
      },
      {
        event: "submitCompletion",
        actor: "executor",
        txHash,
        metadata: {
          artifactPath: output.artifactPath,
          proofBundlePath: output.proofBundlePath
        }
      }
    );
    return this.requireTask(taskId);
  }

  public async finalizeTask(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const txHash = await this.chain.finalizeCompletion(task);
    this.store.updateTaskStatus(taskId, "completed");
    this.store.saveChainAction(taskId, "finalizeCompletion", "deployer", txHash);
    await this.appendReceiptEvent(task, {
      event: "finalizeCompletion",
      actor: "deployer",
      txHash,
      metadata: {
        outcome: "completed"
      }
    });
    return this.requireTask(taskId);
  }

  public async disputeTask(taskId: string, reason: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const createdAt = Date.now();
    const details = this.getTaskDetails(taskId);
    const disputeEvidence = this.buildDisputeEvidence(
      task,
      reason,
      details?.artifact ?? null,
      details?.agentLog ?? null,
      details?.proofBundle ?? null,
      details?.receiptRecord ?? null,
      details?.chainActions ?? []
    );
    const evidenceHash = hashJson(disputeEvidence);
    const txHash = await this.chain.dispute(task, evidenceHash);
    const record: DisputeRecord = {
      schemaVersion: "v1",
      taskId,
      reason,
      evidenceHash,
      createdAt,
      txHash
    };
    this.writeTaskJson(taskId, DISPUTE_RECORD_FILE, record);
    this.writeTaskJson(taskId, DISPUTE_EVIDENCE_FILE, disputeEvidence);
    this.store.updateTaskStatus(taskId, "disputed");
    this.store.saveChainAction(taskId, "disputeCovenant", "creator", txHash);
    await this.appendReceiptEvent(task, {
      event: "disputeCovenant",
      actor: "creator",
      txHash,
      metadata: {
        reason
      }
    });
    return this.requireTask(taskId);
  }

  public async arbiterReview(taskId: string, winner: "creator" | "executor", reason: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const details = this.getTaskDetails(taskId);
    if (!details?.disputeRecord || !details.disputeEvidence) {
      throw new Error(`Task ${taskId} does not have a dispute record.`);
    }
    const { decision, resolutionHash } = this.arbiter.decide(task, winner, reason);
    const guarded = this.guardResolutionDecision(task, details, decision, null);
    return this.finalizeResolution(taskId, task, guarded.decision, guarded.resolutionHash, guarded.arbiterLog);
  }

  public async arbiterAutoReview(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId);
    const details = this.getTaskDetails(taskId);
    if (!details?.disputeRecord || !details.disputeEvidence) {
      throw new Error(`Task ${taskId} does not have a dispute record.`);
    }
    const { decision, resolutionHash, arbiterLog } = await this.aiArbiter.decide(task, {
      disputeRecord: details.disputeRecord,
      disputeEvidence: details.disputeEvidence,
      agentLog: details.agentLog,
      artifactPayload: details.artifact?.payload ?? null,
      proofBundle: details.proofBundle
    });
    const guarded = this.guardResolutionDecision(task, details, decision, arbiterLog);
    return this.finalizeResolution(taskId, task, guarded.decision, guarded.resolutionHash, guarded.arbiterLog);
  }

  public async demoRun(): Promise<{ task: TaskRecord; status: number; executorBalance: bigint }> {
    await this.init();
    await this.bootstrapDemo();
    const task = await this.createTask({
      title: "Select a compliant vendor for the autonomous support queue",
      instructions:
        "Review the procurement brief and vendor quote fixtures in demo-fixtures/. Choose the vendor that stays under the monthly budget ceiling while meeting logging, uptime, and retention requirements. Return a structured procurement decision.",
      outputSchema: {
        taskTitle: "string",
        selectedVendor: "string",
        summary: "string",
        decisionReason: "string",
        budgetAssessment: "string",
        complianceChecks: "string[]",
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

  public async demoDisputeRun(): Promise<{ task: TaskRecord; status: number; executorBalance: bigint }> {
    await this.init();
    await this.bootstrapDemo();
    const task = await this.createTask({
      title: "Resolve a disputed vendor commitment for the autonomous support queue",
      instructions:
        "Review the procurement brief and vendor quote fixtures in demo-fixtures/. Produce a structured vendor decision that can be challenged if it violates the budget ceiling or retention policy.",
      outputSchema: {
        taskTitle: "string",
        selectedVendor: "string",
        summary: "string",
        decisionReason: "string",
        budgetAssessment: "string",
        complianceChecks: "string[]",
        inspectedFiles: "string[]",
        notes: "string[]"
      },
      reward: 15_000_000,
      requiredStake: 500_000_000,
      deadlineHours: 24
    });
    await this.runTask(task.id);
    await this.disputeTask(
      task.id,
      "Creator disputed the vendor decision because the chosen provider may exceed the budget ceiling and lacks the required retention controls."
    );
    const resolved = await this.arbiterAutoReview(task.id);
    const status = await this.chain.getCovenantStatus(resolved.covenantId!);
    const executorBalance = await this.chain.getExecutorBalance();
    return { task: resolved, status, executorBalance };
  }

  private requireTask(taskId: string): TaskRecord {
    const task = this.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  private async finalizeResolution(
    taskId: string,
    task: TaskRecord,
    decision: ArbiterDecision,
    resolutionHash: `0x${string}`,
    arbiterLog: ArbiterReviewLog | null
  ): Promise<TaskRecord> {
    const txHash = await this.chain.resolveDispute(task, decision.winner === "executor", resolutionHash);
    const outcome = decision.winner === "executor" ? "completed" : "slashed";
    const record: ResolutionRecord = {
      schemaVersion: "v1",
      taskId,
      winner: decision.winner,
      reason: decision.reason,
      resolutionHash,
      createdAt: decision.createdAt,
      txHash,
      outcome
    };
    this.writeTaskJson(taskId, RESOLUTION_RECORD_FILE, record);
    if (arbiterLog) {
      this.writeTaskJson(taskId, ARBITER_LOG_FILE, arbiterLog);
    }
    this.store.updateTaskStatus(taskId, outcome);
    this.store.saveChainAction(taskId, "resolveDispute", "arbiter", txHash);
    await this.appendReceiptEvent(task, {
      event: "resolveDispute",
      actor: "arbiter",
      txHash,
      metadata: {
        outcome,
        winner: decision.winner
      }
    });
    return this.requireTask(taskId);
  }

  private buildDisputeEvidence(
    task: TaskRecord,
    reason: string,
    artifact: ArtifactEnvelope | null,
    agentLog: AgentLog | null,
    proofBundle: ProofBundleRecord | null,
    receiptRecord: ReceiptRecord | null,
    chainActions: TaskDetails["chainActions"]
  ): DisputeEvidenceRecord {
    const evidencePacks = this.buildEvidencePacks(task, reason, artifact, agentLog, proofBundle, receiptRecord, chainActions);
    return {
      schemaVersion: "v1",
      taskId: task.id,
      reason,
      createdAt: Date.now(),
      taskSnapshot: {
        status: task.status,
        covenantId: task.covenantId,
        taskHash: task.taskHash,
        proofHash: task.proofHash
      },
      artifactSnapshot: {
        artifactPath: task.artifactPath,
        summary: artifact && typeof artifact.payload.summary === "string" ? artifact.payload.summary : null,
        payloadHash: artifact ? hashJson(artifact) : null,
        proofBundleHash: proofBundle?.proofHash ?? null
      },
      verificationSnapshot: agentLog
        ? {
            profile: agentLog.verification.profile,
            schemaSatisfied: agentLog.verification.schemaSatisfied,
            missingFields: agentLog.verification.missingFields,
            notes: agentLog.verification.notes,
            validatorResults: agentLog.verification.validatorResults
          }
        : null,
      executionEvidence: agentLog
        ? {
            inspectedFiles: agentLog.evidence.files.map((file) => ({
              path: file.path,
              contentHash: file.contentHash
            })),
            budget: agentLog.budget,
            guardrails: agentLog.guardrails
          }
        : null,
      receiptSnapshot: receiptRecord?.receipts ?? {
        createTxHash: null,
        submitTxHash: null,
        finalizeTxHash: null,
        disputeTxHash: null,
        resolveTxHash: null
      },
      receiptHeadHash: receiptRecord?.headHash ?? null,
      chainActions: chainActions.map((action) => ({
        action: action.action,
        actor: action.actor,
        txHash: action.txHash
      })),
      evidencePacks
    };
  }

  private buildEvidencePacks(
    task: TaskRecord,
    reason: string,
    artifact: ArtifactEnvelope | null,
    agentLog: AgentLog | null,
    proofBundle: ProofBundleRecord | null,
    receiptRecord: ReceiptRecord | null,
    chainActions: TaskDetails["chainActions"]
  ): EvidencePackRecord[] {
    const packs: EvidencePackRecord[] = [
      {
        schemaVersion: "v1",
        packType: "identity",
        label: "Operator identity and stake-backed execution context",
        subject: "executor",
        payloadHash: agentLog ? hashJson(agentLog.receiptChain.identityLayer) : null,
        facts: [
          `trustRegistry=${agentLog?.receiptChain.identityLayer.trustRegistry ?? "unknown"}`,
          `operator=${agentLog?.receiptChain.identityLayer.operator ?? "unknown"}`,
          `executorAgentId=${task.executorAgentId}`
        ],
        linkedArtifacts: ["agent.json", "agent_log.json"]
      },
      {
        schemaVersion: "v1",
        packType: "commitment",
        label: "Task commitment and covenant binding",
        subject: "covenant",
        payloadHash: hashJson({
          taskHash: task.taskHash,
          covenantId: task.covenantId,
          reward: task.reward,
          requiredStake: task.requiredStake
        }),
        facts: [
          `taskHash=${task.taskHash ?? "unknown"}`,
          `covenantId=${task.covenantId ?? "unknown"}`,
          `reward=${task.reward}`,
          `requiredStake=${task.requiredStake}`
        ],
        linkedArtifacts: ["receipt_record.json"]
      },
      {
        schemaVersion: "v1",
        packType: "execution",
        label: "Execution artifact and inspected evidence",
        subject: "executor-run",
        payloadHash: proofBundle?.artifactHash ?? (artifact ? hashJson(artifact) : null),
        facts: [
          `artifactPath=${task.artifactPath ?? "missing"}`,
          `inspectedFiles=${agentLog?.evidence.files.length ?? 0}`,
          `attemptsUsed=${agentLog?.budget.attemptsUsed ?? 0}`,
          `modelCalls=${agentLog?.budget.modelCalls ?? 0}`
        ],
        linkedArtifacts: ["artifact.json", "agent_log.json", "proof_bundle.json"]
      },
      {
        schemaVersion: "v1",
        packType: "verification",
        label: "Deterministic verification and validator profile results",
        subject: "verification",
        payloadHash: agentLog ? hashJson(agentLog.verification) : null,
        facts: [
          `profile=${agentLog?.verification.profile ?? "unknown"}`,
          `schemaSatisfied=${agentLog?.verification.schemaSatisfied ?? false}`,
          `validatorFailures=${agentLog?.verification.validatorResults.filter((result) => !result.passed).length ?? 0}`,
          ...((agentLog?.verification.validatorResults ?? []).slice(0, 4).map((result) => `${result.name}=${result.passed ? "pass" : "fail"}`))
        ],
        linkedArtifacts: ["agent_log.json", "proof_bundle.json"]
      },
      {
        schemaVersion: "v1",
        packType: "receipts",
        label: "Append-only receipt chain and onchain tx index",
        subject: "settlement",
        payloadHash: receiptRecord?.headHash ?? null,
        facts: [
          `eventCount=${receiptRecord?.eventCount ?? 0}`,
          `submitTx=${receiptRecord?.receipts.submitTxHash ?? "missing"}`,
          `disputeTx=${receiptRecord?.receipts.disputeTxHash ?? "missing"}`,
          `resolveTx=${receiptRecord?.receipts.resolveTxHash ?? "missing"}`
        ],
        linkedArtifacts: ["receipt_record.json", "receipt_events/*.json"]
      },
      {
        schemaVersion: "v1",
        packType: "dispute",
        label: "Dispute claim and adjudication trigger",
        subject: "creator-claim",
        payloadHash: hashJson({
          taskId: task.id,
          reason,
          chainActions: chainActions.map((action) => ({
            action: action.action,
            actor: action.actor,
            txHash: action.txHash
          }))
        }),
        facts: [
          `reason=${reason}`,
          `chainActions=${chainActions.length}`,
          `statusAtDispute=${task.status}`
        ],
        linkedArtifacts: ["dispute.json", "dispute_evidence.json"]
      }
    ];

    return packs;
  }

  private async appendReceiptEvent(
    task: Pick<TaskRecord, "id" | "taskHash" | "covenantId" | "proofHash">,
    input: {
      event: ReceiptEventRecord["event"];
      actor: string;
      txHash: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ReceiptRecord> {
    const previous = this.readTaskJson<ReceiptRecord>(task.id, RECEIPT_RECORD_FILE);
    const now = Date.now();
    const sequence = (previous?.eventCount ?? 0) + 1;
    const eventBase = {
      schemaVersion: "v1" as const,
      taskId: task.id,
      sequence,
      event: input.event,
      actor: input.actor,
      txHash: input.txHash,
      createdAt: now,
      prevHash: previous?.headHash ?? null,
      snapshot: {
        taskHash: task.taskHash,
        covenantId: task.covenantId,
        proofHash: task.proofHash
      },
      metadata: input.metadata ?? {}
    };
    const attestation = await this.chain.signRolePayload(input.actor as "deployer" | "creator" | "executor" | "arbiter", input.event, hashJson(eventBase));
    const eventRecord: ReceiptEventRecord = {
      ...eventBase,
      attestation,
      eventHash: hashJson(eventBase)
    };
    const eventFile = path.join(RECEIPT_EVENT_DIR, `${String(sequence).padStart(3, "0")}_${input.event}.json`);
    this.writeTaskJson(task.id, eventFile, eventRecord);
    const next: ReceiptRecord = {
      schemaVersion: "v2",
      taskId: task.id,
      taskHash: task.taskHash,
      covenantId: task.covenantId,
      proofHash: task.proofHash,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      headHash: eventRecord.eventHash,
      eventCount: sequence,
      eventFiles: [...(previous?.eventFiles ?? []), eventFile],
      receipts: {
        createTxHash: input.event === "createCovenant" ? input.txHash : previous?.receipts.createTxHash ?? null,
        submitTxHash: input.event === "submitCompletion" ? input.txHash : previous?.receipts.submitTxHash ?? null,
        finalizeTxHash: input.event === "finalizeCompletion" ? input.txHash : previous?.receipts.finalizeTxHash ?? null,
        disputeTxHash: input.event === "disputeCovenant" ? input.txHash : previous?.receipts.disputeTxHash ?? null,
        resolveTxHash: input.event === "resolveDispute" ? input.txHash : previous?.receipts.resolveTxHash ?? null
      }
    };
    this.writeTaskJson(task.id, RECEIPT_RECORD_FILE, next);
    return next;
  }

  private taskDir(taskId: string): string {
    return path.join(this.config.artifactDir, taskId);
  }

  private writeTaskJson(taskId: string, fileName: string, payload: unknown): void {
    const taskDir = this.taskDir(taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    const filePath = path.join(taskDir, fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  }

  private guardResolutionDecision(
    task: TaskRecord,
    details: TaskDetails,
    decision: ArbiterDecision,
    arbiterLog: ArbiterReviewLog | null
  ): { decision: ArbiterDecision; resolutionHash: `0x${string}`; arbiterLog: ArbiterReviewLog } {
    const baseLog =
      arbiterLog ??
      ({
        schemaVersion: "v1",
        taskId: task.id,
        provider: "manual",
        model: "manual-review",
        createdAt: decision.createdAt,
        dispute: {
          reason: details.disputeRecord?.reason ?? "Manual review",
          evidenceHash: details.disputeRecord?.evidenceHash ?? null
        },
        disputeEvidence: {
          verificationSnapshot: details.disputeEvidence?.verificationSnapshot ?? null,
          receiptSnapshot:
            details.disputeEvidence?.receiptSnapshot ?? {
              createTxHash: null,
              submitTxHash: null,
              finalizeTxHash: null,
              disputeTxHash: null,
              resolveTxHash: null
            },
          artifactSnapshot:
            details.disputeEvidence?.artifactSnapshot ?? {
              artifactPath: null,
              summary: null,
              payloadHash: null,
              proofBundleHash: null
            },
          evidencePacks: details.disputeEvidence?.evidencePacks ?? []
        },
        verificationSnapshot: {
          profile: details.agentLog?.verification.profile ?? null,
          schemaSatisfied: details.agentLog?.verification.schemaSatisfied ?? false,
          notes: details.agentLog?.verification.notes ?? ["No agent log was available to the arbiter."],
          proofHash: details.agentLog?.proofHash ?? task.proofHash
        },
        decision,
        guardrails: [],
        resolutionHash: hashJson(decision)
      } satisfies ArbiterReviewLog);

    const finalize = (nextDecision: ArbiterDecision, extraGuardrails: string[] = []) => {
      const resolutionHash = hashJson(nextDecision);
      return {
        decision: nextDecision,
        resolutionHash,
        arbiterLog: {
          ...baseLog,
          decision: nextDecision,
          guardrails: [...baseLog.guardrails, ...extraGuardrails],
          resolutionHash
        }
      };
    };

    const verification = details.agentLog?.verification ?? null;
    const proofBundle = details.proofBundle ?? null;
    const receiptRecord = details.receiptRecord ?? null;
    const failures: string[] = [];

    if (!verification?.schemaSatisfied || (verification?.notes.length ?? 1) > 0) {
      failures.push("verification gate was not clean at settlement time");
    }
    if (verification && verification.validatorResults.some((result) => !result.passed)) {
      failures.push("one or more deterministic validator checks failed");
    }
    if (!receiptRecord?.receipts.submitTxHash) {
      failures.push("submit receipt was missing from the receipt chain");
    }
    if (!proofBundle || proofBundle.proofHash !== task.proofHash) {
      failures.push("proof bundle hash did not match the committed onchain proof");
    }

    if (decision.winner === "executor") {
      if (failures.length === 0) {
        return finalize(decision, [
          "Allow executor-favoring resolution only when the proof bundle, receipt chain, and deterministic validators are all clean."
        ]);
      }
      return finalize(
        {
          ...decision,
          winner: "creator",
          reason: `Executor settlement guard failed: ${failures.join("; ")}.`,
          rationale: [...decision.rationale, ...failures.map((failure) => `Deterministic settlement guard: ${failure}.`)].slice(0, 6)
        },
        ["Block executor-favoring resolution unless the proof bundle, receipt chain, and deterministic validators are all clean."]
      );
    }

    if (failures.length > 0) {
      return finalize(decision, [
        "Allow creator-favoring resolution only when at least one deterministic accountability failure is recorded."
      ]);
    }

    return finalize(
      {
        ...decision,
        winner: "executor",
        reason: "Creator-favoring resolution guard failed because no deterministic accountability failure was recorded.",
        rationale: [...decision.rationale, "Deterministic settlement guard found no objective failure that justifies slashing."].slice(0, 6)
      },
      ["Block creator-favoring resolution unless at least one deterministic accountability failure is recorded."]
    );
  }

  private readTaskJson<T>(taskId: string, fileName: string): T | null {
    const filePath = path.join(this.taskDir(taskId), fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  }
}
