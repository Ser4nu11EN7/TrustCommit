import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "out", "lib", "broadcast", "cache", ".trustcommit", ".git"]);

function walk(root: string, current: string, acc: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(root, path.join(current, entry.name), acc);
      }
      continue;
    }
    acc.push(path.relative(root, path.join(current, entry.name)).replaceAll("\\", "/"));
  }
}

export function buildRepoSnapshot(workspaceRoot: string): Record<string, unknown> {
  const files: string[] = [];
  walk(workspaceRoot, workspaceRoot, files);
  const readmePath = path.join(workspaceRoot, "README.md");
  return {
    topFiles: files.slice(0, 20),
    fileCount: files.length,
    readmePreview: fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8").slice(0, 1200) : ""
  };
}
