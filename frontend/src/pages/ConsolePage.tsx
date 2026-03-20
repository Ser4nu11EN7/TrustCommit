// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_RUNTIME_API_URL as string | undefined) ?? 'http://127.0.0.1:3100';

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Request failed: ${path}`);
  }
  return payload;
}

function shortHash(value, size = 4) {
  if (!value) {
    return 'PENDING';
  }
  return `${value.slice(0, size + 2)}...${value.slice(-4)}`;
}

function formatToken(value) {
  if (typeof value !== 'number') {
    return '0.00';
  }
  return (value / 1_000_000).toFixed(2);
}

function statusLabel(status) {
  if (!status) {
    return 'Awaiting';
  }
  return status.replaceAll('_', ' ');
}

function statusColor(status) {
  switch (status) {
    case 'completed':
      return '#ffffff';
    case 'submitted':
      return '#a3a3a3';
    case 'disputed':
    case 'slashed':
      return '#ffffff';
    case 'created':
    case 'running':
      return '#737373';
    default:
      return '#525252';
  }
}

const customStyles = {
  body: {
    backgroundColor: '#000000',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Etext %7B font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: rgba(255,255,255,0.03); letter-spacing: 4px; %7D%3C/style%3E%3Ctext x='0' y='10'%3E00000000%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/........%3C/text%3E%3Ctext x='0' y='25'%3E%5C/%5C/%5C/%5C/%5C/%5C/0000000000000000%5C/%5C/%5C/%5C/%5C/%3C/text%3E%3Ctext x='0' y='40'%3E......%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/00000000%3C/text%3E%3Ctext x='0' y='55'%3E000000000000%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/......%3C/text%3E%3Ctext x='0' y='70'%3E%5C/%5C/%5C/%5C/%5C/%5C/0000000000000000%5C/%5C/%5C/%5C/%5C/%3C/text%3E%3Ctext x='0' y='85'%3E......%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/00000000%3C/text%3E%3Ctext x='0' y='100'%3E000000000000%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/......%3C/text%3E%3Ctext x='0' y='115'%3E%5C/%5C/%5C/%5C/%5C/%5C/0000000000000000%5C/%5C/%5C/%5C/%5C/%3C/text%3E%3Ctext x='0' y='130'%3E......%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/00000000%3C/text%3E%3Ctext x='0' y='145'%3E000000000000%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/%5C/......%3C/text%3E%3C/svg%3E")`,
    color: '#ffffff',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    overflow: 'hidden',
  },
  pseudoBefore: {
    content: '"T"',
    position: 'fixed',
    top: '-10%',
    left: '2%',
    fontSize: '50vw',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 100,
    lineHeight: 1,
    color: 'rgba(255,255,255,0.02)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  pseudoAfter: {
    content: '"C"',
    position: 'fixed',
    bottom: '-10%',
    right: '2%',
    fontSize: '50vw',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 100,
    lineHeight: 1,
    color: 'rgba(255,255,255,0.02)',
    zIndex: 0,
    pointerEvents: 'none',
  },
};

export function ConsolePage() {
  const [clock, setClock] = useState('00:00:00');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedCovenant, setSelectedCovenant] = useState(null);
  const [activeNav, setActiveNav] = useState('Covenants');
  const [downloadHover, setDownloadHover] = useState(false);
  const [health, setHealth] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [verification, setVerification] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [disputeDraft, setDisputeDraft] = useState('');
  const [disputeComposeOpen, setDisputeComposeOpen] = useState(false);
  const [selectedArtifactKey, setSelectedArtifactKey] = useState(null);

  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500&family=JetBrains+Mono:wght@100;300;400&display=swap');
      * { box-shadow: none !important; border-radius: 0 !important; scrollbar-width: thin; scrollbar-color: #525252 transparent; }
      ::-webkit-scrollbar { width: 2px; height: 2px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #525252; }
      .blink { animation: blinker 1s steps(2, start) infinite; }
      @keyframes blinker { 50% { opacity: 0; } }
      .pulse-border { animation: pulseBorder 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      @keyframes pulseBorder {
        0%, 100% { border-color: rgba(255,255,255,0.08); }
        50% { border-color: #ffffff; }
      }
      .log-entry { position: relative; padding-left: 1.2rem; }
      .log-entry::before {
        content: ''; position: absolute; left: 0; top: 0.45em; width: 5px; height: 5px;
        background: transparent; border: 1px solid #525252;
      }
      .log-entry.success::before { background: #ffffff; border-color: #ffffff; }
      .log-entry.warn::before { background: #a3a3a3; border-color: #a3a3a3; }
      .log-entry.error::before { background: #ffffff; border-color: #ffffff; }
      .corner-idx { opacity: 0.3; font-size: 0.75rem; letter-spacing: 0.1em; position: fixed; }
      .corner-idx.tl { top: 6px; left: 8px; }
      .corner-idx.tr { top: 6px; right: 8px; }
      .corner-idx.bl { bottom: 6px; left: 8px; }
      .corner-idx.br { bottom: 6px; right: 8px; }
      .dither-hover { transition: all 0.2s; }
      .dither-hover:hover { background-color: #ffffff !important; color: #000000 !important; border-color: #ffffff !important; }
      .dither-hover:hover * { color: #000000 !important; border-color: #000000 !important; }
      .selection-custom ::selection { background: #ffffff; color: #000000; }
    `;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }) + ' UTC';
      setClock(timeString);
    };
    const interval = setInterval(updateClock, 1000);
    updateClock();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      setLoading(true);
      setError(null);
      try {
        const [manifestResponse, tasksResponse, healthResponse] = await Promise.all([
          fetchJson('/agent/manifest'),
          fetchJson('/tasks'),
          fetchJson('/health').catch(() => null)
        ]);

        if (cancelled) {
          return;
        }

        setManifest(manifestResponse.manifest);
        setTasks(tasksResponse.tasks);
        setHealth(healthResponse);
        setSelectedCovenant((current) => {
          if (current && tasksResponse.tasks.some((task) => task.id === current)) {
            return current;
          }
          return tasksResponse.tasks[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBase();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  useEffect(() => {
    if (!selectedCovenant) {
      setDetails(null);
      return;
    }

    let cancelled = false;
    setDetailsLoading(true);

    fetchJson(`/tasks/${selectedCovenant}`)
      .then((response) => {
        if (!cancelled) {
          setDetails(response);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load task details');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCovenant, refreshNonce]);

  useEffect(() => {
    if (!selectedCovenant) {
      setVerification(null);
      return;
    }

    let cancelled = false;
    setVerificationLoading(true);

    fetchJson(`/tasks/${selectedCovenant}/verify`)
      .then((response) => {
        if (!cancelled) {
          setVerification(response.report);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(loadError instanceof Error ? loadError.message : 'Failed to verify task');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVerificationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCovenant, refreshNonce]);

  useEffect(() => {
    setSelectedArtifactKey(null);
  }, [selectedCovenant]);

  const navItems = ['Covenants', 'Registry', 'Disputes', 'Staking'];

  const filteredTasks = useMemo(() => {
    if (activeTab === 'active') {
      return tasks.filter((task) => !['completed', 'slashed'].includes(task.status));
    }
    if (activeTab === 'pending') {
      return tasks.filter((task) => ['draft', 'created', 'running'].includes(task.status));
    }
    return tasks.filter((task) => ['completed', 'slashed'].includes(task.status));
  }, [activeTab, tasks]);

  const selectedTask = details?.task ?? tasks.find((task) => task.id === selectedCovenant) ?? null;
  const selectedArtifact = details?.artifact?.payload ?? null;
  const selectedLog = details?.agentLog ?? null;
  const latestRun = details?.runs?.[details.runs.length - 1] ?? null;
  const inspectedFiles = selectedArtifact?.inspectedFiles?.map((file) => typeof file === 'string' ? file : file.path).filter(Boolean)
    ?? selectedLog?.evidence?.files?.map((file) => file.path)
    ?? [];

  const covenants = filteredTasks.map((task) => ({
    id: task.id,
    status: statusLabel(task.status),
    statusColor: statusColor(task.status),
    title: task.title,
    agent: (manifest?.name ?? 'runtime').toUpperCase().replaceAll(' ', '_'),
    stake: `${formatToken(task.requiredStake)} USDC`,
    highlighted: selectedCovenant === task.id,
    disputed: task.status === 'disputed' || task.status === 'slashed'
  }));

  const logEntries = [
    ...(latestRun ? [{ time: `[${clock.slice(0, 8)}]`, msg: `Execution container booted with ${latestRun.model}.`, type: 'success' }] : []),
    ...(selectedLog ? [{ time: '[PLAN]', msg: selectedLog.plan.summary, type: 'success' }] : []),
    ...((selectedLog?.steps ?? []).slice(0, 6).map((step) => ({
      time: `[${step.type.toUpperCase()}]`,
      msg: step.summary,
      type: step.type === 'verify' && !selectedLog?.verification?.schemaSatisfied ? 'warn' : ''
    }))),
    ...((details?.chainActions ?? []).slice(-4).map((action) => ({
      time: `[${new Date(action.createdAt).toLocaleTimeString('en-US', { hour12: false })}]`,
      msg: `${action.action} committed onchain (${shortHash(action.txHash)})`,
      type: 'success'
    }))),
    ...(details?.disputeRecord ? [{ time: '[DISPUTE]', msg: details.disputeRecord.reason, type: 'warn' }] : []),
    ...(details?.resolutionRecord ? [{ time: '[RESOLUTION]', msg: `${details.resolutionRecord.winner} prevailed: ${details.resolutionRecord.reason}`, type: details.resolutionRecord.outcome === 'slashed' ? 'error' : 'success' }] : []),
    ...(error ? [{ time: '[ERROR]', msg: error, type: 'error' }] : [])
  ].slice(0, 14);

  const canRun = selectedTask?.status === 'created' || selectedTask?.status === 'running';
  const canFinalize = selectedTask?.status === 'submitted' && !details?.disputeRecord;

  const artifactEntries = [
    ...(details?.proofBundle
      ? [{
          key: 'proof_bundle',
          type: 'PFB',
          name: 'proof_bundle.json',
          size: 'signed',
          hash: shortHash(details.proofBundle.proofHash, 6),
          previewTitle: 'Signed Proof Bundle',
          previewLines: [
            `Signer ${shortHash(details.proofBundle.operatorAttestation?.signer, 6)}`,
            `Execution trace ${shortHash(details.proofBundle.executionTraceHash, 6)}`,
            `Receipt head ${shortHash(details.proofBundle.receiptHead, 6)}`,
          ],
        }]
      : []),
    ...(details?.artifact
      ? [{
          key: 'artifact',
          type: 'ART',
          name: 'artifact.json',
          size: `${inspectedFiles.length} refs`,
          hash: shortHash(details.task?.proofHash, 6),
          previewTitle: selectedArtifact?.taskTitle ?? selectedTask?.title ?? 'Artifact Output',
          previewLines: [
            selectedArtifact?.summary ?? 'No structured summary recorded.',
            ...(selectedArtifact?.notes ?? []).slice(0, 2),
            ...(selectedArtifact?.filesToModify ?? []).slice(0, 2).map((entry) => `File ${entry}`),
            ...(selectedArtifact?.acceptanceChecks ?? []).slice(0, 2).map((entry) => `Check ${entry}`),
          ].filter(Boolean),
        }]
      : []),
    ...(details?.receiptRecord
      ? [{
          key: 'receipt_record',
          type: 'RCP',
          name: 'receipt_record.json',
          size: 'append-only',
          hash: shortHash(details.receiptRecord.headHash, 6),
          previewTitle: 'Receipt Chain',
          previewLines: [
            `Events ${details.receiptRecord.eventCount}`,
            `Create ${shortHash(details.receiptRecord.receipts.createTxHash, 6)}`,
            `Accept ${shortHash(details.receiptRecord.receipts.acceptTxHash, 6)}`,
            details.receiptRecord.receipts.submitTxHash ? `Submit ${shortHash(details.receiptRecord.receipts.submitTxHash, 6)}` : 'Submit pending',
            details.receiptRecord.receipts.finalizeTxHash ? `Finalize ${shortHash(details.receiptRecord.receipts.finalizeTxHash, 6)}` : 'Finalize pending',
          ],
        }]
      : []),
    ...(details?.agentLog
      ? [{
          key: 'agent_log',
          type: 'LOG',
          name: 'agent_log.json',
          size: `${details.agentLog.steps.length} steps`,
          hash: shortHash(details.receiptRecord?.proofHash, 6),
          previewTitle: 'Execution Log',
          previewLines: [
            details.agentLog.plan.summary,
            `Budget ${details.agentLog.budget.attemptsUsed}/${details.agentLog.budget.attemptsAllowed} attempts`,
            `Model calls ${details.agentLog.budget.modelCalls}`,
            `Guardrails ${details.agentLog.guardrails.preExecution.length + details.agentLog.guardrails.duringExecution.length + details.agentLog.guardrails.preCommit.length}`,
          ].filter(Boolean),
        }]
      : []),
    ...(details?.disputeRecord
      ? [{
          key: 'dispute',
          type: 'DSP',
          name: 'dispute.json',
          size: 'challenge',
          hash: shortHash(details.disputeRecord.evidenceHash, 6),
          previewTitle: 'Dispute Record',
          previewLines: [
            details.disputeRecord.reason,
            `Tx ${shortHash(details.disputeRecord.txHash, 6)}`,
          ],
        }]
      : []),
    ...(details?.resolutionRecord
      ? [{
          key: 'resolution',
          type: 'RSL',
          name: 'resolution.json',
          size: details.resolutionRecord.outcome,
          hash: shortHash(details.resolutionRecord.resolutionHash, 6),
          previewTitle: 'Resolution Record',
          previewLines: [
            `Winner ${details.resolutionRecord.winner}`,
            details.resolutionRecord.reason,
            `Tx ${shortHash(details.resolutionRecord.txHash, 6)}`,
          ],
        }]
      : []),
  ];

  const selectedArtifactEntry =
    artifactEntries.find((entry) => entry.key === selectedArtifactKey) ?? artifactEntries[0] ?? null;

  async function reloadConsole(preferredTaskId = selectedCovenant) {
    const [manifestResponse, tasksResponse, healthResponse] = await Promise.all([
      fetchJson('/agent/manifest'),
      fetchJson('/tasks'),
      fetchJson('/health').catch(() => null)
    ]);
    setManifest(manifestResponse.manifest);
    setTasks(tasksResponse.tasks);
    setHealth(healthResponse);
    const nextTaskId =
      preferredTaskId && tasksResponse.tasks.some((task) => task.id === preferredTaskId)
        ? preferredTaskId
        : tasksResponse.tasks[0]?.id ?? null;
    setSelectedCovenant(nextTaskId);
  }

  async function handleCreateTask() {
    setActionLoading('create');
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await postJson('/tasks', {
        title: 'Review a policy-bound agent commitment',
        instructions: 'Inspect the available evidence, produce a bounded recommendation, and commit only if the accountable evidence trail remains internally consistent.',
        reward: 10000000,
        requiredStake: 500000000,
        deadlineHours: 24,
      });
      setActionMessage(`Created ${response.task.id}`);
      await reloadConsole(response.task.id);
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : 'Failed to create covenant');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTaskAction(action, options = {}) {
    if (!selectedTask?.id) {
      return;
    }

    const body = options;

    setActionLoading(action);
    setActionError(null);
    setActionMessage(null);
    try {
      if (action === 'verify') {
        const response = await fetchJson(`/tasks/${selectedTask.id}/verify`);
        setVerification(response.report);
        setActionMessage(`Verification ${response.report.status}`);
      } else if (action === 'export') {
        const response = await postJson(`/tasks/${selectedTask.id}/export`, {});
        setActionMessage(`Bundle exported to ${response.result.outputDir}`);
      } else if (action === 'arbiter') {
        await postJson(`/tasks/${selectedTask.id}/arbiter`, { mode: 'auto' });
        setActionMessage('Arbiter review recorded');
        await reloadConsole(selectedTask.id);
        setRefreshNonce((value) => value + 1);
      } else {
        await postJson(`/tasks/${selectedTask.id}/${action}`, body);
        setActionMessage(`${action} committed`);
        if (action === 'dispute') {
          setDisputeDraft('');
          setDisputeComposeOpen(false);
        }
        await reloadConsole(selectedTask.id);
        setRefreshNonce((value) => value + 1);
      }
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  function actionLinkStyle(disabled = false) {
    return {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.62rem',
      color: disabled ? '#525252' : '#ffffff',
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      marginTop: '0.4rem',
      textDecoration: disabled ? 'none' : 'underline',
      textUnderlineOffset: '0.18rem',
    };
  }

  return (
      <div
        className="selection-custom"
        style={{
          ...customStyles.body,
          fontFamily: "'Inter', sans-serif",
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '0.875rem',
        }}
      >
        {/* Background pseudo-elements */}
        <div style={customStyles.pseudoBefore} aria-hidden="true">T</div>
        <div style={customStyles.pseudoAfter} aria-hidden="true">C</div>

        {/* Corner indices */}
        <div className="corner-idx tl font-mono" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem' }}>OP.CON</div>
        <div className="corner-idx tr font-mono" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem' }}>T.C</div>
        <div className="corner-idx bl font-mono" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem' }}>v1.0.4</div>
        <div className="corner-idx br font-mono" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem' }}>ACTV</div>

        {/* Header */}
        <header
          style={{
            height: '3rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
            backgroundColor: '#000000',
            flexShrink: 0,
            zIndex: 10,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ fontWeight: 200, fontSize: '1.125rem', letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#ffffff', borderRadius: '9999px', display: 'inline-block' }}></span>
              TrustCommit{' '}
              <span style={{ color: '#a3a3a3', fontSize: '0.875rem', marginLeft: '0.25rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', fontWeight: 400 }}>
                // Console
              </span>
            </div>
            <div style={{ height: '1rem', width: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }}></div>
            <nav style={{ display: 'flex', gap: '1rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
              {navItems.map((item) => (
                <a
                  key={item}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setActiveNav(item); }}
                  style={{ color: activeNav === item ? '#ffffff' : '#a3a3a3', textDecoration: 'none', transition: 'color 0.15s' }}
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '0.375rem', height: '0.375rem', backgroundColor: health && Object.values(health.providers).some((provider) => provider.healthy) ? '#ffffff' : '#525252', borderRadius: '9999px', display: 'inline-block' }}></span>
              <span style={{ color: '#ffffff' }}>{health?.chainId ? `Chain ${health.chainId}` : 'Offline'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Verifiers:</span>
              <span style={{ color: '#ffffff' }}>{verification?.summary?.total ?? selectedLog?.verification?.validatorResults?.length ?? 0}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>SYS ID:</span>
              <span style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.1)', padding: '0.125rem 0.375rem' }}>{shortHash(manifest?.chains?.covenant, 4)}</span>
            </div>
            <div style={{ color: '#525252', width: '7rem', textAlign: 'right' }}>{clock}</div>
          </div>
        </header>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* Left Sidebar */}
          <aside style={{ width: '320px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: '#000000', flexShrink: 0, zIndex: 10 }}>

            {/* New Covenant Button */}
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => handleCreateTask()}
                className="dither-hover"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <span>+</span> Define New Covenant
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
              {[{ key: 'active', label: `Active (${tasks.filter((task) => !['completed', 'slashed'].includes(task.status)).length})` }, { key: 'pending', label: `Pending (${tasks.filter((task) => ['draft', 'created', 'running'].includes(task.status)).length})` }, { key: 'settled', label: `Settled (${tasks.filter((task) => ['completed', 'slashed'].includes(task.status)).length})` }].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.05)' : 'transparent',
                    color: activeTab === tab.key ? '#ffffff' : '#a3a3a3',
                    borderBottom: activeTab === tab.key ? '1px solid #ffffff' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2em',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Covenant List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {covenants.map((cov) => (
                <div
                  key={cov.id}
                  onClick={() => setSelectedCovenant(cov.id)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: selectedCovenant === cov.id ? 'rgba(255,255,255,0.05)' : cov.disputed ? 'rgba(255,255,255,0.02)' : 'transparent',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {selectedCovenant === cov.id && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', backgroundColor: '#737373' }}></div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: cov.disputed ? '#ffffff' : selectedCovenant === cov.id ? '#ffffff' : '#a3a3a3' }}>{cov.id}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span className={cov.status === 'Verifying' || cov.status === 'Executing' ? 'blink' : ''} style={{ width: '0.375rem', height: '0.375rem', backgroundColor: cov.statusColor, borderRadius: '9999px', display: 'inline-block' }}></span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: cov.statusColor, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{cov.status}</span>
                    </div>
                  </div>
                  <h3 style={{ fontWeight: 300, color: cov.disputed || selectedCovenant === cov.id ? '#ffffff' : '#a3a3a3', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em', fontSize: '0.875rem' }}>{cov.title}</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: cov.disputed ? 'rgba(255,255,255,0.5)' : '#525252', marginTop: '0.75rem' }}>
                    <span>Agent: {cov.agent}</span>
                    <span>Stake: {cov.stake}</span>
                  </div>
                </div>
              ))}
              {!covenants.length ? (
                <div style={{ padding: '1rem', color: '#525252', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}>No covenants in this view.</div>
              ) : null}
            </div>
          </aside>

          {/* Main Content */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', minWidth: '500px', position: 'relative', zIndex: 0 }}>

            {/* Covenant Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: statusColor(selectedTask?.status), textTransform: 'uppercase', letterSpacing: '0.2em', border: `1px solid ${statusColor(selectedTask?.status)}`, padding: '0.125rem 0.5rem', backgroundColor: 'rgba(115,115,115,0.1)' }}>
                  {details?.disputeRecord ? 'Disputed' : details?.resolutionRecord ? 'Resolved' : selectedTask?.status === 'submitted' ? 'Awaiting Consensus' : selectedTask?.status === 'completed' ? 'Settled' : 'Executing'}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3' }}>{detailsLoading ? 'Loading selected covenant...' : selectedTask ? `Procurement reward: ${formatToken(selectedTask.reward)} USDC` : 'Awaiting covenant selection'}</span>
              </div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 300, color: '#ffffff', letterSpacing: '-0.025em', marginTop: '0.5rem', marginBottom: '1rem' }}>{selectedTask?.title ?? 'TrustCommit Console'}</h1>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>Commitment ID</span>
                  <span style={{ color: '#ffffff' }}>{selectedTask?.covenantId ? shortHash(selectedTask.covenantId, 6) : shortHash(selectedTask?.id, 6)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>Task Hash</span>
                  <span style={{ color: '#ffffff' }}>{shortHash(selectedTask?.taskHash, 6)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>Financial Stake</span>
                  <span style={{ color: '#ffffff' }}>{formatToken(selectedTask?.requiredStake)} USDC <span style={{ color: '#525252', fontSize: '0.65rem', marginLeft: '0.25rem' }}>(Escrowed)</span></span>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', backgroundColor: '#000000' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', fontSize: '0.875rem', flexShrink: 0 }}>E</div>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.125rem' }}>Executor Agent</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem', color: '#ffffff', marginBottom: '0.25rem' }}>{(manifest?.name ?? 'runtime').toUpperCase().replaceAll(' ', '_')}</div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3' }}>
                    <span>Provider: <span style={{ color: '#ffffff' }}>{latestRun?.provider ?? 'pending'}</span></span>
                    <span>Model: {latestRun?.model ?? 'waiting'}</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#737373', marginTop: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Covenant validator: {selectedLog?.verification?.profile ?? 'unassigned'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', paddingLeft: '2rem', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', fontSize: '0.875rem', flexShrink: 0 }}>C</div>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.125rem' }}>Creator Identity</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem', color: '#ffffff', marginBottom: '0.25rem' }}>{selectedTask?.createdBy?.toUpperCase() ?? 'UNASSIGNED'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '12rem' }} title={manifest?.operator?.address ?? ''}>
                    {manifest?.operator?.address ?? 'No operator wallet'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#737373', marginTop: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '12rem' }}>
                    Commitment profile: {selectedLog?.task?.commitmentProfile ?? 'unassigned'}
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal Log */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#000000', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Execution and Receipt Logging</span>
                <span className="blink" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>{detailsLoading ? 'Reading receipts' : 'Recording accountable execution'}</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', paddingTop: '3rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3', lineHeight: '1.6', position: 'relative' }}>
                {logEntries.map((entry, i) => (
                  <div key={i} className={`log-entry ${entry.type} mb-2`} style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#525252', marginRight: '0.75rem' }}>{entry.time}</span>
                    {entry.msg}
                  </div>
                ))}
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ffffff' }}>
                  <span style={{ color: '#737373' }}>SYS.EXEC &gt;</span>
                  <span className="blink" style={{ display: 'inline-block', width: '0.5rem', height: '1rem', backgroundColor: '#ffffff', verticalAlign: 'middle' }}></span>
                </div>
              </div>
            </div>

            {/* Artifacts */}
            <div style={{ height: '12rem', borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Execution Artifacts and Receipts ({artifactEntries.length})</span>
                <button
                  type="button"
                  onClick={() => handleTaskAction('export')}
                  onMouseEnter={() => setDownloadHover(true)}
                  onMouseLeave={() => setDownloadHover(false)}
                  disabled={!selectedTask || actionLoading === 'export'}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: !selectedTask ? '#525252' : '#ffffff', background: 'none', border: 'none', cursor: !selectedTask || actionLoading === 'export' ? 'not-allowed' : 'pointer', textDecoration: downloadHover ? 'underline' : 'none' }}
                >
                  {actionLoading === 'export' ? 'Exporting...' : 'Export Bundle'}
                </button>
              </div>
              <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1rem', height: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', overflowY: 'auto', alignContent: 'start' }}>
                  {artifactEntries.map((artifact) => (
                    <ArtifactCard
                      key={artifact.key}
                      artifact={artifact}
                      selected={selectedArtifactEntry?.key === artifact.key}
                      onSelect={() => setSelectedArtifactKey(artifact.key)}
                    />
                  ))}
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.75rem', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
                      Artifact Inspection
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#ffffff' }}>
                      {selectedArtifactEntry?.type ?? '—'}
                    </div>
                  </div>
                  {selectedArtifactEntry ? (
                    <>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: '#ffffff', marginBottom: '0.5rem' }}>
                        {selectedArtifactEntry.previewTitle}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#525252', marginBottom: '0.75rem' }}>
                        {selectedArtifactEntry.name} / {selectedArtifactEntry.hash}
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {selectedArtifactEntry.previewLines.slice(0, 6).map((line, index) => (
                          <div key={index} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.63rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.63rem', color: '#525252', lineHeight: '1.6' }}>
                      No artifact has been emitted for this covenant yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right Sidebar */}
          <aside style={{ width: '380px', backgroundColor: '#000000', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', zIndex: 10 }}>

            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#ffffff', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Agent Procurement Console</span>
            </div>

            {/* Cryptographic Evidence */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 300 }}>
                <span>Proof and Receipts</span>
                <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}>{selectedLog?.verification?.schemaSatisfied ? 'Secured' : 'Review'}</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.25rem' }}>
                    <span>Proof Type</span>
                    <span style={{ color: '#ffffff' }}>signed proof bundle</span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#a3a3a3', wordBreak: 'break-all', lineHeight: '1.6' }}>
                    {selectedTask?.proofHash ? shortHash(selectedTask.proofHash, 8) : '0x0000...'}<span style={{ color: '#ffffff' }}> {selectedLog?.verification?.schemaSatisfied ? 'VALID' : 'FLAGGED'}</span><br />
                    taskHash: {shortHash(selectedTask?.taskHash, 8)} / receiptHead: {shortHash(details?.receiptRecord?.headHash, 8)}
                  </div>
                </div>

                {actionMessage ? (
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.35rem' }}>
                      <span>Latest Action</span>
                      <span style={{ color: '#ffffff' }}>synced</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {actionMessage}
                    </div>
                  </div>
                ) : null}

                {actionError ? (
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.35rem' }}>
                      <span>Runtime Notice</span>
                      <span style={{ color: '#ffffff' }}>review</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {actionError}
                    </div>
                  </div>
                ) : null}

                {[ 
                  { label: 'Execution Wallet', value: details?.chainContext?.actors?.executionWallet ?? manifest?.operator?.address ?? 'pending' },
                  { label: 'Evidence Files', value: `${inspectedFiles.length} preserved` },
                  { label: 'Verifier', value: verificationLoading ? 'running...' : verification ? `${verification.status} (${verification.summary.passed}/${verification.summary.total})` : 'pending' },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.25rem' }}>
                      <span>{item.label}</span>
                      <span style={{ color: '#ffffff' }}>Inspect</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.08)', padding: '0.25rem 0.5rem' }}>
                      {item.value}
                    </div>
                  </div>
                ))}

              </div>
            </div>

            {/* Consensus State */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flex: 1 }}>
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1.5rem', fontWeight: 300 }}>Commitment Lifecycle</h3>

              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '7px', top: '0.5rem', bottom: '0.5rem', width: '2px', backgroundColor: 'rgba(255,255,255,0.08)' }}></div>
                <div style={{ position: 'absolute', left: '7px', top: '0.5rem', height: '78%', width: '2px', backgroundColor: '#737373' }}></div>

                {/* Step 1 */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', position: 'relative' }}>
                  <div style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: '2px solid #737373', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 10, marginTop: '0.125rem' }}>
                    <div style={{ width: '0.375rem', height: '0.375rem', backgroundColor: '#737373', borderRadius: '9999px' }}></div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', marginBottom: '0.25rem' }}>Covenant Accepted</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252' }}>{details?.receiptRecord?.receipts?.createTxHash ? `Confirmed ${shortHash(details.receiptRecord.receipts.createTxHash)}` : 'Awaiting create receipt'}</div>
                    {canRun ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'run'}
                        onClick={() => handleTaskAction('run')}
                        style={actionLinkStyle(actionLoading === 'run')}
                      >
                        {actionLoading === 'run' ? 'Executing...' : 'Execute Procurement Task'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Step 2 */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', position: 'relative' }}>
                  <div className="pulse-border" style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: '2px solid #737373', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 10, marginTop: '0.125rem' }}>
                    <div className="blink" style={{ width: '0.375rem', height: '0.375rem', backgroundColor: '#737373', borderRadius: '9999px' }}></div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#737373', marginBottom: '0.25rem' }}>{details?.disputeRecord ? 'Dispute Review' : 'Proof Verification'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {details?.disputeRecord ? details.disputeRecord.reason : details?.receiptRecord?.receipts?.submitTxHash ? `Submitted ${shortHash(details.receiptRecord.receipts.submitTxHash)}` : 'Awaiting proof submission'}<br />
                      Checks: <span style={{ color: '#ffffff' }}>{selectedLog?.verification?.validatorResults?.length ?? 0} validators</span>
                    </div>
                    {!details?.disputeRecord ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'verify'}
                        onClick={() => handleTaskAction('verify')}
                        style={actionLinkStyle(actionLoading === 'verify')}
                      >
                        {actionLoading === 'verify' ? 'Verifying...' : 'Verify Commitment'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Step 3 */}
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', opacity: 0.5 }}>
                  <div style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 10, marginTop: '0.125rem' }}></div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3', marginBottom: '0.25rem' }}>{details?.resolutionRecord ? 'Resolved' : 'Settlement and Consequence'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252' }}>{details?.resolutionRecord ? `${details.resolutionRecord.outcome} ${shortHash(details.resolutionRecord.txHash)}` : details?.receiptRecord?.receipts?.finalizeTxHash ? `Settled ${shortHash(details.receiptRecord.receipts.finalizeTxHash)}` : 'Awaiting settlement'}</div>
                    {canFinalize ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'finalize'}
                        onClick={() => handleTaskAction('finalize')}
                        style={actionLinkStyle(actionLoading === 'finalize')}
                      >
                        {actionLoading === 'finalize' ? 'Finalizing...' : 'Finalize Settlement'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Dispute */}
            <DisputePanel
              taskStatus={selectedTask?.status}
              disputeRecord={details?.disputeRecord}
              resolutionRecord={details?.resolutionRecord}
              disputeDraft={disputeDraft}
              setDisputeDraft={setDisputeDraft}
              disputeComposeOpen={disputeComposeOpen}
              setDisputeComposeOpen={setDisputeComposeOpen}
              busy={actionLoading === 'dispute' || actionLoading === 'arbiter'}
              onDispute={(reason) => handleTaskAction('dispute', { reason })}
              onArbiter={() => handleTaskAction('arbiter')}
              onRefresh={() => setRefreshNonce((value) => value + 1)}
            />
          </aside>
        </main>
      </div>
  );
};

const ArtifactCard = ({ artifact, selected, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: selected ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        backgroundColor: hovered ? '#ffffff' : selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '1.5rem', height: '1.5rem', border: `1px solid ${hovered ? '#000000' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', color: hovered ? '#000000' : '#a3a3a3' }}>{artifact.type}</div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: hovered ? '#000000' : '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{artifact.name}</span>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: hovered ? '#000000' : '#525252' }}>{artifact.size}</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: hovered ? '#000000' : '#525252', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.5rem' }}>Hash: {artifact.hash}</div>
    </div>
  );
};

const DisputePanel = ({
  taskStatus,
  disputeRecord,
  resolutionRecord,
  disputeDraft,
  setDisputeDraft,
  disputeComposeOpen,
  setDisputeComposeOpen,
  busy,
  onDispute,
  onArbiter,
  onRefresh
}) => {
  const [hovered, setHovered] = useState(false);
  const ctaLabel = resolutionRecord
    ? 'Refresh Covenant State'
    : disputeRecord
      ? 'Run AI Arbiter'
      : taskStatus === 'submitted'
        ? 'Open Dispute'
        : 'Refresh Covenant State';

  const handleClick = () => {
    if (resolutionRecord) {
      onRefresh();
      return;
    }
    if (disputeRecord) {
      onArbiter();
      return;
    }
    if (taskStatus === 'submitted') {
      setDisputeComposeOpen((value) => !value);
      return;
    }
    onRefresh();
  };

  return (
    <div style={{ padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ width: '1rem', height: '1rem', marginTop: '0.125rem', border: '1px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', color: '#ffffff', flexShrink: 0 }}>!</div>
        <div>
          <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.25rem', fontWeight: 300 }}>Dispute and Resolution</h3>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
            {resolutionRecord
              ? `Resolved ${resolutionRecord.outcome}. ${resolutionRecord.reason}`
              : disputeRecord
                ? `${disputeRecord.reason} (${shortHash(disputeRecord.txHash)})`
                : <>If the procurement decision violates the covenant boundary, the creator can challenge it with a reviewable receipt trail and onchain dispute flow.</>}
          </p>
        </div>
      </div>

      {taskStatus === 'submitted' && !disputeRecord && !resolutionRecord && disputeComposeOpen ? (
        <div style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
          <textarea
            value={disputeDraft}
            onChange={(event) => setDisputeDraft(event.target.value)}
            placeholder="State the procurement covenant violation or evidence mismatch."
            rows={4}
            style={{
              resize: 'vertical',
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#ffffff',
              padding: '0.75rem',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.65rem',
              lineHeight: '1.6'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setDisputeComposeOpen(false)}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid rgba(255,255,255,0.12)',
                backgroundColor: 'transparent',
                color: '#a3a3a3',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !disputeDraft.trim()}
              onClick={() => onDispute(disputeDraft.trim())}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid rgba(255,255,255,0.5)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                color: busy || !disputeDraft.trim() ? '#525252' : '#ffffff',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                cursor: busy || !disputeDraft.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {busy ? 'Submitting...' : 'Submit Dispute'}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        disabled={busy}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: `1px solid ${hovered ? '#ffffff' : 'rgba(255,255,255,0.5)'}`,
          color: hovered ? '#000000' : '#ffffff',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          backgroundColor: hovered ? '#ffffff' : 'rgba(255,255,255,0.05)',
          cursor: busy ? 'wait' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ position: 'relative', zIndex: 10 }}>
          {busy ? 'Processing...' : ctaLabel}
        </span>
      </button>
    </div>
  );
};
