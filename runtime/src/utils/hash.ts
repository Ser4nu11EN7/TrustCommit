import { keccak256, toBytes } from "viem";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, inner]) => [key, sortValue(inner)]));
  }
  return value;
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function hashText(value: string): `0x${string}` {
  return keccak256(toBytes(value));
}

export function hashJson(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalizeJson(value)));
}
