# TrustCommit 评审证据包

## 一句话

TrustCommit 让自主智能体不仅能行动，而且必须对自己的承诺、执行和结果负责。

---

## 评审最短判断路径

如果评审只看一分钟，最关键的 4 个结论是：

1. 这不是概念项目，已经有真实公开链部署
2. 这不是普通 agent demo，而是 agent 的承诺、证明、回执、争议与结算系统
3. 这不是只有 happy path，已经有公开 dispute path
4. 这不是人类单独做完的项目，agent 真实参与了方向收敛、架构决策、批评和实现推进

---

## Claim -> Proof 对照表

### Claim 1
**TrustCommit 已真实报名并创建项目，不是离线自说自话。**

**Proof**
- Participant 名称：`TrustCommit`
- Team 名称：`TrustCommit's Team`
- Project 名称：`TrustCommit`
- Project UUID：`93f286877c37471ca32ede876e68244e`
- Project 状态：`draft`
- 报名链上交易：
  - `0x2001ac9a2b035b11f0e59ca6a906505f3afdb6c3c4553a3002c6486861ecda4c`

### Claim 2
**参赛主体已经完成 self-custody，不是停留在平台托管状态。**

**Proof**
- self-custody 状态：`transfer_complete`
- custodyType：`self_custody`
- owner 地址：`0x7774E594D9d0507e9205f76ef9b2d96d85b61229`
- self-custody 交易：
  - `0xcb6c7cc91beccbad0aa243a2da0fec725748f90f615fad0a56f17365fe61062d`

### Claim 3
**项目已经真实部署到 Base Sepolia。**

**Proof**
- Shared token：
  - `0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78`
- TrustRegistry：
  - `0x8BC8519dcB8d09e34295d1293C45B536a9acB6Ae`
- Covenant：
  - `0x173Ba54B0c8Ef0D0e6Ee4905A81Ff268907A079E`
- 部署交易：
  - token：`0xf879fe3890b42d0ea97c9aac765303af2ddc3e37fd74cb17bbf8ad15cbfc46e0`
  - registry：`0x87a717bd6c0cf5102024535aa2ea06713cf7b002b89cddfb7468a6225bf581dd`
  - covenant：`0x0aaf7ba70c58510258764b1b3fd7f94ba9c777d10f9487ee1994fe8a10c473ce`
  - role grant：`0xc00ab73dc656e9c33fe196426d0a198dfc2c4466f70ec225c4bb56503664f477`

### Claim 4
**项目有真实公开链 happy path，不只是本地链或文档描述。**

**Proof**
- taskId：`task_fd3e380d-a74d-4f42-a69b-18059b169daf`
- covenantId：
  - `0x7e5e5d2e38cc1c0139a4b21105694384e2d6c0ed9ab4e793d302a4a557ede09b`
- 状态：`submitted`
- verifier 结果：`77 / 77 verified`
- create：
  - `0x86dd54c19f8f5cff6c9f03998c6602940d84e0483b9d04bf59ef6ef361323b03`
- accept：
  - `0xd9d1a2b0c1e1799e5ef9800f171d024c11d19a228c373a44eb58778cee95f304`
- submit：
  - `0x83dce5f3ce12747873064f7518b65bcd05801fa5246da6bef80eb767d066fd3e`
- proofHash：
  - `0x405875df7af6749187bd75696094caa1cea2b45a62daa68ef236ec35f7f13556`
- receiptHead：
  - `0xe96c9eff1091be32e32000c65f10bf1cdfb5945ce04c80a9d3be57753b7b4a84`
- anchoredReceiptHead：
  - `0x97837c8277d4eb8f6004ef546a42d5c6b3a2a82a7c1cd8bf02f60c1c222ee459`

### Claim 5
**项目有真实公开链 dispute path，这才是 TrustCommit 的核心价值。**

**Proof**
- taskId：`task_c3bbe5fd-27c4-4cec-8f17-db021d218e70`
- covenantId：
  - `0xc495ec810e34caaf74d18eb886066f34b39e251699511cd19ca89691c7611467`
- 状态：`completed`
- verifier 结果：`95 / 95 verified`
- create：
  - `0xa1b110a3683978f06e5106437ea1def6745671b254ccb00290f7df6c650647e1`
- accept：
  - `0x9eb0940b037f358e00d1adef9c80c8f411a9ed0b4c53f75deb40b1992590671d`
- submit：
  - `0x563e9015dbf375eba65486f1945967559fd85ad536e38073075b7eaeb2af20a9`
- dispute：
  - `0x0c68c5078f30b6cb4b91864b7408c186fd50b125505da429da3fce9786ad5637`
- resolve：
  - `0x590ff831de9ef02cb6af0d2cde52774c46280faf3ae0ada5ef733ff36113cfbb`
- proofHash：
  - `0x369a2cf68fc375feeeb1653ec6848510a7505d2ddf4f57f3b5c8549a9eaf4e83`
- receiptHead：
  - `0xc493d91e7a52bddb3cfab96075f0cfc273bda76dd5c81d3900289808eca93269`
- anchoredReceiptHead：
  - `0xcc9da20388b9b91e2060ea1f4aadd77f2cfa445110976ba2a99cb3e2b31fda19`

### Claim 6
**项目不是只会记录日志，而是有独立 verifier。**

**Proof**
- happy path verifier：`77 / 77 verified`
- dispute path verifier：`95 / 95 verified`
- verifier 检查对象包括：
  - proof bundle
  - receipt chain
  - signer
  - covenant / task 绑定
  - dispute 相关证据链

### Claim 7
**项目不是“人类做完、agent 来使用”，而是 agent 真实参与了项目建造。**

**Proof**
- 项目 genesis 不是直接写代码，而是先进行 Claude ↔ Codex 对抗式 brainstorm
- 后续 agent 真实参与：
  - 方向收敛
  - 协议设计
  - hostile review
  - narrative critique
  - runtime / verifier / console 推进
- 这部分已被整理成正式 conversation log

---

## 这个项目到底解决什么问题

自主智能体已经可以替人执行任务，但它们仍然很难被安全地赋予真实承诺。

今天的常见问题是：
- agent 能给出结果，但不能证明为什么这个结果应该成立
- agent 能执行动作，但没有中立的履约边界
- 一旦出错，很难区分：
  - 是任务定义有问题
  - 是智能体越界了
  - 还是执行结果本身不可信

TrustCommit 的回答不是“让 agent 更聪明”，而是：

- 让 agent 先接受 covenant
- 再提交 proof bundle
- 再留下 receipt chain
- 再通过 verifier 检查
- 必要时进入 dispute / resolve

---

## 这个项目为什么不是普通 agent demo

普通 agent demo 通常展示的是：
- agent 会行动
- agent 会输出
- agent 会调用工具

TrustCommit 展示的是：
- agent 会接受义务
- agent 的执行有边界
- agent 的结果需要证明
- agent 的提交可以被验证
- agent 的行为可以被质疑和裁决

一句话：

**普通 agent 输出答案。TrustCommit 让 agent 对答案负责。**

---

## 当前最强的展示顺序

如果评审时间很短，最适合的顺序是：

1. 先说一句话
   - TrustCommit 让自主智能体对承诺、执行和结果负责

2. 立刻展示公开 dispute path
   - 因为这是最能体现系统价值的部分

3. 再说它已经真实部署到 Base Sepolia

4. 再补一句：
   - 这个项目不是单纯给 agent 用的基础设施，而是在 agent 深度参与下构建出来的 accountability layer

---

## 当前还缺什么

真正还缺的不是协议内核，而是提交层材料：

- 短视频
- 封面图
- 图片素材
- 更适合评审快速阅读的展示顺序

也就是说：

**项目的“真东西”已经够了，剩下缺的是让评审快速看懂这些真东西。**

---

## 最适合评审复述的一句话

**TrustCommit turns autonomous agents into accountable counterparties.**

或者中文：

**TrustCommit 让自主智能体从“会行动”变成“可追责的协作对手方”。**
