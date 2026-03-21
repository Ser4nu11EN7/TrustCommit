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

function taskBucket(status) {
  if (status === 'disputed' || status === 'slashed') {
    return 'disputed';
  }
  if (status === 'completed') {
    return 'closed';
  }
  if (status === 'submitted') {
    return 'review';
  }
  return 'active';
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
  const [selectedCovenant, setSelectedCovenant] = useState(null);
  const [downloadHover, setDownloadHover] = useState(false);
  const [mainView, setMainView] = useState('summary');
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
  const [taskFilter, setTaskFilter] = useState('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('新的智能体契约任务');
  const [draftInstructions, setDraftInstructions] = useState('限定智能体在既定承诺边界内执行，并要求产出可验证的证据与可结算回执。');
  const [draftReward, setDraftReward] = useState('10');
  const [draftStake, setDraftStake] = useState('500');
  const [draftDeadlineHours, setDraftDeadlineHours] = useState('24');
  const [draftProfile, setDraftProfile] = useState('structured_commitment');

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

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') {
      return tasks;
    }
    return tasks.filter((task) => taskBucket(task.status) === taskFilter);
  }, [taskFilter, tasks]);

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
  const canDispute = selectedTask?.status === 'submitted' && !details?.disputeRecord && !details?.resolutionRecord;
  const taskFilters = [
    { key: 'all', label: '全部', count: tasks.length },
    { key: 'active', label: '活动', count: tasks.filter((task) => taskBucket(task.status) === 'active').length },
    { key: 'review', label: '复核', count: tasks.filter((task) => taskBucket(task.status) === 'review').length },
    { key: 'disputed', label: '争议', count: tasks.filter((task) => taskBucket(task.status) === 'disputed').length },
  ];
  const nextOperation = (() => {
    if (!selectedTask) {
      return null;
    }
    if (details?.resolutionRecord) {
      return { key: 'export', label: '导出记录', note: '裁决已落定' };
    }
    if (details?.disputeRecord) {
      return { key: 'arbiter', label: '运行仲裁', note: '争议已开启' };
    }
    if (canRun) {
      return { key: 'run', label: '开始运行', note: '准备提交交付与证明' };
    }
    if (selectedTask?.status === 'submitted' && verification?.status === 'verified' && !details?.disputeRecord) {
      return { key: 'finalize', label: '完成结算', note: '验证已通过' };
    }
    if (selectedTask?.status === 'submitted') {
      return { key: 'verify', label: '检查证明', note: '提交已落链' };
    }
    if (canFinalize) {
      return { key: 'finalize', label: '完成结算', note: '可进入结算窗口' };
    }
    if (selectedTask?.status === 'completed' || selectedTask?.status === 'slashed') {
      return { key: 'export', label: '导出记录', note: '回执链已闭合' };
    }
    return { key: 'refresh', label: '刷新状态', note: '同步最新链上状态' };
  })();
  const sequenceSteps = [
    {
      key: 'ready',
      label: '契约就绪',
      detail: details?.receiptRecord?.receipts?.createTxHash ? shortHash(details.receiptRecord.receipts.createTxHash) : '等待记录',
      active: selectedTask?.status === 'created' || selectedTask?.status === 'running',
      complete: Boolean(details?.receiptRecord?.receipts?.createTxHash),
    },
    {
      key: 'submitted',
      label: details?.disputeRecord ? '争议审查中' : '证明已提交',
      detail: details?.receiptRecord?.receipts?.submitTxHash
        ? shortHash(details.receiptRecord.receipts.submitTxHash)
        : details?.disputeRecord
          ? '争议已开启'
          : '等待提交',
      active: selectedTask?.status === 'submitted' || Boolean(details?.disputeRecord),
      complete: Boolean(details?.receiptRecord?.receipts?.submitTxHash),
    },
    {
      key: 'settlement',
      label: details?.resolutionRecord ? '裁决结果' : '结算窗口',
      detail: details?.resolutionRecord
        ? shortHash(details.resolutionRecord.txHash)
        : details?.receiptRecord?.receipts?.finalizeTxHash
          ? shortHash(details.receiptRecord.receipts.finalizeTxHash)
          : '等待结算',
      active: Boolean(details?.resolutionRecord) || selectedTask?.status === 'completed' || selectedTask?.status === 'slashed',
      complete: Boolean(details?.resolutionRecord || details?.receiptRecord?.receipts?.finalizeTxHash),
    },
  ];

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

  const coreArtifactEntries = artifactEntries.filter((entry) =>
    ['proof_bundle', 'artifact', 'receipt_record'].includes(entry.key)
  );

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
        title: draftTitle.trim() || '新的智能体契约任务',
        instructions: draftInstructions.trim() || '限定智能体在既定承诺边界内执行，并要求产出可验证的证据与可结算回执。',
        reward: Math.max(1, Number(draftReward || '10')) * 1_000_000,
        requiredStake: Math.max(1, Number(draftStake || '500')) * 1_000_000,
        deadlineHours: Math.max(1, Number(draftDeadlineHours || '24')),
        commitmentProfile: draftProfile,
      });
      setActionMessage(`已创建契约 ${shortHash(response.task.id, 6)}`);
      setComposeOpen(false);
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

  function handlePrimaryOperation() {
    if (!nextOperation) {
      return;
    }
    if (nextOperation.key === 'refresh') {
      setRefreshNonce((value) => value + 1);
      return;
    }
    handleTaskAction(nextOperation.key);
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
            <a
              href="/"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: '#666666',
                textDecoration: 'none',
              }}
            >
              返回首页
            </a>
            <div style={{ fontWeight: 200, fontSize: '1.125rem', letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#ffffff', borderRadius: '9999px', display: 'inline-block' }}></span>
              TrustCommit{' '}
              <span style={{ color: '#a3a3a3', fontSize: '0.875rem', marginLeft: '0.25rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', fontWeight: 400 }}>
                // 控制台
              </span>
            </div>
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
          <aside style={{ width: '280px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: '#000000', flexShrink: 0, zIndex: 10 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '0.75rem', minHeight: '1.25rem' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#888888' }}>
                  任务池 <span style={{ color: '#ffffff' }}>{filteredTasks.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setComposeOpen((value) => !value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: composeOpen ? '#ffffff' : '#a3a3a3',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.66rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    cursor: 'pointer',
                    width: '3.9rem',
                    lineHeight: 1,
                    textAlign: 'right',
                  }}
                >
                  {composeOpen ? '收起' : '新建'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: '0.4rem', minHeight: '4.9rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.4rem' }}>
                  {taskFilters.slice(0, 1).map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setTaskFilter(filter.key)}
                      style={{
                        backgroundColor: taskFilter === filter.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: taskFilter === filter.key ? '#ffffff' : '#666666',
                        padding: '0.46rem 0.45rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.14em',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {filter.label} {filter.count}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem' }}>
                  {taskFilters.slice(1).map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setTaskFilter(filter.key)}
                    style={{
                      backgroundColor: taskFilter === filter.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: taskFilter === filter.key ? '#ffffff' : '#666666',
                      padding: '0.46rem 0.2rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.62rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {filter.label} {filter.count}
                  </button>
                  ))}
                </div>
              </div>

            </div>

              {composeOpen ? (
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(6,6,6,0.98)', padding: '0.75rem', display: 'grid', gap: '0.6rem', position: 'relative', zIndex: 2 }}>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#666666' }}>标题</span>
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        padding: '0.55rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.62rem',
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#666666' }}>承诺轮廓</span>
                    <select
                      value={draftProfile}
                      onChange={(event) => setDraftProfile(event.target.value)}
                      style={{
                        backgroundColor: '#000000',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        padding: '0.55rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.62rem',
                      }}
                    >
                      <option value="structured_commitment">structured_commitment</option>
                      <option value="selection_commitment">selection_commitment</option>
                      <option value="budget_commitment">budget_commitment</option>
                      <option value="policy_commitment">policy_commitment</option>
                      <option value="remediation_commitment">remediation_commitment</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#666666' }}>任务条款</span>
                    <textarea
                      rows={4}
                      value={draftInstructions}
                      onChange={(event) => setDraftInstructions(event.target.value)}
                      style={{
                        resize: 'vertical',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        padding: '0.55rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.62rem',
                        lineHeight: '1.6',
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {[
                      { label: '奖励', value: draftReward, setter: setDraftReward },
                      { label: '质押', value: draftStake, setter: setDraftStake },
                      { label: '时限', value: draftDeadlineHours, setter: setDraftDeadlineHours },
                    ].map((field) => (
                      <div key={field.label} style={{ display: 'grid', gap: '0.35rem' }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#666666' }}>{field.label}</span>
                        <input
                          value={field.value}
                          onChange={(event) => field.setter(event.target.value)}
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: '#ffffff',
                            padding: '0.5rem',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.62rem',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCreateTask()}
                    disabled={actionLoading === 'create'}
                    style={{
                      marginTop: '0.2rem',
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: actionLoading === 'create' ? '#666666' : '#ffffff',
                      padding: '0.7rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.62rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                      cursor: actionLoading === 'create' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading === 'create' ? '创建中...' : '提交新任务'}
                  </button>
                </div>
              ) : null}

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: cov.disputed ? 'rgba(255,255,255,0.5)' : '#525252', marginTop: '0.65rem' }}>
                    <span>{cov.agent}</span>
                    <span>{cov.stake}</span>
                  </div>
                </div>
              ))}
              {!covenants.length ? (
                <div style={{ padding: '1rem', color: '#525252', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', lineHeight: '1.6' }}>当前筛选下没有任务。</div>
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
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a3a3a3' }}>
                  {detailsLoading ? '正在同步状态...' : selectedTask ? `RWD ${formatToken(selectedTask.reward)} USDC` : 'NO ACTIVE SELECTION'}
                </span>
              </div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 300, color: '#ffffff', letterSpacing: '-0.025em', marginTop: '0.5rem', marginBottom: '1rem' }}>{selectedTask?.title ?? 'TrustCommit 控制台'}</h1>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.65rem' }}>下一步</span>
                  <span style={{ color: '#ffffff' }}>{nextOperation?.label ?? '待定'}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: '1rem' }}>
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', alignItems: 'start' }}>
                <div style={{ position: 'absolute', left: '16.666%', right: '16.666%', top: '0.52rem', height: '2px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
                <div style={{ position: 'absolute', left: '16.666%', right: '50%', top: '0.52rem', height: '2px', backgroundColor: sequenceSteps[0]?.complete ? '#737373' : 'transparent' }} />
                <div style={{ position: 'absolute', left: '50%', right: '16.666%', top: '0.52rem', height: '2px', backgroundColor: sequenceSteps[1]?.complete ? '#737373' : 'transparent' }} />
                {sequenceSteps.map((step) => (
                  <div key={step.key} style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.55rem' }}>
                      <div style={{ width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#000000', border: `2px solid ${step.active || step.complete ? '#737373' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(step.active || step.complete) ? (
                          <div className={step.active && !step.complete ? 'blink' : ''} style={{ width: '0.375rem', height: '0.375rem', backgroundColor: step.complete ? '#ffffff' : '#737373', borderRadius: '9999px' }} />
                        ) : null}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: step.active ? '#ffffff' : '#a3a3a3', letterSpacing: '0.02em' }}>
                        {step.label}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: step.active ? '#a3a3a3' : '#525252', lineHeight: '1.6', paddingLeft: '1.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {step.detail}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={handlePrimaryOperation}
                  disabled={actionLoading === nextOperation?.key || !nextOperation}
                  style={{
                    flex: 1,
                    padding: '0.9rem 1rem',
                    border: '1px solid rgba(255,255,255,0.24)',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: actionLoading === nextOperation?.key || !nextOperation ? '#666666' : '#ffffff',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    cursor: actionLoading === nextOperation?.key || !nextOperation ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <span>{actionLoading === nextOperation?.key ? '处理中...' : nextOperation?.label ?? '等待选择'}</span>
                    <span style={{ color: '#a3a3a3', fontSize: '0.58rem' }}>{nextOperation?.note ?? 'NO OP'}</span>
                  </div>
                </button>

                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.9rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                  <button type="button" onClick={() => handleTaskAction('export')} disabled={!selectedTask || actionLoading === 'export'} style={actionLinkStyle(!selectedTask || actionLoading === 'export')}>导出</button>
                  <button type="button" onClick={() => setRefreshNonce((value) => value + 1)} style={actionLinkStyle(false)}>刷新</button>
                  {canDispute ? (
                    <button type="button" onClick={() => setDisputeComposeOpen((value) => !value)} style={actionLinkStyle(false)}>争议</button>
                  ) : null}
                </div>
              </div>

              {canDispute && disputeComposeOpen ? (
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.85rem', display: 'grid', gap: '0.6rem' }}>
                  <textarea
                    value={disputeDraft}
                    onChange={(event) => setDisputeDraft(event.target.value)}
                    aria-label="争议理由"
                    placeholder="写明争议理由与对应违约点。"
                    rows={4}
                    style={{
                      resize: 'vertical',
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#ffffff',
                      padding: '0.75rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.65rem',
                      lineHeight: '1.6'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" onClick={() => setDisputeComposeOpen(false)} style={actionLinkStyle(false)}>取消</button>
                    <button
                      type="button"
                      disabled={actionLoading === 'dispute' || !disputeDraft.trim()}
                      onClick={() => handleTaskAction('dispute', { reason: disputeDraft.trim() })}
                      style={actionLinkStyle(actionLoading === 'dispute' || !disputeDraft.trim())}
                    >
                      {actionLoading === 'dispute' ? '提交中...' : '提交争议'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Artifacts */}
            <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#000000', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.2em' }}>交付记录</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
                    {[
                      { key: 'summary', label: '摘要' },
                      { key: 'trace', label: '执行记录' }
                    ].map((view) => (
                      <button
                        key={view.key}
                        type="button"
                        onClick={() => setMainView(view.key)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: mainView === view.key ? '#ffffff' : '#666666',
                          cursor: 'pointer',
                          textDecoration: mainView === view.key ? 'underline' : 'none',
                          textUnderlineOffset: '0.18rem',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '0.62rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.18em',
                        }}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
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
              </div>
              <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: '1rem', height: '100%', overflow: 'hidden' }}>
                {mainView === 'summary' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', overflowY: 'auto', alignContent: 'start' }}>
                    {coreArtifactEntries.map((artifact) => (
                      <ArtifactCard
                        key={artifact.key}
                        artifact={artifact}
                        selected={selectedArtifactEntry?.key === artifact.key}
                        onSelect={() => setSelectedArtifactKey(artifact.key)}
                      />
                    ))}
                    {artifactEntries.length > coreArtifactEntries.length ? (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#666666', lineHeight: '1.6', paddingTop: '0.25rem' }}>
                        其余争议与裁决记录保留在右侧链路。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.75rem', overflowY: 'auto' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.85rem' }}>
                      执行轨迹
                    </div>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {logEntries.length ? logEntries.map((entry, i) => (
                        <div key={i} className={`log-entry ${entry.type}`} style={{ marginBottom: '0.1rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.63rem', color: '#a3a3a3', lineHeight: '1.6' }}>
                          <span style={{ color: '#525252', marginRight: '0.65rem' }}>{entry.time}</span>
                          {entry.msg}
                        </div>
                      )) : (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.63rem', color: '#525252', lineHeight: '1.6' }}>
                          尚无执行轨迹。
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.75rem', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
                        当前视图
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
                        尚无交付记录。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right Sidebar */}
          <aside style={{ width: '340px', backgroundColor: '#000000', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', zIndex: 10 }}>

            {/* Cryptographic Evidence */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 300 }}>
                <span>验证与绑定</span>
                <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}>{selectedLog?.verification?.schemaSatisfied ? '已验证' : '待复核'}</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#525252', marginBottom: '0.25rem' }}>
                      <span>验证状态</span>
                      <span style={{ color: '#ffffff' }}>{verificationLoading ? 'SYNC' : verification?.status?.toUpperCase() ?? 'PENDING'}</span>
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
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6', wordBreak: 'break-all' }}>
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
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6', wordBreak: 'break-word' }}>
                      {actionError}
                    </div>
                  </div>
                ) : null}

                {[ 
                  { label: '签名钱包', value: details?.chainContext?.actors?.executionWallet ?? manifest?.operator?.address ?? '待定' },
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
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '1rem', fontWeight: 300 }}>链上状态</h3>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {[
                  { label: 'CREATE', value: details?.receiptRecord?.receipts?.createTxHash ? shortHash(details.receiptRecord.receipts.createTxHash) : 'pending' },
                  { label: 'SUBMIT', value: details?.receiptRecord?.receipts?.submitTxHash ? shortHash(details.receiptRecord.receipts.submitTxHash) : 'pending' },
                  { label: 'FINAL', value: details?.resolutionRecord ? shortHash(details.resolutionRecord.txHash) : details?.receiptRecord?.receipts?.finalizeTxHash ? shortHash(details.receiptRecord.receipts.finalizeTxHash) : 'pending' },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'grid', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#666666', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                      <span>{row.label}</span>
                      <span style={{ color: '#ffffff' }}>{row.value}</span>
                    </div>
                    <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Dispute */}
            <DisputePanel
              taskStatus={selectedTask?.status}
              disputeRecord={details?.disputeRecord}
              resolutionRecord={details?.resolutionRecord}
              busy={actionLoading === 'dispute' || actionLoading === 'arbiter'}
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
  busy,
  onArbiter,
  onRefresh
}) => {
  const [hovered, setHovered] = useState(false);
  const ctaLabel = resolutionRecord
    ? '刷新契约状态'
    : disputeRecord
      ? '运行 AI 仲裁'
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
    onRefresh();
  };

  return (
    <div style={{ padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ width: '1rem', height: '1rem', marginTop: '0.125rem', border: '1px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', color: '#ffffff', flexShrink: 0 }}>!</div>
        <div>
          <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.25rem', fontWeight: 300 }}>争议通道</h3>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#a3a3a3', lineHeight: '1.6' }}>
            {resolutionRecord
              ? `已裁决：${resolutionRecord.outcome}。${resolutionRecord.reason}`
              : disputeRecord
                ? `${disputeRecord.reason} (${shortHash(disputeRecord.txHash)})`
                : <>对当前提交发起争议，并写入独立的证据与裁决链。</>}
          </p>
        </div>
      </div>

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
