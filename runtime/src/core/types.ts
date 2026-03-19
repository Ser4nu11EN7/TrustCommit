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
    schemaSatisfied: boolean;
    missingFields: string[];
    notes: string[];
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
    };
    onchain: {
      proofHash: `0x${string}`;
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
    proofFormat: "keccak256(canonical-json)";
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
  runs: RunRecord[];
  chainActions: ChainActionRecord[];
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
