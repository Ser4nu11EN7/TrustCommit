import fs from "node:fs";
import path from "node:path";
import { decodeEventLog, keccak256, toBytes, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadContractArtifact } from "../runtime/src/chain/artifacts.js";
import {
  executionWalletAccount,
  executorOwnerAccount,
  parseFlag,
  type PreparedPublicRuntimeContext,
  preparePublicRuntimeContext,
  requireAccount
} from "./public-runtime-context.js";

const DEFAULT_CREATOR_PAYMENT = 50_000_000n;
const DEFAULT_EXECUTOR_STAKE = 1_000_000_000n;

function writeJson(outputPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

async function writeAndConfirm(
  client: ReturnType<typeof createWalletClient>,
  publicClient: PreparedPublicRuntimeContext["client"],
  params: Record<string, unknown>,
  nonceRef?: { value: number }
): Promise<`0x${string}`> {
  const txHash = await client.writeContract({
    ...params,
    chain: null,
    ...(nonceRef ? { nonce: nonceRef.value++ } : {})
  } as never);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
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

  const sharedNonce =
    deployer.address.toLowerCase() === creator.address.toLowerCase() &&
    deployer.address.toLowerCase() === executorOwner.address.toLowerCase() &&
    deployer.address.toLowerCase() === executionWallet.address.toLowerCase()
      ? {
          value: Number(await client.getTransactionCount({ address: deployer.address, blockTag: "pending" }))
        }
      : undefined;

  if (!skipMint) {
    txs.mintCreatorPayment = await writeAndConfirm(
      deployerClient,
      client,
      {
      address: paymentTokenAddress!,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "mint",
        args: [creator.address, DEFAULT_CREATOR_PAYMENT]
      },
      sharedNonce
    );

    txs.mintExecutorStake = await writeAndConfirm(
      deployerClient,
      client,
      {
      address: stakeTokenAddress!,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "mint",
        args: [executorOwner.address, DEFAULT_EXECUTOR_STAKE]
      },
      sharedNonce
    );
  }

  const profileHash = keccak256(toBytes("trustcommit-public-executor"));
  txs.registerAgent = await writeAndConfirm(
    ownerClient,
    client,
    {
    address: config.addresses!.trustRegistry,
    abi: registryArtifact.abi as readonly unknown[],
    functionName: "registerAgent",
      args: [executorOwner.address, "ipfs://trustcommit-public-executor", profileHash]
    },
    sharedNonce
  );
  const registerReceipt = await client.waitForTransactionReceipt({ hash: txs.registerAgent });
  const decoded = registerReceipt.logs
    .filter((entry) => entry.address.toLowerCase() === config.addresses!.trustRegistry.toLowerCase())
    .map((entry) => {
      try {
        return decodeEventLog({
          abi: registryArtifact.abi as readonly unknown[],
          data: entry.data,
          topics: entry.topics
        }) as { eventName?: string; args?: Record<string, unknown> };
      } catch {
        return null;
      }
    })
    .find((entry) => entry?.eventName === "AgentRegistered");
  if (!decoded) {
    throw new Error("AgentRegistered event not found in registerAgent receipt.");
  }
  const agentId = Number(decoded.args?.agentId);

  txs.approveStake = await writeAndConfirm(
    ownerClient,
    client,
    {
    address: stakeTokenAddress!,
    abi: tokenArtifact.abi as readonly unknown[],
    functionName: "approve",
      args: [config.addresses!.trustRegistry, DEFAULT_EXECUTOR_STAKE]
    },
    sharedNonce
  );

  txs.stake = await writeAndConfirm(
    ownerClient,
    client,
    {
    address: config.addresses!.trustRegistry,
    abi: registryArtifact.abi as readonly unknown[],
    functionName: "stake",
      args: [BigInt(agentId), DEFAULT_EXECUTOR_STAKE]
    },
    sharedNonce
  );

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

    txs.updateExecutionWallet = await writeAndConfirm(
      ownerClient,
      client,
      {
      address: config.addresses!.trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "updateExecutionWallet",
        args: [BigInt(agentId), executionWallet.address, proof]
      },
      sharedNonce
    );
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
