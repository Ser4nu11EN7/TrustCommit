import fs from "node:fs";
import path from "node:path";
import type { ExecutionEvidence, ExecutionEvidenceFile, TaskRecord } from "../core/types.js";
import { hashText } from "../utils/hash.js";

const SKIP_DIRS = new Set(["node_modules", "out", "lib", "broadcast", "cache", ".trustcommit", ".git", "dist"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".sol", ".json", ".md", ".yaml", ".yml"]);
const PRIORITY_FILES = ["README.md", "package.json", "tsconfig.json"];
const MAX_EVIDENCE_FILES = 10;
const MAX_EXCERPT_CHARS = 240;
const MAX_FILE_BYTES = 32_000;

interface FileCandidate {
  path: string;
  bytes: number;
  score: number;
}

const PROCUREMENT_REQUIRED_FILES = [
  "demo-fixtures/procurement-brief.md",
  "demo-fixtures/vendor-a.quote.json",
  "demo-fixtures/vendor-b.quote.json",
  "demo-fixtures/vendor-c.quote.json"
] as const;

const REMEDIATION_REQUIRED_FILES = [
  "demo-fixtures/remediation-brief.md",
  "demo-fixtures/patch-plan-a.json",
  "demo-fixtures/patch-plan-b.json"
] as const;

const POLICY_REQUIRED_FILES = [
  "demo-fixtures/policy-brief.md",
  "demo-fixtures/access-request-a.json",
  "demo-fixtures/access-request-b.json"
] as const;

type EvidencePolicy = {
  requiredPaths: string[];
  rationale: string[];
};

function walk(root: string, current: string, acc: FileCandidate[], queryTokens: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(root, path.join(current, entry.name), acc, queryTokens);
      }
      continue;
    }

    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
    const extension = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension) && !PRIORITY_FILES.includes(relativePath)) {
      continue;
    }

    const bytes = fs.statSync(absolutePath).size;
    if (bytes > MAX_FILE_BYTES) {
      continue;
    }

    acc.push({
      path: relativePath,
      bytes,
      score: scoreFile(relativePath, queryTokens)
    });
  }
}

function scoreFile(filePath: string, queryTokens: string[]): number {
  let score = 0;
  const normalized = filePath.toLowerCase();

  if (PRIORITY_FILES.includes(filePath)) {
    score += 2;
  }
  if (normalized.includes("demo-fixtures/")) {
    score += 16;
  }
  if (normalized.includes("runtime/")) {
    score += 6;
  }
  if (normalized.includes("contract")) {
    score += 4;
  }
  for (const token of queryTokens) {
    if (token.length < 3) {
      continue;
    }
    if (normalized.includes(token)) {
      score += 5;
    }
  }

  return score;
}

function tokenizeQuery(task: TaskRecord): string[] {
  return `${task.title} ${task.instructions}`
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter(Boolean);
}

function cleanExcerpt(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_CHARS);
}

function deriveDeterministicEvidence(task: TaskRecord): string[] {
  const titleAndInstructions = `${task.title}\n${task.instructions}`.toLowerCase();
  const outputSchema = JSON.parse(task.outputSchemaJson) as Record<string, string>;
  const schemaKeys = new Set(Object.keys(outputSchema).map((key) => key.toLowerCase()));
  const deterministic: string[] = [];

  const procurementTask =
    schemaKeys.has("selectedvendor") ||
    schemaKeys.has("budgetassessment") ||
    schemaKeys.has("compliancechecks") ||
    /vendor|procurement|quote|budget|retention|sla/.test(titleAndInstructions);
  if (procurementTask) {
    deterministic.push(...PROCUREMENT_REQUIRED_FILES);
  }

  const remediationTask =
    schemaKeys.has("selectedplan") ||
    schemaKeys.has("filestomodify") ||
    schemaKeys.has("acceptancechecks") ||
    /remediation|patch plan|checkout|payments|sanitize|audit logging/.test(titleAndInstructions);
  if (remediationTask) {
    deterministic.push(...REMEDIATION_REQUIRED_FILES);
  }

  const policyTask =
    schemaKeys.has("selectedrequest") ||
    schemaKeys.has("policychecks") ||
    schemaKeys.has("requiredcontrols") ||
    /policy|access request|approval|tenant|pii|region|vendor access/.test(titleAndInstructions);
  if (policyTask) {
    deterministic.push(...POLICY_REQUIRED_FILES);
  }

  return [...new Set(deterministic)];
}

function parseEvidencePolicy(task: TaskRecord): EvidencePolicy | null {
  if (!task.evidencePolicyJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(task.evidencePolicyJson) as Partial<EvidencePolicy>;
    const requiredPaths = Array.isArray(parsed.requiredPaths)
      ? [...new Set(parsed.requiredPaths.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim().replaceAll("\\", "/")))]
      : [];
    const rationale = Array.isArray(parsed.rationale)
      ? [...new Set(parsed.rationale.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))]
      : [];

    if (requiredPaths.length === 0 && rationale.length === 0) {
      return null;
    }

    return { requiredPaths, rationale };
  } catch {
    return null;
  }
}

function exportSnapshot(
  workspaceRoot: string,
  relativePath: string,
  content: string,
  snapshotDir?: string
): string | null {
  if (!snapshotDir) {
    return null;
  }
  const normalized = relativePath.replaceAll("\\", "/");
  const targetPath = path.join(snapshotDir, normalized);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
  return path.relative(workspaceRoot, targetPath).replaceAll("\\", "/");
}

export function buildWorkspaceEvidence(task: TaskRecord, workspaceRoot: string, snapshotDir?: string): ExecutionEvidence {
  const queryTokens = tokenizeQuery(task);
  const candidates: FileCandidate[] = [];
  walk(workspaceRoot, workspaceRoot, candidates, queryTokens);

  const candidateMap = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const explicitPolicy = parseEvidencePolicy(task);
  const policyPaths = explicitPolicy?.requiredPaths.filter((filePath) => candidateMap.has(filePath)) ?? [];
  const deterministicPaths = deriveDeterministicEvidence(task).filter((filePath) => candidateMap.has(filePath));
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selectedPaths = new Set<string>([...policyPaths, ...deterministicPaths]);
  for (const candidate of candidates) {
    if (selectedPaths.size >= MAX_EVIDENCE_FILES) {
      break;
    }
    selectedPaths.add(candidate.path);
  }
  const selected = [...selectedPaths]
    .map((filePath) => candidateMap.get(filePath))
    .filter((candidate): candidate is FileCandidate => candidate !== undefined)
    .sort((a, b) => {
      const aPolicy = policyPaths.includes(a.path);
      const bPolicy = policyPaths.includes(b.path);
      if (aPolicy !== bPolicy) {
        return aPolicy ? -1 : 1;
      }
      if (aPolicy && bPolicy) {
        return policyPaths.indexOf(a.path) - policyPaths.indexOf(b.path);
      }
      const aDeterministic = deterministicPaths.includes(a.path);
      const bDeterministic = deterministicPaths.includes(b.path);
      if (aDeterministic !== bDeterministic) {
        return aDeterministic ? -1 : 1;
      }
      if (aDeterministic && bDeterministic) {
        return deterministicPaths.indexOf(a.path) - deterministicPaths.indexOf(b.path);
      }
      return b.score - a.score || a.path.localeCompare(b.path);
    })
    .slice(0, MAX_EVIDENCE_FILES);
  const observedAt = Date.now();

  const files: ExecutionEvidenceFile[] = selected.map((candidate) => {
    const absolutePath = path.join(workspaceRoot, candidate.path);
    const content = fs.readFileSync(absolutePath, "utf8");
    return {
      path: candidate.path,
      contentHash: hashText(content),
      excerpt: cleanExcerpt(content),
      bytes: candidate.bytes,
      observedAt,
      snapshotPath: exportSnapshot(workspaceRoot, candidate.path, content, snapshotDir)
    };
  });

  return {
    schemaVersion: "v1",
    taskId: task.id,
    workspaceRoot,
    observedAt,
    topFiles: candidates.slice(0, 20).map((candidate) => candidate.path),
    fileCount: candidates.length,
    files
  };
}
