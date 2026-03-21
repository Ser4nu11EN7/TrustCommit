# TrustCommit Demo Script

## 演示时长：3-5 分钟

## 核心叙事
**TrustCommit makes autonomous agents prove why their actions deserve to settle.**

---

## 场景设定（10 秒）

**文案**：
"Autonomous agents can act, but can you trust them with real commitments? TrustCommit turns agent actions into reviewable, disputable, and enforceable settlements."

**画面**：
- 展示 README 顶部一句话
- 快速滚动到 Architecture 部分

---

## Part 1: 控制台界面（30 秒）

**文案**：
"This is the TrustCommit console. It shows real tasks running on Base Sepolia testnet."

**操作**：
1. 打开浏览器访问 `http://localhost:5173/console`
2. 指向左侧任务列表：
   - "These are real covenant-backed tasks"
   - "Each task has a unique ID and onchain proof"
3. 点击一个已完成的任务
4. 指向右侧验证状态：
   - "77 out of 77 checks verified"
   - "Proof hash anchored onchain"

**关键画面**：
- 任务列表不是空的
- 验证器显示绿色通过状态
- 右侧显示签名钱包地址

---

## Part 2: 证明链完整性（60 秒）

**文案**：
"Every task produces a complete evidence chain: agent manifest, execution log, proof bundle, and receipt record."

**操作**：
1. 在控制台点击"导出记录"按钮
2. 打开文件管理器到 `.trustcommit/public-proof/task_fd3e380d-a74d-4f42-a69b-18059b169daf/`
3. 依次展示文件：
   - `agent.json` - "Agent identity and capabilities"
   - `agent_log.json` - "Execution plan, inspected files, verification results"
   - `proof_bundle.json` - "Signed proof with artifact hash, evidence root, and receipt head"
   - `receipt_record.json` - "Hash-chained receipt index"
   - `receipt_events/` - "Append-only signed events"

**关键画面**：
- 文件结构清晰
- 用文本编辑器快速打开 `proof_bundle.json` 显示签名

---

## Part 3: 链上验证（45 秒）

**文案**：
"All proofs are anchored onchain. Let's verify the submit transaction on Base Sepolia."

**操作**：
1. 回到控制台，复制 submit tx hash：
   - `0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e`
2. 打开 BaseScan：
   - `https://sepolia.basescan.org/tx/0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e`
3. 指向关键信息：
   - "Contract: Covenant"
   - "Function: submitCompletion"
   - "Status: Success"

**关键画面**：
- 浏览器显示真实的链上交易
- 交易状态为成功

---

## Part 4: 争议解决（45 秒）

**文案**：
"If a task is disputed, TrustCommit resolves it against the preserved evidence trail."

**操作**：
1. 在控制台切换到 dispute 任务：
   - `task_c3bbe5fd-27c4-4cec-8f17-db021d218e70`
2. 指向任务状态：
   - "Status: Slashed"
   - "95 out of 95 checks verified"
3. 展示完整流程：
   - "Create → Accept → Submit → Dispute → Resolve"
   - "All steps are onchain and verifiable"

**关键画面**：
- 任务显示"已惩罚"状态
- 右侧显示 dispute tx 和 resolve tx

---

## Part 5: Agent 参与证明（30 秒）

**文案**：
"This project was built through human-agent collaboration. The design process is fully documented."

**操作**：
1. 打开 `docs/CONVERSATION_LOG.md`
2. 滚动到关键部分：
   - "2026-03-17: Claude vs Codex adversarial brainstorm"
   - "Trust Oracle vs Agent Covenant debate"
   - "Architecture decisions shaped by agent proposals"

**关键画面**：
- 日志显示真实的对抗式讨论
- 时间戳证明持续迭代

---

## 结尾（20 秒）

**文案**：
"TrustCommit: covenant, proof, and dispute resolution for autonomous agents. Deployed on Base Sepolia. Open source. Ready for production."

**操作**：
- 回到 README
- 指向合约地址
- 指向 GitHub repo

**最后一句**：
"Not just agents that can act. Agents that can be held accountable."

---

## 技术准备清单

### 启动服务
```bash
# Terminal 1: 启动 runtime
cd C:/Users/SerEN/TrustCommit
npm run runtime -- server:start --port 3100

# Terminal 2: 启动前端
cd C:/Users/SerEN/TrustCommit/frontend
npm run dev
```

### 浏览器标签页准备
1. `http://localhost:5173/console` - 控制台
2. `https://sepolia.basescan.org/tx/0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e` - Submit TX
3. `https://sepolia.basescan.org/tx/0x590ff831de9ef02cb6af0d2cde52774c46280faf3ae0ada5ef733ff36113cfbb` - Resolve TX
4. 文件管理器打开 `.trustcommit/public-proof/task_fd3e380d-a74d-4f42-a69b-18059b169daf/`

### 录制设置
- 分辨率：1920x1080
- 帧率：30fps
- 录制工具：OBS / Loom / QuickTime
- 麦克风：清晰但不必完美
- 背景音乐：可选，保持低音量

---

## 备用演示路径（如果服务启动失败）

### 纯静态演示
1. 展示 README 架构图
2. 打开 `.trustcommit/public-proof/` 文件夹
3. 用文本编辑器展示关键 JSON 文件
4. 打开 BaseScan 验证链上交易
5. 展示 CONVERSATION_LOG.md

### 命令行演示
```bash
# 显示任务列表
npm run runtime -- task:list

# 显示任务详情
npm run runtime -- task:details --id task_fd3e380d-a74d-4f42-a69b-18059b169daf

# 验证任务
npm run runtime -- task:verify --id task_fd3e380d-a74d-4f42-a69b-18059b169daf

# 导出记录
npm run runtime -- task:export --id task_fd3e380d-a74d-4f42-a69b-18059b169daf
```

---

## 常见问题应对

**Q: 为什么不直接演示创建新任务？**
A: 公开测试网需要真实 RPC 和私钥，演示环境可能不稳定。展示已验证的历史记录更可靠。

**Q: 如果控制台加载失败？**
A: 切换到命令行演示 + 静态文件展示。

**Q: 如何证明这不是假数据？**
A: 所有交易都在 BaseScan 上可验证，合约地址公开，任何人都可以查询。

---

## 录制后检查清单

- [ ] 音频清晰
- [ ] 画面流畅无卡顿
- [ ] 关键文案都说到了
- [ ] 链上交易展示清楚
- [ ] 文件结构展示完整
- [ ] 总时长 3-5 分钟
- [ ] 开头和结尾有明确的 pitch
