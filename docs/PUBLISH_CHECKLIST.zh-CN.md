# TrustCommit Publish Checklist

## 公开链接

- 仓库：
  - `https://github.com/Ser4nu11EN7/TrustCommit`
- Demo 视频：
  - `[待填写]`
- 在线前端：
  - `[待填写]`
- 在线 runtime API：
  - `[待填写]`
- 提交页面：
  - `https://synthesis.md/`

## 提交材料

- [x] README
  - [README.md](/C:/Users/SerEN/TrustCommit/README.md)
- [x] 提交 framing
  - [SUBMISSION.md](/C:/Users/SerEN/TrustCommit/docs/SUBMISSION.md)
- [x] 评审证据包
  - [JUDGE_EVIDENCE_PACK.zh-CN.md](/C:/Users/SerEN/TrustCommit/docs/JUDGE_EVIDENCE_PACK.zh-CN.md)
- [x] 共创 / 对话记录
  - [CONVERSATION_LOG.zh-CN.md](/C:/Users/SerEN/TrustCommit/docs/CONVERSATION_LOG.zh-CN.md)
- [ ] Demo 视频链接已填好
- [ ] 若公开站可交互，在线前端与在线 runtime 链接已填好

## 链上证据

- 网络：
  - `Base Sepolia (chainId 84532)`
- TrustRegistry：
  - `0x8BC8519dcB8d09e34295d1293C45B536a9acB6Ae`
- Covenant：
  - `0x173Ba54B0c8Ef0D0e6Ee4905A81Ff268907A079E`
- Shared Token：
  - `0x1EeEd8DB942FC2bE3351350b2bcC9c70cd6f4B78`
- Deploy TXs：
  - token `0xf879fe3890b42d0ea97c9aac765303af2ddc3e37fd74cb17bbf8ad15cbfc46e0`
  - registry `0x87a717bd6c0cf5102024535aa2ea06713cf7b002b89cddfb7468a6225bf581dd`
  - covenant `0x0aaf7ba70c58510258764b1b3fd7f94ba9c777d10f9487ee1994fe8a10c473ce`
  - covenant role grant `0xc00ab73dc656e9c33fe196426d0a198dfc2c4466f70ec225c4bb56503664f477`

## Demo 重点

- [ ] 展示首页进入 console
- [ ] 展示真实任务列表不是空壳
- [ ] 展示任务从提交到验证/复核的状态流
- [ ] 展示导出记录
- [ ] 展示至少一个公开 submit flow
- [ ] 展示至少一个公开 dispute flow
- [ ] 讲清一句核心叙事：
  - `TrustCommit 让智能体的承诺、执行和结果都变得可验证、可质疑、可追责。`

## 发布前命令

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `cd frontend && npm run build`
- [ ] `npm run preflight:public`

## 在线公开版额外检查

- [ ] `VITE_RUNTIME_API_URL` 已配置到公网 runtime
- [ ] runtime `.env` 已配置 RPC / 私钥 / 合约地址
- [ ] `/api/health` 可访问
- [ ] `/api/tasks` 可访问
- [ ] 浏览器打开 console 后能正常读取任务

## 最终提交包

- [ ] GitHub repo 链接
- [ ] Demo 视频链接
- [ ] 合约地址
- [ ] 关键交易哈希
- [ ] README / SUBMISSION / EVIDENCE PACK / CONVERSATION LOG
- [ ] 一句话 pitch

## 备用一句话

`TrustCommit makes autonomous agents prove why their actions deserve to settle.`
