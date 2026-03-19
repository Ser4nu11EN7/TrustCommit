import dotenv from "dotenv";
import { createPublicClient, http, keccak256, stringToHex } from "viem";

dotenv.config();

const rpcUrl = process.env.DEPLOY_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.TC_RPC_URL;
if (!rpcUrl) {
  throw new Error("No RPC URL configured. Set DEPLOY_RPC_URL, BASE_SEPOLIA_RPC_URL, or TC_RPC_URL.");
}

const trustRegistry = process.env.TRUST_REGISTRY_ADDRESS as `0x${string}` | undefined;
const covenant = process.env.COVENANT_ADDRESS as `0x${string}` | undefined;
const stakeToken = process.env.STAKE_TOKEN_ADDRESS as `0x${string}` | undefined;
const paymentToken = process.env.PAYMENT_TOKEN_ADDRESS as `0x${string}` | undefined;
const arbiter = process.env.ARBITER_ADDRESS as `0x${string}` | undefined;

for (const [name, value] of Object.entries({
  TRUST_REGISTRY_ADDRESS: trustRegistry,
  COVENANT_ADDRESS: covenant,
  STAKE_TOKEN_ADDRESS: stakeToken,
  PAYMENT_TOKEN_ADDRESS: paymentToken,
  ARBITER_ADDRESS: arbiter
})) {
  if (!value) {
    throw new Error(`${name} is required for deployment verification.`);
  }
}

const registryAbi = [
  {
    type: "function",
    name: "stakeToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }]
  }
] as const;

const covenantAbi = [
  {
    type: "function",
    name: "paymentToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "trustRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "minReward",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }]
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }]
  }
] as const;

const client = createPublicClient({
  transport: http(rpcUrl)
});

const covenantRole = keccak256(stringToHex("COVENANT_ROLE"));
const arbiterRole = keccak256(stringToHex("ARBITER_ROLE"));

const [registryCode, covenantCode, tokenCode] = await Promise.all([
  client.getBytecode({ address: trustRegistry! }),
  client.getBytecode({ address: covenant! }),
  client.getBytecode({ address: stakeToken! })
]);

const [resolvedStakeToken, resolvedPaymentToken, resolvedRegistryAddress, resolvedMinReward, registryHasRole, covenantHasRole] =
  await Promise.all([
    client.readContract({ address: trustRegistry!, abi: registryAbi, functionName: "stakeToken" }),
    client.readContract({ address: covenant!, abi: covenantAbi, functionName: "paymentToken" }),
    client.readContract({ address: covenant!, abi: covenantAbi, functionName: "trustRegistry" }),
    client.readContract({ address: covenant!, abi: covenantAbi, functionName: "minReward" }),
    client.readContract({ address: trustRegistry!, abi: registryAbi, functionName: "hasRole", args: [covenantRole, covenant!] }),
    client.readContract({ address: covenant!, abi: covenantAbi, functionName: "hasRole", args: [arbiterRole, arbiter!] })
  ]);

const report = {
  ok:
    !!registryCode &&
    !!covenantCode &&
    !!tokenCode &&
    resolvedStakeToken.toLowerCase() === stakeToken!.toLowerCase() &&
    resolvedPaymentToken.toLowerCase() === paymentToken!.toLowerCase() &&
    resolvedRegistryAddress.toLowerCase() === trustRegistry!.toLowerCase() &&
    registryHasRole &&
    covenantHasRole,
  rpcUrl,
  contracts: {
    trustRegistry: {
      address: trustRegistry,
      codePresent: !!registryCode,
      stakeToken: resolvedStakeToken
    },
    covenant: {
      address: covenant,
      codePresent: !!covenantCode,
      trustRegistry: resolvedRegistryAddress,
      paymentToken: resolvedPaymentToken,
      minReward: resolvedMinReward.toString()
    },
    stakeToken: {
      address: stakeToken,
      codePresent: !!tokenCode
    },
    paymentToken: {
      address: paymentToken,
      sameAsStakeToken: paymentToken!.toLowerCase() === stakeToken!.toLowerCase()
    }
  },
  roles: {
    covenantHasRegistryRole: registryHasRole,
    arbiterHasRole: covenantHasRole
  }
};

console.log(JSON.stringify(report, null, 2));
