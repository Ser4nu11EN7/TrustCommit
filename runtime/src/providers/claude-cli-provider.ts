import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  ArbiterDecision,
  ExecutionPlan,
  GeneratedTaskPlan,
  ModelProvider,
  ModelResult,
  ProviderContext,
  TaskRecord,
  TaskSpec
} from "../core/types.js";

function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude CLI did not return JSON");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function findExecutableOnPath(candidates: string[]): string | null {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(entry, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

export function resolveClaudeCliPath(): string | null {
  if (process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)) {
    return process.env.CLAUDE_CLI_PATH;
  }

  const homeCandidate =
    process.platform === "win32"
      ? path.join(os.homedir(), ".bun", "bin", "claude.exe")
      : path.join(os.homedir(), ".bun", "bin", "claude");

  if (fs.existsSync(homeCandidate)) {
    return homeCandidate;
  }

  return process.platform === "win32"
    ? findExecutableOnPath(["claude.exe", "claude.cmd", "claude.bat", "claude"])
    : findExecutableOnPath(["claude"]);
}

export class ClaudeCliProvider implements ModelProvider {
  public readonly name = "claude";
  private readonly timeoutMs: number;

  public constructor(
    private readonly executablePath: string,
    private readonly model = process.env.CLAUDE_CLI_MODEL ?? "default"
  ) {
    this.timeoutMs = Number(process.env.CLAUDE_CLI_TIMEOUT_MS ?? 120_000);
  }

  public async healthCheck(): Promise<void> {
    const text = await this.runPrompt("You return JSON only.", 'Return JSON only: {"ok":true}');
    extractJsonObject(text);
  }

  public async generateTaskPlan(input: TaskSpec, context: ProviderContext): Promise<ModelResult<GeneratedTaskPlan>> {
    const text = await this.runPrompt(
      context.systemPrompt,
      `${context.userPrompt}\n\nReturn JSON only.\n\nInput:\n${JSON.stringify(input, null, 2)}`
    );

    return {
      provider: this.name,
      model: `claude-cli:${this.model}`,
      value: extractJsonObject(text) as unknown as GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<ExecutionPlan>> {
    const text = await this.runPrompt(
      context.systemPrompt,
      `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
    );

    return {
      provider: this.name,
      model: `claude-cli:${this.model}`,
      value: extractJsonObject(text) as unknown as ExecutionPlan
    };
  }

  public async generateArtifact(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Record<string, unknown>>> {
    const text = await this.runPrompt(
      context.systemPrompt,
      `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
    );

    return {
      provider: this.name,
      model: `claude-cli:${this.model}`,
      value: extractJsonObject(text)
    };
  }

  public async generateArbiterDecision(
    task: TaskRecord,
    reviewContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">>> {
    const text = await this.runPrompt(
      context.systemPrompt,
      `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nReview context:\n${JSON.stringify(reviewContext, null, 2)}`
    );

    return {
      provider: this.name,
      model: `claude-cli:${this.model}`,
      value: extractJsonObject(text) as unknown as Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">
    };
  }

  private async runPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
    const { stdout, stderr, exitCode, timedOut } = await this.runCommand([
      "--print",
      "--system-prompt",
      systemPrompt,
      userPrompt
    ]);

    const output = stdout.trim();
    if (timedOut) {
      throw new Error("Claude CLI timed out");
    }
    if (exitCode !== 0 || !output) {
      throw new Error(stderr.trim() || `Claude CLI failed with exit code ${exitCode ?? "unknown"}`);
    }
    return output;
  }

  private async runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(this.executablePath, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.once("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.once("close", (exitCode) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode, timedOut });
      });
    });
  }
}
