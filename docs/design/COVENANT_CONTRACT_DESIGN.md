# Covenant Contract 设计文档

**设计者**: Claude
**日期**: 2026-03-18
**状态**: 已收敛，待验证实现
**实现者**: Codex

## 1. 核心概念

Covenant Contract 是任务托管合约，实现以下功能：
- Agent A 创建任务，锁定 USDC 作为报酬
- Agent B 接受任务，TrustRegistry 锁定其质押作为保证金
- 任务完成后释放报酬，或违约时惩罚质押

## 2. 关键设计问题

### 2.1 任务创建流程

**问题**: 谁可以创建任务？参数是什么？

**建议方案**:
```solidity
function createCovenant(
    uint256 executorAgentId,    // 执行者的 Agent ID
    uint128 reward,              // 报酬金额 (USDC)
    uint128 requiredStake,       // 要求锁定的质押金额
    uint64 deadline,             // 任务截止时间
    bytes32 taskHash             // 任务描述的 IPFS hash
) external returns (bytes32 covenantId);
```

**设计决策**:
- ✅ 任何人都可以创建任务（不限于 Agent）
- ✅ 创建时立即锁定 USDC 报酬
- ✅ 创建时立即锁定执行者的质押（调用 TrustRegistry.lockStake）
- ✅ covenantId = keccak256(creator, executorAgentId, nonce)

**理由**:
- 简化 MVP：不需要"任务市场"，直接指定执行者
- 创建即锁定：防止资金不足的情况
- 链下协商：任务细节在链下商定，链上只记录 hash

### 2.2 任务状态机

**问题**: 任务有哪些状态？如何转换？

**建议方案**:
```solidity
enum CovenantStatus {
    Active,      // 任务进行中
    Completed,   // 任务完成，报酬已释放
    Disputed,    // 任务有争议，等待裁决
    Cancelled,   // 任务取消，资金退还
    Slashed      // 执行者违约，质押被惩罚
}
```

**状态转换图**:
```
Active → Completed (执行者提交完成 + 创建者确认)
Active → Disputed (创建者提出争议)
Active → Cancelled (截止前双方同意取消)
Disputed → Completed (裁决：执行者胜诉)
Disputed → Slashed (裁决：创建者胜诉)
Active → Slashed (超时未完成)
```

**设计决策**:
- ✅ MVP 简化：只支持单次裁决，不支持上诉
- ✅ 超时自动处理：任何人都可以调用 `timeoutCovenant()` 触发超时惩罚
- ✅ 争议需要裁决者：引入 ARBITER_ROLE（可以是 DAO 或可信第三方）

### 2.3 资金托管机制

**问题**: USDC 报酬锁定在哪里？如何释放？

**建议方案**:
```solidity
IERC20 public immutable paymentToken;  // USDC

mapping(bytes32 => uint128) public escrowBalance;  // covenantId => 锁定的报酬

function createCovenant(...) external {
    // 1. 转入 USDC 到合约
    paymentToken.safeTransferFrom(msg.sender, address(this), reward);
    escrowBalance[covenantId] = reward;

    // 2. 锁定执行者质押
    trustRegistry.lockStake(executorAgentId, covenantId, requiredStake);
}

function completeCovenant(bytes32 covenantId) external {
    // 释放报酬给执行者
    address executor = ownerOf(executorAgentId);
    paymentToken.safeTransfer(executor, escrowBalance[covenantId]);

    // 解锁质押
    trustRegistry.unlockStake(executorAgentId, covenantId);
}
```

**设计决策**:
- ✅ Covenant 合约持有 USDC 托管资金
- ✅ 完成时报酬转给执行者的 NFT owner（不是 executionWallet）
- ✅ 取消时报酬退还给创建者

### 2.4 争议解决机制

**问题**: 谁来裁决？如何触发 slash？

**建议方案**:
```solidity
bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external {
    require(msg.sender == creator, "Only creator can dispute");
    require(status == CovenantStatus.Active, "Invalid status");

    covenants[covenantId].status = CovenantStatus.Disputed;
    emit CovenantDisputed(covenantId, evidenceHash);
}

function resolveDispute(
    bytes32 covenantId,
    bool executorWins,
    bytes32 resolutionHash
) external onlyRole(ARBITER_ROLE) {
    if (executorWins) {
        // 执行者胜诉：释放报酬和质押
        _completeCovenant(covenantId);
    } else {
        // 创建者胜诉：惩罚执行者
        _slashCovenant(covenantId);
    }
}

function _slashCovenant(bytes32 covenantId) internal {
    // 1. 调用 TrustRegistry.slash
    trustRegistry.slash(
        executorAgentId,
        covenantId,
        requiredStake,
        creator,  // 质押赔偿给创建者
        reasonHash
    );

    // 2. 报酬退还给创建者
    paymentToken.safeTransfer(creator, escrowBalance[covenantId]);

    covenants[covenantId].status = CovenantStatus.Slashed;
}
```

**设计决策**:
- ✅ 只有创建者可以发起争议
- ✅ ARBITER_ROLE 由 Covenant 合约自身管理，MVP 推荐授予 2/3 多签；时间不足时可先授予项目方地址
- ✅ 惩罚时质押赔偿给创建者（双重补偿：报酬退还 + 质押赔偿）

### 2.5 超时处理

**问题**: 任务过期怎么办？

**建议方案**:
```solidity
function timeoutCovenant(bytes32 covenantId) external {
    require(block.timestamp > covenant.deadline, "Not expired");
    require(covenant.status == CovenantStatus.Active, "Invalid status");

    // 超时视为违约，自动惩罚
    _slashCovenant(covenantId);
}
```

**设计决策**:
- ✅ 任何人都可以调用（无需权限）
- ✅ 超时自动触发 slash
- ✅ 防止执行者拖延不完成任务

## 3. 核心数据结构

```solidity
struct CovenantState {
    CovenantStatus status;
    address creator;           // 任务创建者
    uint256 executorAgentId;   // 执行者 Agent ID
    uint128 reward;            // 报酬金额
    uint128 requiredStake;     // 要求的质押金额
    uint64 createdAt;
    uint64 deadline;
    bytes32 taskHash;          // 任务描述 IPFS hash
}

mapping(bytes32 => CovenantState) public covenants;
mapping(bytes32 => uint128) public escrowBalance;
```

## 4. 核心函数列表

### 4.1 任务管理
- `createCovenant()` - 创建任务
- `completeCovenant()` - 标记完成（需创建者确认）
- `cancelCovenant()` - 取消任务（需双方同意）
- `timeoutCovenant()` - 超时处理

### 4.2 争议处理
- `disputeCovenant()` - 发起争议
- `resolveDispute()` - 裁决争议

### 4.3 查询函数
- `getCovenantState()` - 获取任务状态
- `getEscrowBalance()` - 获取托管余额

## 5. 事件定义

```solidity
event CovenantCreated(
    bytes32 indexed covenantId,
    address indexed creator,
    uint256 indexed executorAgentId,
    uint128 reward,
    uint128 requiredStake,
    uint64 deadline
);

event CovenantCompleted(bytes32 indexed covenantId);
event CovenantDisputed(bytes32 indexed covenantId, bytes32 evidenceHash);
event CovenantCancelled(bytes32 indexed covenantId);
event CovenantSlashed(bytes32 indexed covenantId, bytes32 reasonHash);
event DisputeResolved(bytes32 indexed covenantId, bool executorWins, bytes32 resolutionHash);
```

## 6. 安全考虑

### 6.1 重入攻击防护
- 所有资金转移函数使用 `nonReentrant`
- 遵循 Checks-Effects-Interactions 模式

### 6.2 权限控制
- `ARBITER_ROLE` 用于争议裁决
- 只有创建者可以发起争议
- 只有创建者可以确认完成

### 6.3 资金安全
- 创建时立即锁定报酬和质押
- 防止 fee-on-transfer token（与 TrustRegistry 一致）
- 紧急暂停机制（Pausable）

### 6.4 时间安全
- 使用 `block.timestamp` 而非 `block.number`
- deadline 必须大于当前时间
- 防止超时后仍然完成任务

## 7. 与 TrustRegistry 的集成

### 7.1 依赖关系
```solidity
ITrustRegistry public immutable trustRegistry;

constructor(address _trustRegistry, address _paymentToken) {
    trustRegistry = ITrustRegistry(_trustRegistry);
    paymentToken = IERC20(_paymentToken);
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
}
```

### 7.2 调用时机
- `createCovenant()` → `trustRegistry.lockStake()`
- `completeCovenant()` → `trustRegistry.unlockStake()`
- `_slashCovenant()` → `trustRegistry.slash()`
- `cancelCovenant()` → `trustRegistry.unlockStake()`

### 7.3 权限配置
- Covenant 合约需要被授予 TrustRegistry 的 `COVENANT_ROLE`
- 部署后必须调用：`trustRegistry.grantRole(COVENANT_ROLE, covenantAddress)`

## 8. MVP 简化决策

**包含在 MVP**:
- ✅ 基本任务创建和完成流程
- ✅ 争议和裁决机制
- ✅ 超时自动惩罚
- ✅ 资金托管

**排除在 MVP 外**:
- ❌ 任务市场（公开任务列表）
- ❌ 多轮裁决/上诉机制
- ❌ 部分完成/里程碑支付
- ❌ 执行者主动提交完成（需创建者确认）
- ❌ 信誉分数门槛检查

## 9. 已确定的设计问题

### 9.1 完成确认机制

**决策**: 采用 Option B。
```solidity
function submitCompletion(bytes32 covenantId, bytes32 proofHash) external;
function finalizeCompletion(bytes32 covenantId) external;
```
- 执行者提交完成后进入 `Submitted`
- 记录 `completionSubmittedAt` 与 `completionProof`
- 7 天争议期后任何人可 `finalizeCompletion`
- 创建者可在 `Active` 或 `Submitted` 期间发起争议

### 9.2 取消机制

**问题**: 什么情况下可以取消任务？

**建议方案**:
```solidity
function cancelCovenant(bytes32 covenantId) external {
    require(covenant.status == CovenantStatus.Active, "Invalid status");
    require(
        msg.sender == creator || msg.sender == ownerOf(executorAgentId),
        "Not authorized"
    );

    // 需要双方都同意才能取消
    if (!cancelApprovals[covenantId][msg.sender]) {
        cancelApprovals[covenantId][msg.sender] = true;
        emit CancelApprovalGiven(covenantId, msg.sender);
        return;
    }

    // 双方都同意，执行取消
    _cancelCovenant(covenantId);
}
```

**设计决策**:
- ✅ 需要双方同意才能取消
- ✅ 取消后报酬退还创建者，质押解锁
- ✅ 防止单方面恶意取消

### 9.2 仲裁者角色

**决策**:
- Covenant 合约使用 OpenZeppelin `AccessControl`
- 不新增仲裁管理合约
- MVP 推荐将 `ARBITER_ROLE` 授予 2/3 多签
- 若时间不足，可先授予项目方地址，后续通过 `grantRole/revokeRole` 迁移到 DAO

### 9.3 证据与裁决存储

**决策**:
- 完整证据与裁决说明放链下（IPFS / Arweave）
- 链上只记录 `bytes32` 指纹
- `completionProof`、`disputeEvidence`、`resolutionHash` 均写入 storage，并同步 emit 事件

**理由**:
- 不依赖索引器就能查询关键状态
- 比上链完整字符串更省 gas
- 状态机与测试都更直接

### 9.4 最小报酬限制

**决策**:
- 设置部署时传入的 `immutable minReward`
- 不使用 admin 可调参数
- 若当前部署目标是 USDC 风格 payment token，可部署时传 `1e6`

**理由**:
- 避免 1 wei 类垃圾任务
- 不引入新的治理入口和 setter 测试
- 不把数值硬编码死在合约里，兼容不同 decimals 的 payment token

### 9.5 Batch 操作

**决策**:
- 明确排除在 MVP 外
- 不预留额外复杂数据结构
- 仅要求核心逻辑内聚，方便未来封装 `batch*` 外层函数

### 9.6 最小质押要求

**问题**: 是否需要检查执行者的质押余额？

**建议**:
- ✅ 创建时检查 `trustRegistry.stakeBalance(executorAgentId) - trustRegistry.lockedTotal(executorAgentId) >= requiredStake`
- ✅ 如果余额不足，创建失败并 revert
- ✅ 防止创建无法执行的任务

## 10. 实现优先级

### Phase 1: 核心流程（必须）
1. 数据结构定义
2. createCovenant()
3. completeCovenant()
4. _slashCovenant() 内部函数
5. timeoutCovenant()

### Phase 2: 争议机制（必须）
6. disputeCovenant()
7. resolveDispute()

### Phase 3: 取消机制（可选）
8. cancelCovenant()
9. 双方确认逻辑

### Phase 4: 查询和工具函数
10. getCovenantState()
11. 各种 view 函数

## 11. 测试用例设计

### 11.1 正常流程测试
- ✅ 创建任务 → 完成任务 → 报酬释放
- ✅ 创建任务 → 超时 → 自动惩罚

### 11.2 争议流程测试
- ✅ 创建任务 → 发起争议 → 裁决（执行者胜）
- ✅ 创建任务 → 发起争议 → 裁决（创建者胜）

### 11.3 取消流程测试
- ✅ 创建任务 → 双方同意取消 → 资金退还

### 11.4 边界条件测试
- ✅ 质押余额不足时创建失败
- ✅ 非创建者无法确认完成
- ✅ 非 ARBITER 无法裁决
- ✅ 已完成的任务无法再次操作

### 11.5 安全测试
- ✅ 重入攻击测试
- ✅ 权限控制测试
- ✅ 暂停机制测试

## 12. 部署清单

1. 部署 Covenant 合约（需要 TrustRegistry 地址和 USDC 地址）
2. 在 TrustRegistry 上授予 Covenant 合约 `COVENANT_ROLE`
3. 在 Covenant 合约上授予 ARBITER_ROLE 给裁决者地址
4. 验证合约在 Basescan
5. 执行端到端测试

## 13. 下一步行动

**给 Codex 的任务**:
1. 根据本设计文档实现 Covenant.sol
2. 实现 ICovenant.sol 接口
3. 编写 Covenant.t.sol 测试文件
4. 编写 DeployCovenant.s.sol 部署脚本
5. 在本机补齐 Foundry 环境后运行测试并修正编译问题

**待 Review 的内容**:
1. `completionProof` / `disputeEvidence` / `resolutionHash` 采用独立 mapping 的存储布局
2. 取消流程对 NFT 转移场景的行为是否满足预期
3. Foundry 测试覆盖是否足够

---

**设计完成日期**: 2026-03-18
**当前状态**: 已完成决策并落地实现草案
