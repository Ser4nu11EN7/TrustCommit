export type AgentRoleType = "creator" | "executor" | "arbiter";
export type ProviderName = "openai" | "claude" | "mock";
export type TaskStatus =
  | "draft"
  | "created"
  | "running"
  | "submitted"
  | "disputed"
  | "completed"
  | "slashed";

export interface TaskSpec {
  title: string;
  instructions: string;
  outputSchema: Record<string, string>;
  reward: number;
  requiredStake: number;
  deadlineHours: number;
}

export interface TaskRecord {
  id: string;
  title: string;
  instructions: string;
  outputSchemaJson: string;
  reward: number;
  requiredStake: number;
  deadlineTs: number;
  status: TaskStatus;
  covenantId: `0x${string}` | null;
  executorAgentId: number;
  createdBy: string;
  proofHash: `0x${string}` | null;
  taskHash: `0x${string}` | null;
  artifactPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactEnvelope {
  schemaVersion: "v1";
  taskId: string;
  producedBy: AgentRoleType;
  createdAt: number;
  payload: Record<string, unknown>;
}

export interface ExecutionEvidenceFile {
  path: string;
  contentHash: `0x${string}`;
  excerpt: string;
  bytes: number;
  observedAt: number;
}

export interface ExecutionEvidence {
  schemaVersion: "v1";
  taskId: string;
  workspaceRoot: string;
  observedAt: number;
  topFiles: string[];
  fileCount: number;
  files: ExecutionEvidenceFile[];
}

export interface AgentLogStep {
  id: string;
  type:
    | "task_ingest"
    | "execution_plan"
    | "workspace_inspection"
    | "artifact_generation"
    | "artifact_verification"
    | "artifact_retry"
    | "proof_submission";
  status: "completed";
  observedAt: number;
  summary: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  evidenceRefs?: string[];
}

export interface AgentLog {
  schemaVersion: "v1";
  taskId: string;
  role: AgentRoleType;
  provider: string;
  model: string;
  startedAt: number;
  completedAt: number;
  task: {
    title: string;
    instructions: string;
    outputSchema: Record<string, string>;
    covenantId: `0x${string}` | null;
    taskHash: `0x${string}` | null;
  };
  evidence: ExecutionEvidence;
  plan: ExecutionPlan;
  verification: {
    profile: string;
    schemaSatisfied: boolean;
    missingFields: string[];
    notes: string[];
    validatorResults: Array<{
      name: string;
      passed: boolean;
      details: string;
    }>;
  };
  budget: {
    policy: string[];
    attemptsAllowed: number;
    attemptsUsed: number;
    modelCalls: number;
    verificationPasses: number;
    evidenceFilesConsidered: number;
  };
  guardrails: {
    preExecution: string[];
    duringExecution: string[];
    preCommit: string[];
  };
  receiptChain: {
    identityLayer: {
      trustRegistry: `0x${string}` | null;
      operator: `0x${string}` | null;
    };
    taskCommitment: {
      taskHash: `0x${string}` | null;
      covenantId: `0x${string}` | null;
    };
    executionArtifacts: {
      artifactPath: string;
      logPath: string;
      proofBundlePath: string;
    };
    onchain: {
      proofHash: `0x${string}`;
      artifactHash: `0x${string}`;
      submitTxHash: string | null;
      finalizeTxHash: string | null;
      disputeTxHash: string | null;
      resolveTxHash: string | null;
    };
  };
  artifactPath: string;
  proofHash: `0x${string}`;
  steps: AgentLogStep[];
}

export interface AgentManifest {
  schemaVersion: "v1";
  name: string;
  role: AgentRoleType;
  runtime: {
    name: string;
    version: string;
    providerStrategy: string[];
  };
  operator: {
    address: `0x${string}` | null;
  };
  chains: {
    chainId: number | null;
    rpcUrl: string;
    trustRegistry: `0x${string}` | null;
    covenant: `0x${string}` | null;
  };
  capabilities: string[];
  accountability: {
    taskCommitment: "covenant";
    identityStandard: "ERC-8004-compatible";
    proofFormat: "keccak256(canonical-json)" | "keccak256(canonical-proof-bundle)";
    disputeResolution: boolean;
    stakeBacked: boolean;
    receiptChain: string[];
    exportedArtifacts: string[];
  };
}

export interface RunRecord {
  id: string;
  taskId: string;
  agentRole: AgentRoleType;
  provider: string;
  model: string;
  status: "started" | "completed" | "failed";
  inputJson: string | null;
  logPath: string | null;
  outputJson: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChainActionRecord {
  id: string;
  taskId: string;
  action: string;
  actor: string;
  txHash: string;
  createdAt: number;
}

export interface ArbiterDecision {
  taskId: string;
  winner: "creator" | "executor";
  reason: string;
  createdAt: number;
  confidence: "low" | "medium" | "high";
  rationale: string[];
  reviewMode: "manual" | "ai";
}

export interface DisputeRecord {
  schemaVersion: "v1";
  taskId: string;
  reason: string;
  evidenceHash: `0x${string}`;
  createdAt: number;
  txHash: string;
}

export interface ReceiptRecord {
  schemaVersion: "v2";
  taskId: string;
  taskHash: `0x${string}` | null;
  covenantId: `0x${string}` | null;
  proofHash: `0x${string}` | null;
  createdAt: number;
  updatedAt: number;
  headHash: `0x${string}` | null;
  eventCount: number;
  eventFiles: string[];
  receipts: {
    createTxHash: string | null;
    submitTxHash: string | null;
    finalizeTxHash: string | null;
    disputeTxHash: string | null;
    resolveTxHash: string | null;
  };
}

export interface ReceiptEventRecord {
  schemaVersion: "v1";
  taskId: string;
  sequence: number;
  event: "createCovenant" | "submitCompletion" | "finalizeCompletion" | "disputeCovenant" | "resolveDispute";
  actor: string;
  txHash: string;
  createdAt: number;
  prevHash: `0x${string}` | null;
  snapshot: {
    taskHash: `0x${string}` | null;
    covenantId: `0x${string}` | null;
    proofHash: `0x${string}` | null;
  };
  metadata: Record<string, unknown>;
  attestation: SignatureRecord | null;
  eventHash: `0x${string}`;
}

export interface ProofBundleRecord {
  schemaVersion: "v1";
  taskId: string;
  taskHash: `0x${string}` | null;
  covenantId: `0x${string}` | null;
  artifactHash: `0x${string}`;
  verificationHash: `0x${string}`;
  evidenceRoot: `0x${string}`;
  planHash: `0x${string}`;
  budgetHash: `0x${string}`;
  guardrailsHash: `0x${string}`;
  executionTrace: ExecutionTraceEntry[];
  executionTraceHash: `0x${string}`;
  validatorResultsHash: `0x${string}`;
  artifactPath: string;
  agentLogPath: string;
  createdAt: number;
  operatorAttestation: SignatureRecord | null;
  proofHash: `0x${string}`;
}

export interface SignatureRecord {
  signer: `0x${string}` | null;
  signedAt: number;
  scheme: "eip191";
  purpose: string;
  statement: string;
  payloadHash: `0x${string}`;
  signature: `0x${string}`;
}

export interface ExecutionTraceEntry {
  attemptNumber: number;
  provider: string;
  model: string;
  artifactHash: `0x${string}`;
  verificationHash: `0x${string}`;
}

export interface DisputeEvidenceRecord {
  schemaVersion: "v1";
  taskId: string;
  reason: string;
  createdAt: number;
  taskSnapshot: {
    status: TaskStatus;
    covenantId: `0x${string}` | null;
    taskHash: `0x${string}` | null;
    proofHash: `0x${string}` | null;
  };
  artifactSnapshot: {
    artifactPath: string | null;
    summary: string | null;
    payloadHash: `0x${string}` | null;
    proofBundleHash: `0x${string}` | null;
  };
  verificationSnapshot: {
    profile: string;
    schemaSatisfied: boolean;
    missingFields: string[];
    notes: string[];
    validatorResults: AgentLog["verification"]["validatorResults"];
  } | null;
  executionEvidence: {
    inspectedFiles: Array<{ path: string; contentHash: `0x${string}` }>;
    budget: AgentLog["budget"] | null;
    guardrails: AgentLog["guardrails"] | null;
  } | null;
  receiptSnapshot: ReceiptRecord["receipts"];
  receiptHeadHash: `0x${string}` | null;
  chainActions: Array<{
    action: string;
    actor: string;
    txHash: string;
  }>;
  evidencePacks: EvidencePackRecord[];
}

export interface EvidencePackRecord {
  schemaVersion: "v1";
  packType: "identity" | "commitment" | "execution" | "verification" | "receipts" | "dispute";
  label: string;
  subject: string;
  payloadHash: `0x${string}` | null;
  facts: string[];
  linkedArtifacts: string[];
}

export interface ResolutionRecord {
  schemaVersion: "v1";
  taskId: string;
  winner: "creator" | "executor";
  reason: string;
  resolutionHash: `0x${string}`;
  createdAt: number;
  txHash: string;
  outcome: "completed" | "slashed";
}

export interface ArbiterReviewLog {
  schemaVersion: "v1";
  taskId: string;
  provider: string;
  model: string;
  createdAt: number;
  dispute: {
    reason: string;
    evidenceHash: `0x${string}` | null;
  };
  disputeEvidence: {
    verificationSnapshot: DisputeEvidenceRecord["verificationSnapshot"];
    receiptSnapshot: DisputeEvidenceRecord["receiptSnapshot"];
    artifactSnapshot: DisputeEvidenceRecord["artifactSnapshot"];
    evidencePacks: DisputeEvidenceRecord["evidencePacks"];
  };
  verificationSnapshot: {
    profile: string | null;
    schemaSatisfied: boolean;
    notes: string[];
    proofHash: `0x${string}` | null;
  };
  decision: ArbiterDecision;
  guardrails: string[];
  resolutionHash: `0x${string}`;
}

export interface GeneratedTaskPlan {
  title: string;
  instructions: string;
  outputSchema: Record<string, string>;
  reward: number;
  requiredStake: number;
  deadlineHours: number;
}

export interface ProviderContext {
  systemPrompt: string;
  userPrompt: string;
}

export interface ExecutionPlan {
  summary: string;
  steps: string[];
  successCriteria: string[];
  evidenceFocus: string[];
  maxAttempts: number;
}

export interface ModelResult<T> {
  provider: string;
  model: string;
  value: T;
}

export interface ModelProvider {
  readonly name: string;
  healthCheck?(): Promise<void>;
  generateTaskPlan(input: TaskSpec, context: ProviderContext): Promise<ModelResult<GeneratedTaskPlan>>;
  generateExecutionPlan(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<ExecutionPlan>>;
  generateArtifact(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Record<string, unknown>>>;
  generateArbiterDecision?(
    task: TaskRecord,
    reviewContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">>>;
}

export interface ProviderHealthStatus {
  provider: ProviderName;
  transport: "api" | "cli" | "mock" | "unconfigured";
  configured: boolean;
  healthy: boolean;
  checkedAt: number | null;
  source: "static" | "cache" | "live";
  error: string | null;
}

export interface TaskDetails {
  task: TaskRecord;
  artifact: ArtifactEnvelope | null;
  agentLog: AgentLog | null;
  proofBundle: ProofBundleRecord | null;
  receiptRecord: ReceiptRecord | null;
  receiptEvents: ReceiptEventRecord[];
  disputeRecord: DisputeRecord | null;
  disputeEvidence: DisputeEvidenceRecord | null;
  resolutionRecord: ResolutionRecord | null;
  arbiterLog: ArbiterReviewLog | null;
  runs: RunRecord[];
  chainActions: ChainActionRecord[];
}

export interface VerificationCheckResult {
  name: string;
  passed: boolean;
  severity: "error" | "warning";
  detail: string;
}

export interface TaskVerificationReport {
  schemaVersion: "v1";
  taskId: string;
  createdAt: number;
  status: "verified" | "flagged";
  summary: {
    passed: number;
    warnings: number;
    errors: number;
    total: number;
  };
  checks: VerificationCheckResult[];
}

export interface RuntimeConfig {
  workspaceRoot: string;
  dataDir: string;
  dbPath: string;
  artifactDir: string;
  rpcUrl: string;
  primaryProvider: Extract<ProviderName, "openai" | "mock">;
  fallbackProvider: Extract<ProviderName, "claude" | "mock">;
  chainId?: number;
  addresses?: {
    token: `0x${string}`;
    trustRegistry: `0x${string}`;
    covenant: `0x${string}`;
  };
  accounts?: {
    deployer: AccountConfig;
    creator: AccountConfig;
    executor: AccountConfig;
    arbiter: AccountConfig;
  };
}

export interface AccountConfig {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
}
