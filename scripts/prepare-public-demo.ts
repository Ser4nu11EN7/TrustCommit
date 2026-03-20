import fs from "node:fs";
import path from "node:path";
import { decodeEventLog, keccak256, toBytes, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadContractArtifact } from "../runtime/src/chain/artifacts.js";
import {
  executionWalletAccount,
  executorOwnerAccount,
  parseFlag,
  preparePublicRuntimeContext,
  requireAccount
} from "./public-runtime-context.js";

const DEFAULT_CREATOR_PAYMENT = 50_000_000n;
const DEFAULT_EXECUTOR_STAKE = 1_000_000_000n;

function writeJson(outputPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  const configOnly = parseFlag("--config-only");
  const skipMint = parseFlag("--skip-mint");
  const context = await preparePublicRuntimeContext(process.cwd(), true);
  const { config, client, chainId, stakeTokenAddress, paymentTokenAddress } = context;

  const reportDir = path.join(config.dataDir, "public-proof", "public-prep");
  const registryArtifact = loadContractArtifact(config.workspaceRoot, path.join("TrustRegistry.sol", "TrustRegistry.json"));
  const tokenArtifact = loadContractArtifact(config.workspaceRoot, path.join("MockERC20.sol", "MockERC20.json"));

  const summaryBase = {
    rpcUrl: context.rpcUrl,
    chainId,
    addresses: {
      trustRegistry: config.addresses?.trustRegistry ?? null,
      covenant: config.addresses?.covenant ?? null,
      stakeToken: stakeTokenAddress,
      paymentToken: paymentTokenAddress
    },
    accounts: {
      deployer: config.accounts?.deployer?.address ?? null,
      creator: config.accounts?.creator?.address ?? null,
      executorOwner: config.accounts?.executorOwner?.address ?? config.accounts?.executor?.address ?? null,
      executionWallet: config.accounts?.executionWallet?.address ?? config.accounts?.executor?.address ?? null,
      arbiter: config.accounts?.arbiter?.address ?? null
    }
  };

  if (configOnly) {
    const report = {
      ok: true,
      mode: "config-only",
      ...summaryBase
    };
    writeJson(path.join(reportDir, "public-config.json"), report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const deployer = requireAccount(config, "deployer");
  const creator = requireAccount(config, "creator");
  const executorOwner = executorOwnerAccount(config);
  const executionWallet = executionWalletAccount(config);

  const deployerClient = createWalletClient({
    account: privateKeyToAccount(deployer.privateKey!),
    transport: http(context.rpcUrl)
  });
  const creatorClient = createWalletClient({
    account: privateKeyToAccount(creator.privateKey!),
    transport: http(context.rpcUrl)
  });
  const ownerClient = createWalletClient({
    account: privateKeyToAccount(executorOwner.privateKey!),
    transport: http(context.rpcUrl)
  });
  const executionClient = createWalletClient({
    account: privateKeyToAccount(executionWallet.privateKey!),
    transport: http(context.rpcUrl)
  });

  const txs: Record<string, `0x${string}` | null> = {
    mintCreatorPayment: null,
    mintExecutorStake: null,
    registerAgent: null,
    approveStake: null,
    stake: null,
    updateExecutionWallet: null
  };

  if (!skipMint) {
    txs.mintCreatorPayment = await deployerClient.writeContract({
      address: paymentTokenAddress!,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "mint",
      args: [creator.address, DEFAULT_CREATOR_PAYMENT],
      chain: null
    });
    await client.waitForTransactionReceipt({ hash: txs.mintCreatorPayment });

    txs.mintExecutorStake = await deployerClient.writeContract({
      address: stakeTokenAddress!,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "mint",
      args: [executorOwner.address, DEFAULT_EXECUTOR_STAKE],
      chain: null
    });
    await client.waitForTransactionReceipt({ hash: txs.mintExecutorStake });
  }

  const profileHash = keccak256(toBytes("trustcommit-public-executor"));
  txs.registerAgent = await ownerClient.writeContract({
    address: config.addresses!.trustRegistry,
    abi: registryArtifact.abi as readonly unknown[],
    functionName: "registerAgent",
    args: [executorOwner.address, "ipfs://trustcommit-public-executor", profileHash],
    chain: null
  });
  const registerReceipt = await client.waitForTransactionReceipt({ hash: txs.registerAgent });
  const registeredLog = registerReceipt.logs.find(
    (entry) => entry.address.toLowerCase() === config.addresses!.trustRegistry.toLowerCase()
  );
  if (!registeredLog) {
    throw new Error("AgentRegistered event not found in registerAgent receipt.");
  }
  const decoded = decodeEventLog({
    abi: registryArtifact.abi as readonly unknown[],
    data: registeredLog.data,
    topics: registeredLog.topics
  }) as { args?: Record<string, unknown> };
  const agentId = Number(decoded.args?.agentId);

  txs.approveStake = await ownerClient.writeContract({
    address: stakeTokenAddress!,
    abi: tokenArtifact.abi as readonly unknown[],
    functionName: "approve",
    args: [config.addresses!.trustRegistry, DEFAULT_EXECUTOR_STAKE],
    chain: null
  });
  await client.waitForTransactionReceipt({ hash: txs.approveStake });

  txs.stake = await ownerClient.writeContract({
    address: config.addresses!.trustRegistry,
    abi: registryArtifact.abi as readonly unknown[],
    functionName: "stake",
    args: [BigInt(agentId), DEFAULT_EXECUTOR_STAKE],
    chain: null
  });
  await client.waitForTransactionReceipt({ hash: txs.stake });

  if (executionWallet.address.toLowerCase() !== executorOwner.address.toLowerCase()) {
    const nonce = await client.readContract({
      address: config.addresses!.trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "executionWalletNonce",
      args: [BigInt(agentId)]
    }) as bigint;

    const proof = await executionClient.signTypedData({
      account: privateKeyToAccount(executionWallet.privateKey!),
      domain: {
        name: "TrustCommitRegistry",
        version: "1",
        chainId,
        verifyingContract: config.addresses!.trustRegistry
      },
      types: {
        AcceptExecutionRole: [
          { name: "agentId", type: "uint256" },
          { name: "newWallet", type: "address" },
          { name: "nonce", type: "uint256" }
        ]
      },
      primaryType: "AcceptExecutionRole",
      message: {
        agentId: BigInt(agentId),
        newWallet: executionWallet.address,
        nonce
      }
    });

    txs.updateExecutionWallet = await ownerClient.writeContract({
      address: config.addresses!.trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "updateExecutionWallet",
      args: [BigInt(agentId), executionWallet.address, proof],
      chain: null
    });
    await client.waitForTransactionReceipt({ hash: txs.updateExecutionWallet });
  }

  const report = {
    ok: true,
    mode: "prepare-public-demo",
    agentId,
    minted: !skipMint,
    ...summaryBase,
    txs
  };

  writeJson(path.join(reportDir, "public-prep.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

await main();
