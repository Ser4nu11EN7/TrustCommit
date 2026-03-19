import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  stringToHex,
  toBytes
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AccountConfig, RuntimeConfig, SignatureRecord, TaskRecord } from "../core/types.js";
import { loadContractArtifact } from "./artifacts.js";

const COVENANT_ROLE = keccak256(toBytes("COVENANT_ROLE"));

const DEFAULT_ANVIL_ACCOUNTS = {
  deployer: {
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  },
  arbiter: {
    address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
  },
  creator: {
    address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
  },
  executor: {
    address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906"
  }
} satisfies Record<string, AccountConfig>;

type AddressConfig = NonNullable<RuntimeConfig["addresses"]>;

function getClient(config: RuntimeConfig) {
  return createPublicClient({ transport: http(config.rpcUrl) });
}

function getWalletClient(config: RuntimeConfig, account: AccountConfig) {
  return createWalletClient({
    account: account.privateKey ? privateKeyToAccount(account.privateKey) : account.address,
    transport: http(config.rpcUrl)
  });
}

function ensureAccounts(config: RuntimeConfig): Required<RuntimeConfig>["accounts"] {
  return config.accounts ?? DEFAULT_ANVIL_ACCOUNTS;
}

export class ChainAdapter {
  public constructor(private config: RuntimeConfig) {}

  public setConfig(config: RuntimeConfig): void {
    this.config = config;
  }

  public async ensureAnvilAvailable(): Promise<void> {
    const client = getClient(this.config);
    await client.getBlockNumber();
  }

  public async bootstrapLocalDemo(): Promise<RuntimeConfig> {
    await this.ensureAnvilAvailable();
    const client = getClient(this.config);
    const chainId = Number(await client.getChainId());
    if (chainId !== 31337) {
      throw new Error(`demo bootstrap requires Anvil chain 31337, got ${chainId}`);
    }

    const accounts = ensureAccounts(this.config);
    const deployerClient = getWalletClient(this.config, accounts.deployer);

    const mockArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("MockERC20.sol", "MockERC20.json"));
    const registryArtifact = loadContractArtifact(
      this.config.workspaceRoot,
      path.join("TrustRegistry.sol", "TrustRegistry.json")
    );
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));

    const tokenHash = await this.deployContract(deployerClient, {
      abi: mockArtifact.abi as readonly unknown[],
      bytecode: mockArtifact.bytecode.object,
      args: ["Mock USDC", "mUSDC", 6, accounts.deployer.address, 1_000_000_000_000n]
    });
    const tokenReceipt = await client.waitForTransactionReceipt({ hash: tokenHash });
    const token = tokenReceipt.contractAddress as `0x${string}`;

    const registryHash = await this.deployContract(deployerClient, {
      abi: registryArtifact.abi as readonly unknown[],
      bytecode: registryArtifact.bytecode.object,
      args: [token]
    });
    const registryReceipt = await client.waitForTransactionReceipt({ hash: registryHash });
    const trustRegistry = registryReceipt.contractAddress as `0x${string}`;

    const covenantHash = await this.deployContract(deployerClient, {
      abi: covenantArtifact.abi as readonly unknown[],
      bytecode: covenantArtifact.bytecode.object,
      args: [trustRegistry, token, accounts.arbiter.address, 1_000_000n]
    });
    const covenantReceipt = await client.waitForTransactionReceipt({ hash: covenantHash });
    const covenant = covenantReceipt.contractAddress as `0x${string}`;

    await this.writeContractAndConfirm(deployerClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "grantRole",
      args: [COVENANT_ROLE, covenant]
    });

    const creatorClient = getWalletClient(this.config, accounts.creator);
    const executorClient = getWalletClient(this.config, accounts.executor);

    for (const recipient of [accounts.creator.address, accounts.executor.address]) {
      await this.writeContractAndConfirm(deployerClient, {
        address: token,
        abi: mockArtifact.abi as readonly unknown[],
        functionName: "mint",
        args: [recipient, 1_000_000_000n]
      });
    }

    const profileHash = keccak256(toBytes("demo-executor"));
    await this.writeContractAndConfirm(executorClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "registerAgent",
      args: [accounts.executor.address, "ipfs://demo-executor", profileHash]
    });
    await this.writeContractAndConfirm(executorClient, {
      address: token,
      abi: mockArtifact.abi as readonly unknown[],
      functionName: "approve",
      args: [trustRegistry, 1_000_000_000n]
    });
    await this.writeContractAndConfirm(executorClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "stake",
      args: [1n, 1_000_000_000n]
    });

    return {
      ...this.config,
      chainId,
      accounts,
      addresses: {
        token,
        trustRegistry,
        covenant
      }
    };
  }

  public async createCovenant(task: TaskRecord): Promise<{ covenantId: `0x${string}`; txHash: `0x${string}` }> {
    const accounts = ensureAccounts(this.config);
    await this.assertWritableAccount(accounts.creator);
    const creator = getWalletClient(this.config, accounts.creator);
    const client = getClient(this.config);
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));
    const tokenArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("MockERC20.sol", "MockERC20.json"));
    const addresses = this.requireAddresses();

    await this.writeContractAndConfirm(creator, {
      address: addresses.token,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "approve",
      args: [addresses.covenant, BigInt(task.reward)]
    });

    const txHash = await this.writeContract(creator, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "createCovenant",
      args: [BigInt(task.executorAgentId), BigInt(task.reward), BigInt(task.requiredStake), BigInt(task.deadlineTs), task.taskHash]
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`createCovenant failed: ${txHash}`);
    }
    const event = receipt.logs.find((entry) => entry.address.toLowerCase() === addresses.covenant.toLowerCase());
    if (!event) {
      throw new Error("CovenantCreated event not found");
    }
    const decoded = decodeEventLog({
      abi: covenantArtifact.abi as readonly unknown[],
      data: event.data,
      topics: event.topics
    }) as { args?: Record<string, unknown> };
    return {
      covenantId: decoded.args?.covenantId as `0x${string}`,
      txHash
    };
  }

  public async submitCompletion(task: TaskRecord): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    await this.assertWritableAccount(accounts.executor);
    const executor = getWalletClient(this.config, accounts.executor);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));

    const txHash = await this.writeContractAndConfirm(executor, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "submitCompletion",
      args: [task.covenantId, task.proofHash]
    });
    return txHash;
  }

  public async finalizeCompletion(task: TaskRecord, fastForward = true): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    const deployer = getWalletClient(this.config, accounts.deployer);
    const client = getClient(this.config);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));

    if (fastForward && (await client.getChainId()) === 31337) {
      await this.rawRpc(client, "evm_increaseTime", [7 * 24 * 60 * 60]);
      await this.rawRpc(client, "evm_mine", []);
    }

    return this.writeContractAndConfirm(deployer, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "finalizeCompletion",
      args: [task.covenantId]
    });
  }

  public async dispute(task: TaskRecord, evidenceHash: `0x${string}`): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    await this.assertWritableAccount(accounts.creator);
    const creator = getWalletClient(this.config, accounts.creator);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));
    return this.writeContractAndConfirm(creator, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "disputeCovenant",
      args: [task.covenantId, evidenceHash]
    });
  }

  public async resolveDispute(task: TaskRecord, executorWins: boolean, reasonHash: `0x${string}`): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    await this.assertWritableAccount(accounts.arbiter);
    const arbiter = getWalletClient(this.config, accounts.arbiter);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));
    return this.writeContractAndConfirm(arbiter, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "resolveDispute",
      args: [task.covenantId, executorWins, reasonHash]
    });
  }

  public async getCovenantStatus(covenantId: `0x${string}`): Promise<number> {
    const addresses = this.requireAddresses();
    const client = getClient(this.config);
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));
    const status = await client.readContract({
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "covenants",
      args: [covenantId]
    });
    return Number((status as readonly unknown[])[0]);
  }

  public async getExecutorBalance(): Promise<bigint> {
    const client = getClient(this.config);
    const addresses = this.requireAddresses();
    const accounts = ensureAccounts(this.config);
    const tokenArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("MockERC20.sol", "MockERC20.json"));
    return client.readContract({
      address: addresses.token,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "balanceOf",
      args: [accounts.executor.address]
    }) as Promise<bigint>;
  }

  public async getCurrentTimestamp(): Promise<number> {
    const client = getClient(this.config);
    const block = await client.getBlock();
    return Number(block.timestamp);
  }

  public async signRolePayload(
    role: "deployer" | "creator" | "executor" | "arbiter",
    purpose: string,
    payloadHash: `0x${string}`
  ): Promise<SignatureRecord | null> {
    const accounts = ensureAccounts(this.config);
    const account = accounts[role];
    try {
      const walletClient = getWalletClient(this.config, account);
      const statement = `TrustCommit:${purpose}:${payloadHash}`;
      const signature = (await (walletClient as any).signMessage({
        account: account.privateKey ? privateKeyToAccount(account.privateKey) : account.address,
        message: { raw: stringToHex(statement) }
      })) as `0x${string}`;
      return {
        signer: account.address,
        signedAt: Date.now(),
        scheme: "eip191",
        purpose,
        statement,
        payloadHash,
        signature
      };
    } catch (_error) {
      return null;
    }
  }

  private requireAddresses(): AddressConfig {
    if (!this.config.addresses) {
      throw new Error("Runtime addresses are not configured. Run runtime init or demo bootstrap first.");
    }
    return this.config.addresses;
  }

  private async deployContract(walletClient: ReturnType<typeof createWalletClient>, params: Record<string, unknown>) {
    return (walletClient as any).deployContract({
      ...params,
      chain: null
    }) as Promise<`0x${string}`>;
  }

  private async writeContract(walletClient: ReturnType<typeof createWalletClient>, params: Record<string, unknown>) {
    return (walletClient as any).writeContract({
      ...params,
      chain: null
    }) as Promise<`0x${string}`>;
  }

  private async writeContractAndConfirm(
    walletClient: ReturnType<typeof createWalletClient>,
    params: Record<string, unknown>
  ): Promise<`0x${string}`> {
    const txHash = await this.writeContract(walletClient, params);
    await this.confirmTransaction(txHash);
    return txHash;
  }

  private async rawRpc(client: ReturnType<typeof createPublicClient>, method: string, params: unknown[]) {
    return (client as any).request({ method, params });
  }

  private async assertWritableAccount(account: AccountConfig): Promise<void> {
    if (account.privateKey) {
      return;
    }
    const chainId = Number(await getClient(this.config).getChainId());
    if (chainId !== 31337) {
      throw new Error(
        `Account ${account.address} relies on Anvil unlocked-address flow and cannot sign on chain ${chainId}.`
      );
    }
  }

  private async confirmTransaction(txHash: `0x${string}`): Promise<void> {
    const receipt = await getClient(this.config).waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Transaction failed: ${txHash}`);
    }
  }
}
