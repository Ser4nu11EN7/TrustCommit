// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_RUNTIME_API_URL as string | undefined) ?? 'http://127.0.0.1:3100';

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`请求失败：${path}`);
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
    throw new Error(payload?.error ?? `请求失败：${path}`);
  }
  return payload;
}

function shortHash(value, size = 4) {
  if (!value) {
    return '待生成';
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
    return '等待中';
  }
  const labels = {
    draft: '草稿',
    created: '已创建',
    running: '执行中',
    submitted: '已提交',
    completed: '已完成',
    disputed: '争议中',
    slashed: '已惩罚',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
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
  const [activeNav, setActiveNav] = useState('契约');
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
          setError(loadError instanceof Error ? loadError.message : '加载运行态失败。');
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
          setError(loadError instanceof Error ? loadError.message : '加载任务详情失败。');
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
          setActionError(loadError instanceof Error ? loadError.message : '验证任务失败。');
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
    setActionMessage(null);
    setActionError(null);
  }, [selectedCovenant]);

  const navItems = ['契约', '注册表', '争议', '质押'];

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
    ...(latestRun ? [{ time: `[${clock.slice(0, 8)}]`, msg: `执行容器已启动，当前模型为 ${latestRun.model}。`, type: 'success' }] : []),
    ...(selectedLog ? [{ time: '[PLAN]', msg: selectedLog.plan.summary, type: 'success' }] : []),
    ...((selectedLog?.steps ?? []).slice(0, 6).map((step) => ({
      time: `[${step.type.toUpperCase()}]`,
      msg: step.summary,
      type: step.type === 'verify' && !selectedLog?.verification?.schemaSatisfied ? 'warn' : ''
    }))),
    ...((details?.chainActions ?? []).slice(-4).map((action) => ({
      time: `[${new Date(action.createdAt).toLocaleTimeString('en-US', { hour12: false })}]`,
      msg: `${action.action} 已上链提交（${shortHash(action.txHash)}）`,
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
          previewTitle: '签名证明包',
          previewLines: [
            `签名地址 ${shortHash(details.proofBundle.operatorAttestation?.signer, 6)}`,
            `执行轨迹 ${shortHash(details.proofBundle.executionTraceHash, 6)}`,
            `回执头 ${shortHash(details.proofBundle.receiptHead, 6)}`,
          ],
        }]
      : []),
    ...(details?.artifact
      ? [{
          key: 'artifact',
          type: 'ART',
          name: 'artifact.json',
          size: `${inspectedFiles.length} 引用`,
          hash: shortHash(details.task?.proofHash, 6),
          previewTitle: selectedArtifact?.taskTitle ?? selectedTask?.title ?? '交付产物',
          previewLines: [
            selectedArtifact?.summary ?? '当前没有结构化摘要记录。',
            ...(selectedArtifact?.notes ?? []).slice(0, 2),
            ...(selectedArtifact?.filesToModify ?? []).slice(0, 2).map((entry) => `文件 ${entry}`),
            ...(selectedArtifact?.acceptanceChecks ?? []).slice(0, 2).map((entry) => `检查 ${entry}`),
          ].filter(Boolean),
        }]
      : []),
    ...(details?.receiptRecord
      ? [{
          key: 'receipt_record',
          type: 'RCP',
          name: 'receipt_record.json',
          size: '追加式',
          hash: shortHash(details.receiptRecord.headHash, 6),
          previewTitle: '回执链',
          previewLines: [
            `事件数 ${details.receiptRecord.eventCount}`,
            `创建 ${shortHash(details.receiptRecord.receipts.createTxHash, 6)}`,
            `接受 ${shortHash(details.receiptRecord.receipts.acceptTxHash, 6)}`,
            details.receiptRecord.receipts.submitTxHash ? `提交 ${shortHash(details.receiptRecord.receipts.submitTxHash, 6)}` : '等待提交',
            details.receiptRecord.receipts.finalizeTxHash ? `结算 ${shortHash(details.receiptRecord.receipts.finalizeTxHash, 6)}` : '等待结算',
          ],
        }]
      : []),
    ...(details?.agentLog
      ? [{
          key: 'agent_log',
          type: 'LOG',
          name: 'agent_log.json',
          size: `${details.agentLog.steps.length} 步`,
          hash: shortHash(details.receiptRecord?.proofHash, 6),
          previewTitle: '执行日志',
          previewLines: [
            details.agentLog.plan.summary,
            `预算 ${details.agentLog.budget.attemptsUsed}/${details.agentLog.budget.attemptsAllowed} 次尝试`,
            `模型调用 ${details.agentLog.budget.modelCalls}`,
            `护栏 ${details.agentLog.guardrails.preExecution.length + details.agentLog.guardrails.duringExecution.length + details.agentLog.guardrails.preCommit.length}`,
          ].filter(Boolean),
        }]
      : []),
    ...(details?.disputeRecord
      ? [{
          key: 'dispute',
          type: 'DSP',
          name: 'dispute.json',
          size: '质疑',
          hash: shortHash(details.disputeRecord.evidenceHash, 6),
          previewTitle: '争议记录',
          previewLines: [
            details.disputeRecord.reason,
            `交易 ${shortHash(details.disputeRecord.txHash, 6)}`,
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
          previewTitle: '裁决记录',
          previewLines: [
            `胜方 ${details.resolutionRecord.winner}`,
            details.resolutionRecord.reason,
            `交易 ${shortHash(details.resolutionRecord.txHash, 6)}`,
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
        title: '审查一项受契约约束的智能体承诺',
        instructions: '检查现有证据，给出边界明确的结果，并且只有在可追责证据链内部一致时才允许提交。当前默认示例仍然是采购类任务。',
        reward: 10000000,
        requiredStake: 500000000,
        deadlineHours: 24,
      });
      setActionMessage(`已创建契约 ${shortHash(response.task.id, 6)}`);
      await reloadConsole(response.task.id);
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : '创建契约失败。');
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
        setActionMessage(`验证器返回结果：${response.report.status}`);
      } else if (action === 'export') {
        const response = await postJson(`/tasks/${selectedTask.id}/export`, {});
        setActionMessage(`证明包已导出到 ${response.result.outputDir}`);
      } else if (action === 'arbiter') {
        await postJson(`/tasks/${selectedTask.id}/arbiter`, { mode: 'auto' });
        setActionMessage('仲裁审查已记录');
        await reloadConsole(selectedTask.id);
        setRefreshNonce((value) => value + 1);
      } else {
        await postJson(`/tasks/${selectedTask.id}/${action}`, body);
        const successMessages = {
          run: '执行结果已记录',
          finalize: '结算已完成',
          dispute: '已发起争议',
        };
        setActionMessage(successMessages[action] ?? `${action} committed`);
        if (action === 'dispute') {
          setDisputeDraft('');
          setDisputeComposeOpen(false);
        }
        await reloadConsole(selectedTask.id);
        setRefreshNonce((value) => value + 1);
      }
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : `执行 ${action} 失败。`);
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
                // 控制台
              </span>
            </div>
            <div style={{ height: '1rem', width: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }}></div>
            <nav style={{ display: 'flex', gap: '1rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
              {navItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActiveNav(item)}
                  aria-pressed={activeNav === item}
                  style={{ color: activeNav === item ? '#ffffff' : '#a3a3a3', textDecoration: 'none', transition: 'color 0.15s', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em' }}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '0.375rem', height: '0.375rem', backgroundColor: health && Object.values(health.providers).some((provider) => provider.healthy) ? '#ffffff' : '#525252', borderRadius: '9999px', display: 'inline-block' }}></span>
              <span style={{ color: '#ffffff' }}>{health?.chainId ? `链 ${health.chainId}` : '离线'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>验证器：</span>
              <span style={{ color: '#ffffff' }}>{verification?.summary?.total ?? selectedLog?.verification?.validatorResults?.length ?? 0}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>系统 ID：</span>
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
                disabled={actionLoading === 'create'}
                aria-busy={actionLoading === 'create'}
                className="dither-hover"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: actionLoading === 'create' ? '#525252' : '#ffffff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  backgroundColor: 'transparent',
                  cursor: actionLoading === 'create' ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <span>+</span> {actionLoading === 'create' ? '正在创建契约...' : '新建契约'}
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a3a3a3' }}>
              {[{ key: 'active', label: `进行中 (${tasks.filter((task) => !['completed', 'slashed'].includes(task.status)).length})` }, { key: 'pending', label: `待处理 (${tasks.filter((task) => ['draft', 'created', 'running'].includes(task.status)).length})` }, { key: 'settled', label: `已结算 (${tasks.filter((task) => ['completed', 'slashed'].includes(task.status)).length})` }].map((tab) => (
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
                      <span className={cov.status === '执行中' ? 'blink' : ''} style={{ width: '0.375rem', height: '0.375rem', backgroundColor: cov.statusColor, borderRadius: '9999px', display: 'inline-block' }}></span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: cov.statusColor, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{cov.status}</span>
                    </div>
                  </div>
                  <h3 style={{ fontWeight: 300, color: cov.disputed || selectedCovenant === cov.id ? '#ffffff' : '#a3a3a3', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em', fontSize: '0.875rem' }}>{cov.title}</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: cov.disputed ? 'rgba(255,255,255,0.5)' : '#525252', marginTop: '0.75rem' }}>
                    <span>智能体：{cov.agent}</span>
                    <span>质押：{cov.stake}</span>
                  </div>
                </div>
              ))}
              {!covenants.length ? (
                <div style={{ padding: '1rem', color: '#525252', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', lineHeight: '1.6' }}>当前没有匹配这个筛选条件的契约。你可以新建契约，或切换到其他视图。</div>
              ) : null}
            </div>
          </aside>

          {/* Main Content */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', minWidth: '500px', position: 'relative', zIndex: 0 }}>

            {/* Covenant Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: statusColor(selectedTask?.status), textTransform: 'uppercase', letterSpacing: '0.2em', border: `1px solid ${statusColor(selectedTask?.status)}`, padding: '0.125rem 0.5rem', backgroundColor: 'rgba(115,115,115,0.1)' }}>
                  {details?.disputeRecord ? '争议中' : details?.resolutionRecord ? '已裁决' : selectedTask?.status === 'submitted' ? '等待共识' : selectedTask?.status === 'completed' ? '已结算' : '执行中'}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3' }}>{detailsLoading ? '正在加载选中的契约...' : selectedTask ? `契约奖励：${formatToken(selectedTask.reward)} USDC` : '请选择一个契约查看它的生命周期。'}</span>
              </div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 300, color: '#ffffff', letterSpacing: '-0.025em', marginTop: '0.5rem', marginBottom: '1rem' }}>{selectedTask?.title ?? 'TrustCommit 控制台'}</h1>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>承诺 ID</span>
                  <span style={{ color: '#ffffff' }}>{selectedTask?.covenantId ? shortHash(selectedTask.covenantId, 6) : shortHash(selectedTask?.id, 6)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>任务哈希</span>
                  <span style={{ color: '#ffffff' }}>{shortHash(selectedTask?.taskHash, 6)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>资金质押</span>
                  <span style={{ color: '#ffffff' }}>{formatToken(selectedTask?.requiredStake)} USDC <span style={{ color: '#525252', fontSize: '0.65rem', marginLeft: '0.25rem' }}>(已托管)</span></span>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', backgroundColor: '#000000' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', fontSize: '0.875rem', flexShrink: 0 }}>E</div>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.125rem' }}>执行智能体</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem', color: '#ffffff', marginBottom: '0.25rem' }}>{(manifest?.name ?? 'runtime').toUpperCase().replaceAll(' ', '_')}</div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3' }}>
                    <span>提供方：<span style={{ color: '#ffffff' }}>{latestRun?.provider ?? '待定'}</span></span>
                    <span>模型：{latestRun?.model ?? '等待中'}</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#737373', marginTop: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    契约验证器：{selectedLog?.verification?.profile ?? '未分配'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', paddingLeft: '2rem', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', fontSize: '0.875rem', flexShrink: 0 }}>C</div>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.125rem' }}>创建者身份</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem', color: '#ffffff', marginBottom: '0.25rem' }}>{selectedTask?.createdBy?.toUpperCase() ?? '未分配'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '12rem' }} title={manifest?.operator?.address ?? ''}>
                    {manifest?.operator?.address ?? '暂无操作钱包'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#737373', marginTop: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '12rem' }}>
                    承诺画像：{selectedLog?.task?.commitmentProfile ?? '未分配'}
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal Log */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#000000', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em' }}>执行与回执日志</span>
                <span className="blink" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>{detailsLoading ? '读取回执中' : '记录可追责执行'}</span>
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
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em' }}>执行产物与回执（{artifactEntries.length}）</span>
                <button
                  type="button"
                  onClick={() => handleTaskAction('export')}
                  onMouseEnter={() => setDownloadHover(true)}
                  onMouseLeave={() => setDownloadHover(false)}
                  disabled={!selectedTask || actionLoading === 'export'}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: !selectedTask ? '#525252' : '#ffffff', background: 'none', border: 'none', cursor: !selectedTask || actionLoading === 'export' ? 'not-allowed' : 'pointer', textDecoration: downloadHover ? 'underline' : 'none' }}
                >
                  {actionLoading === 'export' ? '导出中...' : '导出证明包'}
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
                      产物检查
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
                        这个契约还没有生成证明。请先运行任务，生成结果、证据包和回执链。
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
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#ffffff', letterSpacing: '0.2em', textTransform: 'uppercase' }}>智能体回执控制台</span>
            </div>

            {/* Cryptographic Evidence */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 300 }}>
                <span>追责快照</span>
                <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}>{selectedLog?.verification?.schemaSatisfied ? '已验证' : '待复核'}</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.25rem' }}>
                    <span>结算绑定</span>
                    <span style={{ color: '#ffffff' }}>证明包 + 回执头</span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#a3a3a3', wordBreak: 'break-all', lineHeight: '1.6' }}>
                    {selectedTask?.proofHash ? shortHash(selectedTask.proofHash, 8) : '0x0000...'}<span style={{ color: '#ffffff' }}> {selectedLog?.verification?.schemaSatisfied ? '已通过' : '已标记'}</span><br />
                    taskHash：{shortHash(selectedTask?.taskHash, 8)} / receiptHead：{shortHash(details?.receiptRecord?.headHash, 8)}
                  </div>
                </div>

                {actionMessage ? (
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.35rem' }}>
                      <span>最近动作</span>
                      <span style={{ color: '#ffffff' }}>已同步</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {actionMessage}
                    </div>
                  </div>
                ) : null}

                {actionError ? (
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.35rem' }}>
                      <span>运行时提示</span>
                      <span style={{ color: '#ffffff' }}>请检查</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {actionError}
                    </div>
                  </div>
                ) : null}

                {[ 
                  { label: '签名钱包', value: details?.chainContext?.actors?.executionWallet ?? manifest?.operator?.address ?? '待定' },
                  { label: '保留证据', value: `${inspectedFiles.length} 个文件` },
                  { label: '验证器', value: verificationLoading ? '运行中...' : verification ? `${verification.status} (${verification.summary.passed}/${verification.summary.total})` : '待定' },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.25rem' }}>
                      <span>{item.label}</span>
                      <span style={{ color: '#ffffff' }}>查看</span>
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
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1.5rem', fontWeight: 300 }}>这次决策如何变成可执行结果</h3>

              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '7px', top: '0.5rem', bottom: '0.5rem', width: '2px', backgroundColor: 'rgba(255,255,255,0.08)' }}></div>
                <div style={{ position: 'absolute', left: '7px', top: '0.5rem', height: '78%', width: '2px', backgroundColor: '#737373' }}></div>

                {/* Step 1 */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', position: 'relative' }}>
                  <div style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: '2px solid #737373', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 10, marginTop: '0.125rem' }}>
                    <div style={{ width: '0.375rem', height: '0.375rem', backgroundColor: '#737373', borderRadius: '9999px' }}></div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', marginBottom: '0.25rem' }}>契约已创建并被接受</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252' }}>{details?.receiptRecord?.receipts?.createTxHash ? `承诺已记录 ${shortHash(details.receiptRecord.receipts.createTxHash)}` : '等待契约上链记录'}</div>
                    {canRun ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'run'}
                        onClick={() => handleTaskAction('run')}
                        style={actionLinkStyle(actionLoading === 'run')}
                      >
                        {actionLoading === 'run' ? '执行中...' : '运行契约任务'}
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
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#737373', marginBottom: '0.25rem' }}>{details?.disputeRecord ? '争议审查中' : '决策已连同证明提交'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                      {details?.disputeRecord ? details.disputeRecord.reason : details?.receiptRecord?.receipts?.submitTxHash ? `证明已提交 ${shortHash(details.receiptRecord.receipts.submitTxHash)}` : '等待签名证明'}<br />
                      检查项：<span style={{ color: '#ffffff' }}>{selectedLog?.verification?.validatorResults?.length ?? 0} 个验证器</span>
                    </div>
                    {!details?.disputeRecord ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'verify'}
                        onClick={() => handleTaskAction('verify')}
                        style={actionLinkStyle(actionLoading === 'verify')}
                      >
                        {actionLoading === 'verify' ? '验证中...' : '验证证明'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Step 3 */}
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', opacity: 0.5 }}>
                  <div style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 10, marginTop: '0.125rem' }}></div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3', marginBottom: '0.25rem' }}>{details?.resolutionRecord ? '裁决结果' : '等待结算或争议'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252' }}>{details?.resolutionRecord ? `${details.resolutionRecord.outcome} ${shortHash(details.resolutionRecord.txHash)}` : details?.receiptRecord?.receipts?.finalizeTxHash ? `已结算 ${shortHash(details.receiptRecord.receipts.finalizeTxHash)}` : '等待结算或发起争议'}</div>
                    {canFinalize ? (
                      <button
                        type="button"
                        disabled={actionLoading === 'finalize'}
                        onClick={() => handleTaskAction('finalize')}
                        style={actionLinkStyle(actionLoading === 'finalize')}
                      >
                        {actionLoading === 'finalize' ? '结算中...' : '完成契约结算'}
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
    ? '刷新契约状态'
    : disputeRecord
      ? '运行 AI 仲裁'
      : taskStatus === 'submitted'
        ? '发起质疑'
        : '刷新契约状态';

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
          <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.25rem', fontWeight: 300 }}>质疑这次决策</h3>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
            {resolutionRecord
              ? `已裁决：${resolutionRecord.outcome}。${resolutionRecord.reason}`
              : disputeRecord
                ? `${disputeRecord.reason} (${shortHash(disputeRecord.txHash)})`
                : <>如果这次行动违反了既定契约，你可以在这里发起质疑，并留下可复核的回执链和链上结果。当前默认示例是采购决策。</>}
          </p>
        </div>
      </div>

      {taskStatus === 'submitted' && !disputeRecord && !resolutionRecord && disputeComposeOpen ? (
        <div style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
          <textarea
            value={disputeDraft}
            onChange={(event) => setDisputeDraft(event.target.value)}
            aria-label="争议理由"
            placeholder="写明预算、政策或证据方面的违约点，说明为什么这次决策可以被质疑。"
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
              关闭
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
              {busy ? '提交中...' : '提交质疑'}
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
          {busy ? '处理中...' : ctaLabel}
        </span>
      </button>
    </div>
  );
};
