import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  toBytes
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  AccountConfig,
  OnchainAgentAuthority,
  OnchainSubmissionBinding,
  RuntimeConfig,
  SignatureRecord,
  TaskRecord
} from "../core/types.js";
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
  executorOwner: {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
  },
  executionWallet: {
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
  },
  executor: {
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
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
  const overrides = Object.fromEntries(
    Object.entries(config.accounts ?? {}).filter(([, value]) => value !== undefined)
  ) as Partial<Required<RuntimeConfig>["accounts"]>;
  const merged = {
    ...DEFAULT_ANVIL_ACCOUNTS,
    ...overrides
  };
  return {
    ...merged,
    executor: merged.executionWallet ?? merged.executor
  };
}

function executorOwnerAccount(accounts: Required<RuntimeConfig>["accounts"]): AccountConfig {
  return accounts.executorOwner ?? accounts.executor;
}

function executionWalletAccount(accounts: Required<RuntimeConfig>["accounts"]): AccountConfig {
  return accounts.executionWallet ?? accounts.executor;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

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

    // Use the freshly deployed stack for any bootstrap helper that reads configured addresses.
    this.setConfig({
      ...this.config,
      chainId,
      accounts,
      addresses: {
        token,
        trustRegistry,
        covenant
      }
    });

    await this.writeContractAndConfirm(deployerClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "grantRole",
      args: [COVENANT_ROLE, covenant]
    });

    const creatorClient = getWalletClient(this.config, accounts.creator);
    const executorOwner = executorOwnerAccount(accounts);
    const executionWallet = executionWalletAccount(accounts);
    const executorOwnerClient = getWalletClient(this.config, executorOwner);

    for (const recipient of [accounts.creator.address, executorOwner.address]) {
      await this.writeContractAndConfirm(deployerClient, {
        address: token,
        abi: mockArtifact.abi as readonly unknown[],
        functionName: "mint",
        args: [recipient, 1_000_000_000n]
      });
    }

    const profileHash = keccak256(toBytes("demo-executor"));
    await this.writeContractAndConfirm(executorOwnerClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "registerAgent",
      args: [executorOwner.address, "ipfs://demo-executor", profileHash]
    });
    await this.writeContractAndConfirm(executorOwnerClient, {
      address: token,
      abi: mockArtifact.abi as readonly unknown[],
      functionName: "approve",
      args: [trustRegistry, 1_000_000_000n]
    });
    await this.writeContractAndConfirm(executorOwnerClient, {
      address: trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "stake",
      args: [1n, 1_000_000_000n]
    });
    if (executionWallet.address.toLowerCase() !== executorOwner.address.toLowerCase()) {
      const rotationProof = await this.signExecutionWalletAcceptance(1, executionWallet.address);
      await this.writeContractAndConfirm(executorOwnerClient, {
        address: trustRegistry,
        abi: registryArtifact.abi as readonly unknown[],
        functionName: "updateExecutionWallet",
        args: [1n, executionWallet.address, rotationProof]
      });
    }

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

  public async acceptCovenant(covenantId: `0x${string}`): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    const executionWallet = executionWalletAccount(accounts);
    await this.assertWritableAccount(executionWallet);
    const executor = getWalletClient(this.config, executionWallet);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));

    return this.writeContractAndConfirm(executor, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "acceptCovenant",
      args: [covenantId]
    });
  }

  public async submitCompletion(
    task: TaskRecord,
    receiptHead: `0x${string}`,
    operatorSignature: `0x${string}`
  ): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    const executionWallet = executionWalletAccount(accounts);
    await this.assertWritableAccount(executionWallet);
    const executor = getWalletClient(this.config, executionWallet);
    const addresses = this.requireAddresses();
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));

    const txHash = await this.writeContractAndConfirm(executor, {
      address: addresses.covenant,
      abi: covenantArtifact.abi as readonly unknown[],
      functionName: "submitCompletion",
      args: [task.covenantId, task.proofHash, receiptHead, operatorSignature]
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
    const executorOwner = executorOwnerAccount(accounts);
    const tokenArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("MockERC20.sol", "MockERC20.json"));
    return client.readContract({
      address: addresses.token,
      abi: tokenArtifact.abi as readonly unknown[],
      functionName: "balanceOf",
      args: [executorOwner.address]
    }) as Promise<bigint>;
  }

  public async getSubmissionBinding(covenantId: `0x${string}`): Promise<OnchainSubmissionBinding> {
    const addresses = this.requireAddresses();
    const client = getClient(this.config);
    const covenantArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("Covenant.sol", "Covenant.json"));
    const [proofHash, receiptHead, signer] = await Promise.all([
      client.readContract({
        address: addresses.covenant,
        abi: covenantArtifact.abi as readonly unknown[],
        functionName: "completionProof",
        args: [covenantId]
      }) as Promise<`0x${string}`>,
      client.readContract({
        address: addresses.covenant,
        abi: covenantArtifact.abi as readonly unknown[],
        functionName: "completionReceiptHead",
        args: [covenantId]
      }) as Promise<`0x${string}`>,
      client.readContract({
        address: addresses.covenant,
        abi: covenantArtifact.abi as readonly unknown[],
        functionName: "completionSigner",
        args: [covenantId]
      }) as Promise<`0x${string}`>
    ]);

    return {
      proofHash: proofHash === "0x0000000000000000000000000000000000000000000000000000000000000000" ? null : proofHash,
      receiptHead: receiptHead === "0x0000000000000000000000000000000000000000000000000000000000000000" ? null : receiptHead,
      signer: signer === "0x0000000000000000000000000000000000000000" ? null : signer
    };
  }

  public async getAgentAuthority(agentId: number): Promise<OnchainAgentAuthority> {
    const addresses = this.requireAddresses();
    const client = getClient(this.config);
    const registryArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("TrustRegistry.sol", "TrustRegistry.json"));
    const [owner, agentState] = await Promise.all([
      client.readContract({
        address: addresses.trustRegistry,
        abi: registryArtifact.abi as readonly unknown[],
        functionName: "ownerOf",
        args: [BigInt(agentId)]
      }) as Promise<`0x${string}`>,
      client.readContract({
        address: addresses.trustRegistry,
        abi: registryArtifact.abi as readonly unknown[],
        functionName: "getAgentState",
        args: [BigInt(agentId)]
      }) as Promise<{ executionWallet: `0x${string}` }>
    ]);

    return {
      owner: owner === "0x0000000000000000000000000000000000000000" ? null : owner,
      executionWallet:
        agentState.executionWallet === "0x0000000000000000000000000000000000000000" ? null : agentState.executionWallet
    };
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
  ): Promise<SignatureRecord> {
    const accounts = ensureAccounts(this.config);
    const account =
      role === "executor"
        ? executionWalletAccount(accounts)
        : role === "creator"
          ? accounts.creator
          : role === "arbiter"
            ? accounts.arbiter
            : accounts.deployer;
    await this.assertWritableAccount(account);
    const walletClient = getWalletClient(this.config, account);
    const chainId = Number(await getClient(this.config).getChainId());
    const domain = {
      name: "TrustCommitAttestation",
      version: "1",
      chainId,
      verifyingContract: this.config.addresses?.covenant ?? this.config.addresses?.trustRegistry ?? ZERO_ADDRESS
    } as const;
    const signature = (await (walletClient as any).signTypedData({
      account: account.privateKey ? privateKeyToAccount(account.privateKey) : account.address,
      domain,
      types: {
        TrustCommitAttestation: [
          { name: "purpose", type: "string" },
          { name: "payloadHash", type: "bytes32" }
        ]
      },
      primaryType: "TrustCommitAttestation",
      message: {
        purpose,
        payloadHash
      }
    })) as `0x${string}`;
    return {
      signer: account.address,
      signedAt: Date.now(),
      scheme: "eip712",
      purpose,
      payloadHash,
      signature,
      domain: {
        ...domain,
        primaryType: "TrustCommitAttestation"
      }
    };
  }

  public async signCompletionAttestation(
    task: Pick<TaskRecord, "covenantId" | "taskHash" | "proofHash" | "executorAgentId">,
    receiptHead: `0x${string}`
  ): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    const executionWallet = executionWalletAccount(accounts);
    await this.assertWritableAccount(executionWallet);
    const walletClient = getWalletClient(this.config, executionWallet);
    const chainId = Number(await getClient(this.config).getChainId());
    const addresses = this.requireAddresses();
    return (walletClient as any).signTypedData({
      account: executionWallet.privateKey ? privateKeyToAccount(executionWallet.privateKey) : executionWallet.address,
      domain: {
        name: "TrustCommitCovenant",
        version: "1",
        chainId,
        verifyingContract: addresses.covenant
      },
      types: {
        SubmitCompletion: [
          { name: "covenantId", type: "bytes32" },
          { name: "taskHash", type: "bytes32" },
          { name: "proofHash", type: "bytes32" },
          { name: "receiptHead", type: "bytes32" }
        ]
      },
      primaryType: "SubmitCompletion",
      message: {
        covenantId: task.covenantId,
        taskHash: task.taskHash,
        proofHash: task.proofHash,
        receiptHead
      }
    }) as Promise<`0x${string}`>;
  }

  public async signExecutionWalletAcceptance(agentId: number, newWallet: `0x${string}`): Promise<`0x${string}`> {
    const accounts = ensureAccounts(this.config);
    const executionWallet = executionWalletAccount(accounts);
    await this.assertWritableAccount(executionWallet);
    const walletClient = getWalletClient(this.config, executionWallet);
    const addresses = this.requireAddresses();
    const client = getClient(this.config);
    const chainId = Number(await client.getChainId());
    const registryArtifact = loadContractArtifact(this.config.workspaceRoot, path.join("TrustRegistry.sol", "TrustRegistry.json"));
    const nonce = await client.readContract({
      address: addresses.trustRegistry,
      abi: registryArtifact.abi as readonly unknown[],
      functionName: "executionWalletNonce",
      args: [BigInt(agentId)]
    }) as bigint;
    return (walletClient as any).signTypedData({
      account: executionWallet.privateKey ? privateKeyToAccount(executionWallet.privateKey) : executionWallet.address,
      domain: {
        name: "TrustCommitRegistry",
        version: "1",
        chainId,
        verifyingContract: addresses.trustRegistry
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
        newWallet,
        nonce
      }
    }) as Promise<`0x${string}`>;
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
