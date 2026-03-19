# Covenant Contract 设计决策

**日期**: 2026-03-18
**参与者**: Claude, 用户

## 问题 1: 完成确认机制

### C→B 升级路径分析

**选项 C (MVP)**:
```solidity
function completeCovenant(bytes32 covenantId) external {
    require(msg.sender == creator, "Only creator");
    _releaseFunds(covenantId);
}
```

**选项 B (升级后)**:
```solidity
// 新增状态
enum CovenantStatus {
    Active,
    Submitted,      // 新增：执行者已提交，等待争议期
    Completed,
    Disputed,
    Cancelled,
    Slashed
}

// 新增存储
mapping(bytes32 => uint64) public completionSubmittedAt;
mapping(bytes32 => bytes32) public completionProof;

// 新增函数
function submitCompletion(bytes32 covenantId, bytes32 proofHash) external {
    require(msg.sender == ownerOf(executorAgentId), "Not executor");
    require(status == CovenantStatus.Active, "Invalid status");

    covenants[covenantId].status = CovenantStatus.Submitted;
    completionSubmittedAt[covenantId] = uint64(block.timestamp);
    completionProof[covenantId] = proofHash;
}

function finalizeCompletion(bytes32 covenantId) external {
    require(status == CovenantStatus.Submitted, "Not submitted");
    require(block.timestamp >= completionSubmittedAt[covenantId] + 7 days, "Dispute period");

    _releaseFunds(covenantId);
}

// 修改争议函数
function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external {
    require(msg.sender == creator, "Only creator");
    require(
        status == CovenantStatus.Active || status == CovenantStatus.Submitted,
        "Invalid status"
    );
    // 可以在 Submitted 状态发起争议
}
```

### 升级平滑度评估

**✅ 平滑的部分**:
- 核心资金流不变（_releaseFunds 逻辑相同）
- TrustRegistry 集成不变（lockStake/unlockStake/slash 调用相同）
- 争议机制不变（只是扩展了可争议的状态）
- 数据结构兼容（只是新增字段，不修改现有字段）

**⚠️ 需要注意的部分**:
- 新增一个中间状态 `Submitted`
- 需要处理"提交后 7 天内发起争议"的情况
- 需要新增 2 个 mapping（增加存储成本）
- 前端需要适配新的流程

**结论**: 升级相对平滑，主要是**增量修改**而非重构。

### 升级成本估算

| 项目 | 工作量 | 风险 |
|------|--------|------|
| 合约修改 | 2-3 小时 | 低 |
| 测试更新 | 1-2 小时 | 低 |
| 前端适配 | 3-4 小时 | 中 |
| 用户教育 | - | 中 |

**总结**: C→B 升级是可行的，但不是零成本。

---

## 决策建议

### 推荐方案：渐进式路线

**Phase 1 (MVP - 本周完成)**:
- 使用选项 C：只有创建者可以标记完成
- 理由：
  1. 实现最简单，5 天 Hackathon 时间紧张
  2. 可以快速验证核心流程（质押→托管→惩罚）
  3. 适合早期测试和 Demo

**Phase 2 (Hackathon 后优化)**:
- 升级到选项 B：自动确认 + 争议期
- 理由：
  1. 升级路径平滑（上面已分析）
  2. 解决创建者恶意不确认的问题
  3. 更符合去中心化精神

**风险缓解**:
- MVP 阶段在文档中明确说明"创建者需诚信确认"
- 前端显示警告："请确保与可信任的创建者合作"
- 收集 MVP 用户反馈，指导 Phase 2 设计

---

## 问题 2: 裁决者角色

### 推荐方案：多签钱包（MVP）→ DAO（长期）

**MVP 阶段**:
```solidity
// 部署时设置
constructor(...) {
    _grantRole(ARBITER_ROLE, 0x...);  // 项目方 2/3 多签
}
```

**理由**:
- ✅ 快速启动，无需等待 DAO 基础设施
- ✅ 2/3 多签提供基本去中心化
- ✅ 可以快速响应争议（Hackathon Demo 需要）
- ✅ 后续可以通过 `grantRole` 转移给 DAO

**长期方案**:
- 实现链上投票合约
- ARBITER_ROLE 转移给 DAO 合约
- 争议裁决通过代币持有者投票

**过渡路径**:
1. MVP: 多签钱包
2. V2: 多签 + 社区顾问委员会
3. V3: 完全 DAO 治理

---

## 问题 3: 争议证据存储

### 推荐方案：只存储 Hash（MVP）

**当前设计**:
```solidity
function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external;
function resolveDispute(bytes32 covenantId, bool executorWins, bytes32 resolutionHash) external;
```

**理由**:
- ✅ Gas 成本低（只存储 32 bytes）
- ✅ 隐私保护（敏感信息不上链）
- ✅ 灵活性高（证据可以是 IPFS、Arweave、或加密文档）
- ✅ 符合 Web3 最佳实践

**证据提交流程**:
1. 创建者上传证据到 IPFS
2. 获得 CID: `QmXxx...`
3. 计算 hash: `keccak256(abi.encodePacked(CID))`
4. 调用 `disputeCovenant(covenantId, hash)`
5. 裁决者链下验证证据，链上提交裁决

**不推荐**:
- ❌ 链上存储完整证据（Gas 成本极高）
- ❌ 链上存储 IPFS CID 字符串（浪费存储）

---

## 问题 4: 最小报酬限制

### 推荐方案：不设置（MVP）

**理由**:
- ✅ 灵活性：允许小额任务测试
- ✅ 简化代码：减少验证逻辑
- ✅ 市场决定：不合理的报酬自然没人接受

**潜在问题**:
- ⚠️ 垃圾任务（1 wei 报酬）
- ⚠️ Gas 成本可能超过报酬

**缓解措施**:
- 前端设置推荐最小值（如 10 USDC）
- 前端显示 Gas 成本估算
- 后续可通过治理添加最小值

**如果要添加**:
```solidity
uint128 public constant MIN_REWARD = 1e6;  // 1 USDC (6 decimals)

function createCovenant(...) external {
    require(reward >= MIN_REWARD, "Reward too low");
    // ...
}
```

---

## 问题 5: Gas 优化 - 批量操作

### 推荐方案：不实现（MVP）

**理由**:
- ✅ MVP 不需要批量操作
- ✅ 单个任务流程已经足够复杂
- ✅ 批量操作增加测试复杂度
- ✅ 5 天时间不够

**什么时候需要批量操作**:
- 一个创建者同时创建 10+ 个任务
- 一个执行者同时完成多个任务
- 裁决者同时处理多个争议

**MVP 阶段不太可能出现这些场景**

**如果未来需要**:
```solidity
function batchCreateCovenant(
    CreateCovenantParams[] calldata params
) external returns (bytes32[] memory covenantIds);
```

但这是 V2+ 的优化，不是 MVP 必需品。

---

## 最终决策总结

### 已确定的决策

| 问题 | 决策 | 决策者 |
|------|------|--------|
| 1. 完成确认机制 | **Option B**: 自动确认+7天争议期 | 用户 (2026-03-18) |

**用户决策理由**：直接使用Option B，不走C→B升级路径。更robust和公平，防止创建者滥用，值得额外复杂度。

### 待与Codex讨论的问题

以下问题需要Claude和Codex讨论后确定：

**问题2：裁决者角色 (ARBITER_ROLE)**
- Claude建议：2/3多签钱包 (MVP) → DAO治理 (长期)
- 待讨论：Codex是否同意？有其他方案吗？

**问题3：证据存储**
- Claude建议：只存储Hash (evidenceHash, resolutionHash)
- 待讨论：Codex是否同意？实现上有问题吗？

**问题4：最小报酬限制**
- Claude建议：不设置最小值
- 待讨论：Codex认为是否需要？

**问题5：批量操作**
- Claude建议：MVP不实现
- 待讨论：Codex是否同意？

**下一步**：等待Codex参与讨论，确定问题2-5的最终方案。

---

## 给 Codex 的实现指令

**重要**：在开始实现前，Claude和Codex必须先讨论并确定问题2-5的方案。

### 已确定实现（问题1）:
1. ✅ **Option B 完成确认机制**：
   - submitCompletion() - 执行者提交完成
   - finalizeCompletion() - 7天后任何人可finalize
   - disputeCovenant() - 创建者可在Active或Submitted状态发起争议

### 待讨论后实现（问题2-5）:
- 等待与Codex讨论后更新此部分

---

**决策完成日期**: 2026-03-18
**已决策**: 问题1 (Option B)
**待讨论**: 问题2-5
**下一步**: Claude和Codex讨论问题2-5，然后Codex开始实现
