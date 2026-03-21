import type { TaskSpec } from "./core/types.js";
import { TrustCommitRuntime } from "./runtime.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
} as const;

const SECRET_ENV_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PRIVATE_KEY",
  "TC_DEPLOYER_PRIVATE_KEY",
  "TC_CREATOR_PRIVATE_KEY",
  "TC_EXECUTOR_PRIVATE_KEY",
  "TC_EXECUTOR_OWNER_PRIVATE_KEY",
  "TC_EXECUTION_WALLET_PRIVATE_KEY",
  "TC_ARBITER_PRIVATE_KEY"
] as const;

export interface RuntimeApiRequest {
  method?: string;
  url?: string;
  body?: unknown;
}

export interface RuntimeApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  payload?: unknown;
}

function jsonResponse(statusCode: number, payload?: unknown): RuntimeApiResponse {
  return {
    statusCode,
    headers: { ...JSON_HEADERS },
    payload
  };
}

function normalizePath(urlValue = "/"): { pathname: string; searchParams: URLSearchParams } {
  const url = new URL(urlValue, "http://127.0.0.1");
  const pathname =
    url.pathname === "/api"
      ? "/"
      : url.pathname.startsWith("/api/")
        ? url.pathname.slice(4)
        : url.pathname;

  return {
    pathname,
    searchParams: url.searchParams
  };
}

function normalizeBody(body: unknown): Record<string, unknown> {
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    if (!body.trim()) {
      return {};
    }
    return JSON.parse(body) as Record<string, unknown>;
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  throw new Error("Request body must be a JSON object.");
}

function parseTaskSpec(body: Record<string, unknown>): TaskSpec {
  if (typeof body.title !== "string" || typeof body.instructions !== "string") {
    throw new Error("title and instructions are required");
  }

  const outputSchema =
    typeof body.outputSchema === "object" && body.outputSchema
      ? (body.outputSchema as Record<string, string>)
      : {
          taskTitle: "string",
          summary: "string",
          inspectedFiles: "string[]",
          notes: "string[]"
        };

  return {
    title: body.title,
    instructions: body.instructions,
    outputSchema,
    reward: Number(body.reward ?? 10_000_000),
    requiredStake: Number(body.requiredStake ?? 500_000_000),
    deadlineHours: Number(body.deadlineHours ?? 24),
    commitmentProfile: typeof body.commitmentProfile === "string" ? body.commitmentProfile : null,
    evidencePolicy:
      typeof body.evidencePolicy === "object" && body.evidencePolicy
        ? {
            requiredPaths: Array.isArray((body.evidencePolicy as { requiredPaths?: unknown }).requiredPaths)
              ? ((body.evidencePolicy as { requiredPaths: unknown[] }).requiredPaths.filter(
                  (entry): entry is string => typeof entry === "string"
                ))
              : [],
            rationale: Array.isArray((body.evidencePolicy as { rationale?: unknown }).rationale)
              ? ((body.evidencePolicy as { rationale: unknown[] }).rationale.filter(
                  (entry): entry is string => typeof entry === "string"
                ))
              : []
          }
        : null
  };
}

function routeTaskId(pathname: string): string | null {
  const match = /^\/tasks\/([^/]+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function routeTaskAction(pathname: string, action: string): string | null {
  const match = new RegExp(`^/tasks/([^/]+)/${action}$`).exec(pathname);
  return match?.[1] ?? null;
}

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const envName of SECRET_ENV_NAMES) {
    const secret = process.env[envName];
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized.slice(0, 240);
}

export async function handleRuntimeApiRequest(
  runtime: TrustCommitRuntime,
  request: RuntimeApiRequest
): Promise<RuntimeApiResponse> {
  try {
    const method = request.method ?? "GET";
    const { pathname, searchParams } = normalizePath(request.url);

    if (method === "OPTIONS") {
      return jsonResponse(204);
    }

    const body = method === "GET" ? {} : normalizeBody(request.body);

    if (method === "GET" && pathname === "/health") {
      const health = await runtime.getProviderHealth(searchParams.get("refresh") === "1");
      return jsonResponse(200, {
        ok: true,
        chainId: runtime.config.chainId ?? null,
        rpcUrl: runtime.config.rpcUrl,
        providers: health
      });
    }

    if (method === "GET" && pathname === "/agent/manifest") {
      return jsonResponse(200, {
        ok: true,
        manifest: runtime.getAgentManifest()
      });
    }

    if (method === "GET" && pathname === "/tasks") {
      return jsonResponse(200, {
        ok: true,
        tasks: runtime.listTasks()
      });
    }

    const taskId = routeTaskId(pathname);
    if (method === "GET" && taskId) {
      const details = runtime.getTaskDetails(taskId);
      if (!details) {
        return jsonResponse(404, { ok: false, error: "Task not found" });
      }
      return jsonResponse(200, { ok: true, ...details });
    }

    if (method === "POST" && pathname === "/tasks") {
      const task = await runtime.createTask(parseTaskSpec(body));
      return jsonResponse(201, { ok: true, task });
    }

    const runTaskId = routeTaskAction(pathname, "run");
    if (method === "POST" && runTaskId) {
      const task = await runtime.runTask(runTaskId);
      return jsonResponse(200, { ok: true, task });
    }

    const verifyTaskId = routeTaskAction(pathname, "verify");
    if (method === "GET" && verifyTaskId) {
      const report = await runtime.verifyTask(verifyTaskId);
      return jsonResponse(200, { ok: true, report });
    }

    const exportTaskId = routeTaskAction(pathname, "export");
    if (method === "POST" && exportTaskId) {
      const out = typeof body.out === "string" ? body.out : undefined;
      const result = await runtime.exportTaskBundle(exportTaskId, out);
      return jsonResponse(200, { ok: true, result });
    }

    const finalizeTaskId = routeTaskAction(pathname, "finalize");
    if (method === "POST" && finalizeTaskId) {
      const task = await runtime.finalizeTask(finalizeTaskId);
      return jsonResponse(200, { ok: true, task });
    }

    const disputeTaskId = routeTaskAction(pathname, "dispute");
    if (method === "POST" && disputeTaskId) {
      const reason = typeof body.reason === "string" ? body.reason : "";
      if (!reason) {
        throw new Error("reason is required");
      }
      const task = await runtime.disputeTask(disputeTaskId, reason);
      return jsonResponse(200, { ok: true, task });
    }

    const arbiterTaskId = routeTaskAction(pathname, "arbiter");
    if (method === "POST" && arbiterTaskId) {
      if (body.mode === "auto") {
        const task = await runtime.arbiterAutoReview(arbiterTaskId);
        return jsonResponse(200, { ok: true, task });
      }

      const winner = body.winner === "creator" ? "creator" : body.winner === "executor" ? "executor" : null;
      const reason = typeof body.reason === "string" ? body.reason : "";
      if (!winner || !reason) {
        throw new Error("winner and reason are required");
      }
      const task = await runtime.arbiterReview(arbiterTaskId, winner, reason);
      return jsonResponse(200, { ok: true, task });
    }

    return jsonResponse(404, { ok: false, error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? sanitizeErrorMessage(error.message) : "Unknown error";
    return jsonResponse(400, { ok: false, error: message });
  }
}
