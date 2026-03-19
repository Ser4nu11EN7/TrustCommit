# TrustCommit Project Status

**Last Updated**: 2026-03-18

## Project Overview
TrustCommit - 四层代理信任基础设施，结合信誉评分与智能合约托管，为 Synthesis Hackathon 开发。

## Team Division
- **Claude (我)**: 架构设计、代码 review、技术建议
- **Codex**: 具体实现、测试、部署

## 已完成组件

### ✅ Trust Registry Contract (第一个核心合约)

**状态**: 实现完成，待测试和部署

**文件位置**:
- `contracts/TrustRegistry.sol` (196 行)
- `contracts/interfaces/ITrustRegistry.sol`
- `test/TrustRegistry.t.sol` (241 行测试)
- `script/DeployTrustRegistry.s.sol`

**核心功能**:
1. Agent 注册 (ERC-721 NFT)
2. 自质押机制 (self-staking)
3. 质押锁定/解锁 (lockStake/unlockStake)
4. 惩罚机制 (slash)
5. 信誉评分 (0-10000 basis points)
6. 角色权限控制 (ORACLE_ROLE, COVENANT_ROLE)

**安全特性**:
- 防止 fee-on-transfer token
- 强制自注册 (防止代注册)
- 自动清理零值锁定
- ReentrancyGuard + Pausable

**设计决策记录**:
- ✅ Agent 自质押模型 (非委托质押)
- ✅ MVP 简化范围 (无检查点历史、无提款冷却期)
- ✅ uint16 scoreBps (0-10000 基点)
- ✅ lockStake 包含在 MVP (防止质押提取漏洞)

**Review 文档**:
- `docs/review/claude-codex-dialogue.md`
- `docs/review/claude-review-summary.md`

## 待办事项 (按优先级)

### 🔄 Phase 1: Trust Registry 验证与部署
**负责人**: Codex

1. **运行 Foundry 测试**
   ```bash
   forge test
   ```
   - 验证所有 18 个测试用例通过
   - 检查 gas 消耗报告

2. **部署到 Base Sepolia**
   - 配置 `.env` 文件 (PRIVATE_KEY, STAKE_TOKEN_ADDRESS)
   - 运行部署脚本
   - 在 Basescan 上验证合约
   - 授予 ORACLE_ROLE 和 COVENANT_ROLE 给测试地址
   - 执行端到端测试交易

3. **记录部署信息**
   - 合约地址
   - 交易哈希
   - Gas 消耗
   - Basescan 验证链接

### ✅ Phase 2: Covenant Contract 设计
**负责人**: Claude (我)

**当前状态**: 设计完成，待讨论和实现

**设计文档**: `docs/design/COVENANT_CONTRACT_DESIGN.md`

**已解决的设计问题**:
- ✅ 任务创建流程: 任何人可创建，直接指定执行者，创建时锁定资金和质押
- ✅ 资金托管机制: USDC 锁定在 Covenant 合约，完成时释放给执行者
- ✅ 任务状态转换: Active → Completed/Disputed/Cancelled/Slashed
- ✅ 争议解决机制: ARBITER_ROLE 裁决，裁决后触发 slash 或完成
- ✅ 超时处理: 任何人可调用 timeoutCovenant()，自动触发 slash
- ✅ 取消机制: 需要双方同意才能取消

**待讨论的开放问题**:
1. 完成确认机制: 选项 A (执行者提交+创建者确认) vs 选项 B (自动确认+争议期) vs 选项 C (只有创建者确认)
2. 裁决者角色: MVP 阶段由谁担任 ARBITER_ROLE？
3. 争议证据: evidenceHash 是否需要链上存储？
4. 最小报酬限制: 是否需要设置？
5. Gas 优化: 是否需要批量操作？

**下一步**:
1. Claude 和 Codex 讨论开放问题，达成共识
2. Codex 根据设计文档实现合约
3. Claude review 实现代码

### 📋 Phase 3: Trust Oracle Service 设计
**负责人**: Claude (我)

**当前状态**: 待开始

**任务**:
1. 设计信誉评分算法
2. 定义数据来源 (链上事件 vs 链下数据)
3. 设计 Oracle 服务架构
4. 定义 commitReputation 调用时机

### 📋 Phase 4: Frontend 设计
**负责人**: Claude (我)

**当前状态**: 待开始

**任务**:
1. 设计用户界面流程
2. 定义与合约的交互接口
3. 设计 Agent 信息展示页面
4. 设计 Covenant 创建和管理界面

## 技术栈

**智能合约**:
- Solidity ^0.8.20
- OpenZeppelin Contracts
- Foundry (测试和部署)

**目标链**:
- Base Sepolia (测试网)
- Base Mainnet (最终部署)

**质押代币**:
- USDC (或测试网 Mock USDC)

## 关键文件索引

```
TrustCommit/
├── contracts/
│   ├── TrustRegistry.sol          # 主合约
│   └── interfaces/
│       └── ITrustRegistry.sol     # 接口定义
├── test/
│   └── TrustRegistry.t.sol        # Foundry 测试
├── script/
│   └── DeployTrustRegistry.s.sol  # 部署脚本
└── docs/
    ├── PROJECT_STATUS.md          # 本文件 (项目状态)
    ├── PROJECT_OVERVIEW.md        # 项目概述
    ├── synthesis-brainstorm-v2.md # 初始头脑风暴
    └── review/
        ├── claude-codex-dialogue.md      # 设计讨论记录
        └── claude-review-summary.md      # Review 总结
```

## 下一步行动

**立即行动** (Codex):
1. 运行 `forge test` 验证 TrustRegistry 合约
2. 报告测试结果

**等待中** (Claude):
1. 等待 TrustRegistry 测试结果
2. 开始设计 Covenant Contract 架构

## 风险与阻塞

**当前无阻塞**

**潜在风险**:
1. Base Sepolia 测试网可能不稳定
2. USDC 测试代币获取可能需要时间
3. 5 天 Hackathon 时间紧张

## 备注

- 所有重要决策和讨论都记录在 `docs/review/` 目录
- 上下文压缩后可查阅本文件恢复项目状态
- Claude 和 Codex 的对话历史保存在 `claude-codex-dialogue.md`
