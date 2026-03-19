import { useEffect, useState, startTransition } from "react";

const API_BASE = (import.meta.env.VITE_RUNTIME_API_URL as string | undefined) ?? "http://127.0.0.1:3100";
const stepBlocks = Array.from({ length: 8 });
const STATUS_ORDER = ["draft", "created", "running", "submitted", "disputed", "completed", "slashed"] as const;

type ProviderHealth = {
  provider: "openai" | "claude" | "mock";
  healthy: boolean;
  configured: boolean;
  transport: "api" | "cli" | "mock" | "unconfigured";
};

type HealthResponse = {
  ok: boolean;
  chainId: number | null;
  rpcUrl: string;
  providers: Record<"openai" | "claude" | "mock", ProviderHealth>;
};

type AgentManifest = {
  schemaVersion: "v1";
  name: string;
  runtime: {
    name: string;
    version: string;
    providerStrategy: string[];
  };
  operator: {
    address: string | null;
  };
  chains: {
    chainId: number | null;
    rpcUrl: string;
    trustRegistry: string | null;
    covenant: string | null;
  };
  capabilities: string[];
  accountability: {
    exportedArtifacts: string[];
  };
};

type TaskRecord = {
  id: string;
  title: string;
  instructions: string;
  reward: number;
  requiredStake: number;
  status: string;
  covenantId: string | null;
  proofHash: string | null;
  taskHash: string | null;
  createdBy: string;
};

type TaskListResponse = {
  ok: boolean;
  tasks: TaskRecord[];
};

type ArtifactFileRef =
  | string
  | {
      path?: string;
      hash?: string;
      purpose?: string;
    };

type ArtifactPayload = {
  taskTitle?: string;
  summary?: string;
  inspectedFiles?: ArtifactFileRef[];
  notes?: string[];
};

type AgentLog = {
  plan: {
    summary: string;
    steps: string[];
    successCriteria: string[];
    maxAttempts: number;
    evidenceFocus: string[];
  };
  verification: {
    schemaSatisfied: boolean;
    missingFields: string[];
    notes: string[];
    validatorResults?: Array<{
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
      trustRegistry: string | null;
      operator: string | null;
    };
    taskCommitment: {
      taskHash: string | null;
      covenantId: string | null;
    };
    executionArtifacts: {
      artifactPath: string;
      logPath: string;
      proofBundlePath?: string;
    };
    onchain: {
      proofHash: string;
      artifactHash?: string;
      submitTxHash: string | null;
      finalizeTxHash: string | null;
      disputeTxHash: string | null;
      resolveTxHash: string | null;
    };
  };
  evidence: {
    files: Array<{ path: string; contentHash: string }>;
  };
  steps: Array<{ id: string; type: string; summary: string }>;
};

type RunRecord = {
  provider: string;
  model: string;
  createdAt: number;
  logPath: string | null;
};

type ChainAction = {
  action: string;
  txHash: string;
  createdAt: number;
};

type DisputeRecord = {
  reason: string;
  evidenceHash: string;
  createdAt: number;
  txHash: string;
};

type ReceiptRecord = {
  headHash?: string | null;
  proofHash: string | null;
  receipts: {
    createTxHash?: string | null;
    submitTxHash: string | null;
    finalizeTxHash: string | null;
    disputeTxHash: string | null;
    resolveTxHash: string | null;
  };
};

type ProofBundle = {
  proofHash: string;
  artifactPath: string;
  agentLogPath: string;
};

type DisputeEvidence = {
  reason: string;
  artifactSnapshot: {
    summary: string | null;
  };
  verificationSnapshot: {
    schemaSatisfied: boolean;
    notes: string[];
  } | null;
};

type ResolutionRecord = {
  winner: "creator" | "executor";
  reason: string;
  resolutionHash: string;
  createdAt: number;
  txHash: string;
  outcome: "completed" | "slashed";
};

type TaskDetailsResponse = {
  ok: boolean;
  task: TaskRecord;
  artifact: {
    payload: ArtifactPayload;
  } | null;
  agentLog: AgentLog | null;
  proofBundle: ProofBundle | null;
  receiptRecord: ReceiptRecord | null;
  disputeRecord: DisputeRecord | null;
  disputeEvidence: DisputeEvidence | null;
  resolutionRecord: ResolutionRecord | null;
  runs: RunRecord[];
  chainActions: ChainAction[];
};

type AgentManifestResponse = {
  ok: boolean;
  manifest: AgentManifest;
};

type DashboardState = {
  health: HealthResponse | null;
  manifest: AgentManifest | null;
  tasks: TaskRecord[];
  details: TaskDetailsResponse | null;
};

type IconName = "check_circle" | "cloud_done" | "route" | "terminal" | "data_object";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const baseClasses = `inline-flex items-center justify-center ${className}`.trim();

  if (name === "check_circle") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={baseClasses} fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.1 14.2-3.6-3.6 1.4-1.4 2.2 2.2 5-5 1.4 1.4Z" />
      </svg>
    );
  }

  if (name === "cloud_done") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={baseClasses} fill="currentColor">
        <path d="M19.35 10.04A7 7 0 0 0 5.3 8.69 5 5 0 0 0 6 18h12a4 4 0 0 0 1.35-7.96ZM10 16l-3-3 1.41-1.41L10 13.17l5.59-5.58L17 9Z" />
      </svg>
    );
  }

  if (name === "route") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={baseClasses} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M6 5h10" />
        <path d="M6 5v4" />
        <path d="M16 5a2 2 0 1 1 0 4a2 2 0 0 1 0-4Z" />
        <path d="M8 19H5v-4" />
        <path d="M8 19a2 2 0 1 1 0-4a2 2 0 0 1 0 4Z" />
        <path d="M8 15h5a3 3 0 0 0 3-3V9" />
      </svg>
    );
  }

  if (name === "terminal") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={baseClasses} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M4 6l4 4-4 4" />
        <path d="M11 18h9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={baseClasses} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter">
      <path d="M6 6h12v12H6z" />
      <path d="M10 10h4" />
      <path d="M10 14h6" />
    </svg>
  );
}

function ArbiterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="w-5 h-5 fill-none stroke-current"
      strokeWidth="2.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M14 4l6 6" />
      <path d="M12 6l6 6" />
      <path d="M8 10l6 6" />
      <path d="M6 12l6 6" />
      <path d="M4 20l8-8" />
      <path d="M15 3l6 6-2 2-6-6z" />
      <path d="M3 21h10" />
    </svg>
  );
}

function shortHash(value: string | null | undefined, size = 6) {
  if (!value) {
    return "Pending";
  }
  return `${value.slice(0, size + 2)}...${value.slice(-4)}`;
}

function formatToken(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "0.00";
  }
  return (value / 1_000_000).toFixed(2);
}

function formatTimestamp(value: number | null | undefined) {
  if (!value) {
    return "Pending";
  }
  return new Date(value).toLocaleString();
}

function headlineParts(title: string | undefined) {
  const safe = (title?.trim() || "Autonomous Accountable Agent").replace(/_/g, " ");
  const words = safe.split(/\s+/);
  if (words.length <= 2) {
    return [safe.toUpperCase()];
  }
  const splitPoint = Math.ceil(words.length / 2);
  return [words.slice(0, splitPoint).join(" ").toUpperCase(), words.slice(splitPoint).join(" ").toUpperCase()];
}

function statusLabel(status: string | undefined) {
  if (!status) {
    return "Awaiting";
  }
  return status.replaceAll("_", " ").toUpperCase();
}

function buildTimeline(status: string | undefined) {
  const activeIndex = Math.max(STATUS_ORDER.indexOf((status as (typeof STATUS_ORDER)[number]) ?? "draft"), 0);
  return [
    { label: "DRAFT", active: activeIndex >= 0, dashed: false },
    { label: "COVENANT", active: activeIndex >= 1, dashed: false },
    { label: "EXEC", active: activeIndex >= 2, dashed: false },
    { label: "PROOF", active: activeIndex >= 3, dashed: false, primary: activeIndex === 3 },
    { label: status === "disputed" ? "DISPUTE" : "SETTLE", active: activeIndex >= 4, dashed: status !== "disputed" && activeIndex < 4, primary: status === "disputed" }
  ] as const;
}

function topVerificationNote(agentLog: AgentLog | null, notes: string[]) {
  if (!agentLog) {
    return "Awaiting accountable execution data.";
  }
  if (agentLog.verification.schemaSatisfied) {
    return "Artifact matched the expected schema and stayed within inspected evidence.";
  }
  if (notes.length > 0) {
    return notes[0];
  }
  if (agentLog.verification.missingFields.length > 0) {
    return `Missing fields: ${agentLog.verification.missingFields.join(", ")}`;
  }
  return "Verification flagged the artifact for review.";
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return (await response.json()) as T;
}

function listInspectedFilePaths(payload: ArtifactPayload | null, agentLog: AgentLog | null) {
  if (payload?.inspectedFiles?.length) {
    return payload.inspectedFiles.map((file) => (typeof file === "string" ? file : file.path ?? "unknown"));
  }
  return agentLog?.evidence.files.map((file) => file.path) ?? [];
}

export default function App() {
  const [data, setData] = useState<DashboardState>({
    health: null,
    manifest: null,
    tasks: [],
    details: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [manifestResponse, tasksResponse, healthResult] = await Promise.all([
          fetchJson<AgentManifestResponse>("/agent/manifest"),
          fetchJson<TaskListResponse>("/tasks"),
          fetchJson<HealthResponse>("/health").catch(() => null)
        ]);

        const latestTask = tasksResponse.tasks[0] ?? null;
        const details = latestTask
          ? await fetchJson<TaskDetailsResponse>(`/tasks/${latestTask.id}`).catch(() => null)
          : null;

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setData({
            health: healthResult,
            manifest: manifestResponse.manifest,
            tasks: tasksResponse.tasks,
            details
          });
          setLoading(false);
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unknown error");
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  const task = data.details?.task ?? null;
  const artifact = data.details?.artifact?.payload ?? null;
  const agentLog = data.details?.agentLog ?? null;
  const receiptRecord = data.details?.receiptRecord ?? null;
  const proofBundle = data.details?.proofBundle ?? null;
  const disputeRecord = data.details?.disputeRecord ?? null;
  const disputeEvidence = data.details?.disputeEvidence ?? null;
  const resolutionRecord = data.details?.resolutionRecord ?? null;
  const latestRun = data.details?.runs.at(-1) ?? null;
  const latestAction = data.details?.chainActions.at(-1) ?? null;
  const timelineSteps = buildTimeline(task?.status);
  const completionRatio = task ? Math.min(STATUS_ORDER.indexOf((task.status as (typeof STATUS_ORDER)[number]) ?? "draft") + 2, stepBlocks.length) : 1;
  const titleParts = headlineParts(task?.title);
  const providerLabel = latestRun?.provider?.toUpperCase() ?? data.health?.providers.claude.transport?.toUpperCase() ?? "LOCAL";
  const systemHealthy = data.health ? Object.values(data.health.providers).some((provider) => provider.healthy) : false;
  const inspectedFiles = listInspectedFilePaths(artifact, agentLog);
  const notes = artifact?.notes ?? agentLog?.verification.notes ?? [];
  const verificationStatus = agentLog ? (agentLog.verification.schemaSatisfied ? "VERIFIED" : "FLAGGED") : error ? "DEGRADED" : "PENDING";
  const verificationNote = topVerificationNote(agentLog, notes);
  const guardrailCount = agentLog
    ? (agentLog.guardrails?.preExecution.length ?? 0) +
      (agentLog.guardrails?.duringExecution.length ?? 0) +
      (agentLog.guardrails?.preCommit.length ?? 0)
    : 0;
  const disputeabilityNote =
    task?.status === "disputed"
      ? "Arbiter lane active with reviewable receipt trail."
      : task?.status === "slashed"
        ? "The dispute concluded on-chain and the executor was slashed."
      : task?.status === "completed"
        ? "Dispute window settled on-chain with final receipts."
        : "Dispute lane remains available if verification fails.";
  const arbiterHeadline =
    task?.status === "disputed"
      ? "REVIEW"
      : resolutionRecord?.outcome === "slashed"
        ? "SLASHED"
        : resolutionRecord?.outcome === "completed"
          ? "RESOLVED"
          : "INACTIVE";
  const arbiterNote = resolutionRecord
    ? resolutionRecord.reason
    : disputeRecord
      ? disputeRecord.reason
      : "Dispute resolution handled on-chain";

  return (
    <div className="h-[100dvh] overflow-hidden bg-surface text-on-surface flex flex-col">
      <header className="bg-white border-b-4 border-black flex justify-between items-center w-full px-4 h-14 shrink-0 z-50">
        <div className="flex items-center h-full">
          <div className="text-2xl font-black text-black border-r-4 border-black h-full flex items-center pr-4 mr-4 italic uppercase tracking-tighter">
            TRUSTCOMMIT
          </div>
          <div className="hidden lg:block font-black uppercase tracking-widest text-[8px] opacity-40 leading-none">
            accountable agents / live runtime
            <br />
            {data.manifest?.runtime.name ?? "trustcommit-runtime"} // {data.manifest?.runtime.version ?? "loading"}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-primary text-white font-black uppercase text-[8px] px-2 py-0.5 tracking-widest">
            Network: {data.health?.chainId ?? "offline"}
          </div>
          <div className="hidden sm:block font-black uppercase text-[8px] tracking-widest">Model: {providerLabel}</div>
          <div className="flex items-center gap-2 font-black uppercase text-[8px] tracking-widest">
            <span className={`w-2 h-2 ${systemHealthy ? "bg-primary" : "bg-black"}`} />
            System: {systemHealthy ? "Healthy" : loading ? "Syncing" : "Offline"}
          </div>
          <button
            type="button"
            onClick={() => setRefreshNonce((value) => value + 1)}
            className="bg-black text-white brutalist-border-sm px-4 py-1 font-black uppercase text-xs tracking-tighter hover:bg-primary transition-colors"
          >
            {loading ? "Syncing" : "Refresh State"}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <section className="grid grid-cols-12 border-b-4 border-black flex-grow min-h-0">
          <div className="col-span-3 p-4 border-r-4 border-black bg-white flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="bg-black text-white inline-block px-2 py-0.5 font-black uppercase text-[8px] tracking-widest mb-4">
                Creator Agent
              </div>
              <h3 className="font-black text-3xl uppercase tracking-tighter leading-none mb-1">
                {task ? "COVENANT_MAKER" : "OFFLINE"}
              </h3>
              <div className="mono text-[9px] font-bold opacity-40 mb-6 uppercase tracking-widest">
                ID: {task?.createdBy?.toUpperCase() ?? "WAITING"}
              </div>
              <div className="space-y-4">
                <div className="border-l-4 border-black pl-3">
                  <div className="text-[8px] uppercase font-black opacity-40 mb-1">Task Plan</div>
                  <div className="text-sm font-black leading-tight">
                    {agentLog?.plan.summary ?? task?.instructions ?? "Connect the runtime API to populate this console with live evidence and receipts."}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] uppercase font-black opacity-40 mb-1">Task Hash</div>
                  <div className="mono text-[8px] break-all font-bold opacity-60">{shortHash(task?.taskHash)}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
              <Icon name="check_circle" className="h-5 w-5" />
              {task ? "Created Covenant" : "Awaiting API"}
            </div>
          </div>

          <div className="col-span-6 p-6 flex flex-col justify-center relative bg-white overflow-hidden border-r-4 border-black">
            <div className="absolute top-0 right-0 bg-primary text-white px-4 py-2 text-sm font-black uppercase tracking-tighter italic">
              {error ? "Degraded" : statusLabel(task?.status)}
            </div>
            <div className="mb-6">
              <div className="font-black uppercase text-[8px] tracking-[0.3em] opacity-30 mb-2">
                protocol active // accountable runtime
              </div>
              <h1 className="font-black text-4xl lg:text-6xl uppercase tracking-tighter leading-[0.85] mb-4">
                {titleParts[0]}
                <br />
                {titleParts[1] ?? "COUNTERPARTY"}
                <br />
                <span className="text-primary">{task ? `#${task.id.slice(-4).toUpperCase()}` : "#LIVE"}</span>
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-0 border-4 border-black mb-6">
              <div className="p-3 border-r-4 border-black">
                <div className="text-[8px] uppercase font-black opacity-40 mb-1">Reward Pool</div>
                <div className="text-4xl font-black text-primary tracking-tighter leading-none">{formatToken(task?.reward)}</div>
                <div className="text-sm font-black uppercase">USDC</div>
              </div>
              <div className="p-3">
                <div className="text-[8px] uppercase font-black opacity-40 mb-1">Locked Stake</div>
                <div className="text-4xl font-black tracking-tighter leading-none">{formatToken(task?.requiredStake)}</div>
                <div className="text-sm font-black uppercase">USDC</div>
              </div>
            </div>
            <div className="w-full">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest">Execution Integrity</span>
                <span className="text-[10px] font-black mono text-primary">{verificationStatus}</span>
              </div>
              <div className="flex gap-0.5 w-full bg-surface-container-high border-2 border-black p-0.5">
                {stepBlocks.map((_, index) => (
                  <div key={index} className={index < completionRatio ? "step-block" : "step-block-empty"} />
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-3 p-4 bg-white flex flex-col justify-between overflow-y-auto">
            <div className="text-right">
              <div className="bg-primary text-white inline-block px-2 py-0.5 font-black uppercase text-[8px] tracking-widest mb-4">
                Executor Agent
              </div>
              <h3 className="font-black text-3xl uppercase tracking-tighter leading-none mb-1">
                {data.manifest?.name.replace(" ", "_") ?? "EXECUTOR"}
              </h3>
              <div className="mono text-[9px] font-bold opacity-40 mb-6 uppercase tracking-widest">Model: {latestRun?.model ?? "pending"}</div>
              <div className="space-y-4">
                <div className="border-r-4 border-black pr-3">
                  <div className="text-[8px] uppercase font-black opacity-40 mb-1">Summary</div>
                  <div className="text-sm font-black leading-tight italic">
                    {artifact?.summary ?? error ?? "Runtime API unavailable. Start the local server to stream accountable execution data."}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] uppercase font-black opacity-40 mb-1">Artifact</div>
                  <div className="mono text-[8px] break-all font-bold opacity-60">
                    {task ? `${task.id}/artifact.json` : ".trustcommit/artifacts/..."}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] uppercase font-black opacity-40 mb-1">Proof Bundle</div>
                  <div className="mono text-[8px] break-all font-bold opacity-60">
                    {proofBundle?.artifactPath ? `${task?.id}/proof_bundle.json` : ".trustcommit/artifacts/..."}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
              {task?.proofHash ? "Submitted Proof" : "Waiting for Task"}
              <Icon name="cloud_done" className="h-5 w-5" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-12 border-b-4 border-black shrink-0">
          <div className="col-span-6 grid grid-cols-3 border-r-4 border-black h-16">
            <div className="px-3 py-2 border-r-2 border-black bg-white">
              <div className="text-[7px] font-black uppercase opacity-40">Covenant</div>
              <div className="font-black text-lg">{shortHash(task?.covenantId, 4)}</div>
            </div>
            <div className="px-3 py-2 border-r-2 border-black bg-white">
              <div className="text-[7px] font-black uppercase opacity-40">Proof Root</div>
              <div className="mono text-[10px] font-black truncate">{shortHash(task?.proofHash)}</div>
            </div>
            <div className="px-3 py-2 bg-white">
              <div className="text-[7px] font-black uppercase text-primary">Window</div>
              <div className="font-black text-lg leading-none">
                {task?.status === "submitted" ? "OPEN" : task?.status === "completed" ? "SETTLED" : "LIVE"}{" "}
                <span className="text-[8px] opacity-40 font-bold uppercase">{latestAction ? shortHash(latestAction.txHash, 4) : "PENDING"}</span>
              </div>
            </div>
          </div>

          <div className="col-span-6 flex items-center bg-white px-2 overflow-x-auto gap-1">
            <div className="text-[8px] font-black uppercase mr-2 shrink-0 flex items-center gap-1">
              <Icon name="route" className="h-4 w-4" />
              Timeline:
            </div>
            <div className="flex items-center gap-0.5">
              {timelineSteps.map((step, index) => (
                <div key={step.label} className="flex items-center gap-0.5">
                  <div
                    className={[
                      "border-2 border-black px-1.5 py-0.5 text-[8px] font-black",
                      step.primary ? "bg-primary text-white animate-pulse" : "",
                      step.active && !step.primary ? "bg-black text-white" : "",
                      step.dashed ? "border-dashed opacity-30" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {step.label}
                  </div>
                  {index < timelineSteps.length - 1 ? (
                    <div className={`w-2 h-0.5 bg-black ${step.primary ? "opacity-20" : ""}`} />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 border-b-4 border-black shrink-0 bg-white">
          <div className="px-4 py-3 border-r-4 border-black">
            <div className="text-[8px] font-black uppercase opacity-40 mb-1">Evidence</div>
            <div className="text-lg font-black uppercase tracking-tighter leading-none mb-1">
              {inspectedFiles.length} Files Hashed
            </div>
            <div className="text-[10px] font-black italic leading-tight">
              Workspace inspection was recorded before proof submission.
            </div>
          </div>
          <div className="px-4 py-3 border-r-4 border-black">
            <div className="text-[8px] font-black uppercase opacity-40 mb-1">Receipts</div>
            <div className="text-lg font-black uppercase tracking-tighter leading-none mb-1">
              {data.details?.chainActions.length ?? 0} Onchain Actions
            </div>
            <div className="text-[10px] font-black italic leading-tight">
              Covenant creation, proof submission, and settlement remain inspectable.
            </div>
          </div>
            <div className="px-4 py-3">
              <div className="text-[8px] font-black uppercase opacity-40 mb-1">Disputeability</div>
              <div className="text-lg font-black uppercase tracking-tighter leading-none mb-1">
                {task?.status === "disputed"
                  ? "Review Open"
                  : resolutionRecord?.outcome === "slashed"
                    ? "Slash Recorded"
                    : resolutionRecord?.outcome === "completed"
                      ? "Resolved Onchain"
                      : "Arbiter Ready"}
              </div>
              <div className="text-[10px] font-black italic leading-tight">{disputeabilityNote}</div>
            </div>
        </section>

        <section className="grid grid-cols-2 flex-grow min-h-0 border-b-4 border-black">
          <div className="border-r-4 border-black bg-white flex flex-col h-full">
            <div className="bg-black text-white px-3 py-1 font-black uppercase tracking-widest text-[8px] flex justify-between items-center shrink-0">
              <span>Evidence Trail</span>
              <Icon name="terminal" className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="p-4 flex flex-col justify-center flex-grow overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="border-l-2 border-black p-1">
                  <div className="text-3xl font-black leading-none">{inspectedFiles.length}</div>
                  <div className="text-[7px] uppercase font-black opacity-40 mt-1">Evidence</div>
                </div>
                <div className="border-l-2 border-primary p-1">
                  <div className="text-3xl font-black text-primary leading-none">{agentLog?.budget?.modelCalls ?? 0}</div>
                  <div className="text-[7px] uppercase font-black opacity-40 mt-1">Model Calls</div>
                </div>
                <div className="border-l-2 border-black p-1">
                  <div className="text-3xl font-black leading-none">{guardrailCount}</div>
                  <div className="text-[7px] uppercase font-black opacity-40 mt-1">Guardrails</div>
                </div>
              </div>
              <div className="p-3 border-4 border-black bg-surface-container-low italic text-sm font-black leading-tight relative">
                <div className="absolute -top-2 -left-2 bg-primary text-white px-1.5 py-0.5 text-[7px] font-black not-italic">
                  Log
                </div>
                {verificationNote}
              </div>
            </div>
          </div>

          <div className="bg-white flex flex-col h-full">
            <div className="bg-black text-white px-3 py-1 font-black uppercase tracking-widest text-[8px] flex justify-between items-center shrink-0">
              <span>Receipts + Verification</span>
              <Icon name="data_object" className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="p-4 space-y-2 mono text-[10px] overflow-y-auto flex-grow">
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Timestamp</span>
                <span className="font-black">{formatTimestamp(latestRun?.createdAt)}</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Execution Engine</span>
                <span className="font-black">{latestRun?.model ?? "pending"}</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Evidence Focus</span>
                <span className="font-black">{agentLog?.plan.evidenceFocus.length ?? 0} files</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Budget Policy</span>
                <span className="font-black">{agentLog?.budget?.attemptsUsed ?? 0}/{agentLog?.budget?.attemptsAllowed ?? 0} attempts</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Receipt Head</span>
                <span className="font-black">{shortHash(receiptRecord?.headHash ?? null)}</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Submit Receipt</span>
                <span className="font-black">{shortHash(receiptRecord?.receipts.submitTxHash ?? latestAction?.txHash)}</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Dispute Receipt</span>
                <span className="font-black">{shortHash(disputeRecord?.txHash ?? receiptRecord?.receipts.disputeTxHash)}</span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Resolution Receipt</span>
                <span className="font-black">{shortHash(resolutionRecord?.txHash ?? receiptRecord?.receipts.resolveTxHash)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="uppercase opacity-40 font-black text-[7px]">Validation</span>
                <span className="font-black text-xs text-primary italic">
                  {agentLog?.verification.schemaSatisfied ? "schema + validators verified" : "receipt flagged for review"}
                </span>
              </div>
              <div className="flex justify-between border-b-2 border-black pb-1">
                <span className="uppercase opacity-40 font-black text-[7px]">Validator Checks</span>
                <span className="font-black">{agentLog?.verification.validatorResults?.length ?? 0}</span>
              </div>
              {notes.length > 0 ? (
                <div className="border-t-2 border-black pt-2 text-[9px] leading-tight">
                  <span className="uppercase opacity-40 font-black text-[7px] block mb-1">Verifier Note</span>
                  <span className="font-black italic text-primary">{disputeEvidence?.verificationSnapshot?.notes[0] ?? notes[0]}</span>
                </div>
              ) : null}
              {agentLog?.guardrails?.preCommit.length ? (
                <div className="border-t-2 border-black pt-2 text-[9px] leading-tight">
                  <span className="uppercase opacity-40 font-black text-[7px] block mb-1">Commit Guardrail</span>
                  <span className="font-black italic text-primary">{agentLog.guardrails.preCommit[0]}</span>
                </div>
              ) : null}
              {resolutionRecord ? (
                <div className="border-t-2 border-black pt-2 text-[9px] leading-tight">
                  <span className="uppercase opacity-40 font-black text-[7px] block mb-1">Arbiter Outcome</span>
                  <span className="font-black italic text-primary">
                    {resolutionRecord.winner.toUpperCase()} // {resolutionRecord.outcome.toUpperCase()}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="bg-black p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary flex items-center justify-center border-2 border-white shrink-0">
              <span className="text-white">
                <ArbiterIcon />
              </span>
            </div>
            <div>
              <h4 className="font-black uppercase text-xl text-white tracking-tighter leading-none">
                Arbiter: <span className="text-primary italic">{arbiterHeadline}</span>
              </h4>
              <p className="text-[7px] uppercase font-bold tracking-[0.1em] text-white opacity-40 mt-1">
                {arbiterNote}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRefreshNonce((value) => value + 1)}
            className="border-2 border-white px-4 py-2 bg-white font-black uppercase text-[10px] hover:bg-primary hover:text-white transition-all transform active:scale-95 italic"
          >
            Governance View
          </button>
        </section>
      </main>

      <footer className="bg-black border-t-4 border-primary flex justify-between items-center w-full px-4 h-12 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-white px-1 py-0.5 font-black text-xs italic uppercase">T/C</div>
          <div className="text-white font-black text-[8px] uppercase tracking-[0.2em] opacity-60">
            {error ? "System Core // API disconnected" : "System Core // Receipts synchronized"}
          </div>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-primary font-black text-[6px] uppercase tracking-widest">Routing</span>
            <span className="text-white font-black text-[8px] uppercase">
              {data.manifest?.runtime.providerStrategy.join(" -> ") ?? "Local API"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-primary font-black text-[6px] uppercase tracking-widest">DB</span>
            <span className="text-white font-black text-[8px] uppercase">SQLITE</span>
          </div>
        </div>
        <div className="font-black text-[8px] uppercase tracking-widest text-white opacity-20 border-l border-white/20 pl-4">
          Contracts: {shortHash(data.manifest?.chains.covenant)}
        </div>
      </footer>
    </div>
  );
}
