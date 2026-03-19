import fs from "node:fs";
import path from "node:path";
import type { ExecutionEvidence, ExecutionEvidenceFile, TaskRecord } from "../core/types.js";
import { hashText } from "../utils/hash.js";

const SKIP_DIRS = new Set(["node_modules", "out", "lib", "broadcast", "cache", ".trustcommit", ".git", "dist"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".sol", ".json", ".md", ".yaml", ".yml"]);
const PRIORITY_FILES = ["README.md", "package.json", "tsconfig.json"];
const MAX_EVIDENCE_FILES = 6;
const MAX_EXCERPT_CHARS = 240;
const MAX_FILE_BYTES = 32_000;

interface FileCandidate {
  path: string;
  bytes: number;
  score: number;
}

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
    score += 20;
  }
  if (normalized.includes("runtime/")) {
    score += 6;
  }
  if (normalized.includes("contract")) {
    score += 4;
  }
  if (normalized.endsWith(".md")) {
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

export function buildWorkspaceEvidence(task: TaskRecord, workspaceRoot: string): ExecutionEvidence {
  const queryTokens = tokenizeQuery(task);
  const candidates: FileCandidate[] = [];
  walk(workspaceRoot, workspaceRoot, candidates, queryTokens);

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selected = candidates.slice(0, MAX_EVIDENCE_FILES);
  const observedAt = Date.now();

  const files: ExecutionEvidenceFile[] = selected.map((candidate) => {
    const absolutePath = path.join(workspaceRoot, candidate.path);
    const content = fs.readFileSync(absolutePath, "utf8");
    return {
      path: candidate.path,
      contentHash: hashText(content),
      excerpt: cleanExcerpt(content),
      bytes: candidate.bytes,
      observedAt
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
