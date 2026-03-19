import http from "node:http";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";
import type { TaskSpec } from "./core/types.js";
import { TrustCommitRuntime } from "./runtime.js";

function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const envName of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
    const secret = process.env[envName];
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized.slice(0, 240);
}

function jsonResponse(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseTaskSpec(body: Record<string, unknown>): TaskSpec {
  if (typeof body.title !== "string" || typeof body.instructions !== "string") {
    throw new Error("title and instructions are required");
  }

  const outputSchema = typeof body.outputSchema === "object" && body.outputSchema ? (body.outputSchema as Record<string, string>) : {
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
    deadlineHours: Number(body.deadlineHours ?? 24)
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

export async function startHttpServer(port = Number(process.env.PORT ?? 3000), host = "127.0.0.1") {
  const runtime = new TrustCommitRuntime();
  await runtime.init();

  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);

      if (method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        });
        response.end();
        return;
      }

      if (method === "GET" && url.pathname === "/health") {
        const health = await runtime.getProviderHealth(url.searchParams.get("refresh") === "1");
        jsonResponse(response, 200, {
          ok: true,
          chainId: runtime.config.chainId ?? null,
          rpcUrl: runtime.config.rpcUrl,
          providers: health
        });
        return;
      }

      if (method === "GET" && url.pathname === "/agent/manifest") {
        jsonResponse(response, 200, {
          ok: true,
          manifest: runtime.getAgentManifest()
        });
        return;
      }

      if (method === "GET" && url.pathname === "/tasks") {
        jsonResponse(response, 200, {
          ok: true,
          tasks: runtime.listTasks()
        });
        return;
      }

      const taskId = routeTaskId(url.pathname);
      if (method === "GET" && taskId) {
        const details = runtime.getTaskDetails(taskId);
        if (!details) {
          jsonResponse(response, 404, { ok: false, error: "Task not found" });
          return;
        }
        jsonResponse(response, 200, { ok: true, ...details });
        return;
      }

      if (method === "POST" && url.pathname === "/tasks") {
        const body = await readJsonBody(request);
        const task = await runtime.createTask(parseTaskSpec(body));
        jsonResponse(response, 201, { ok: true, task });
        return;
      }

      const runTaskId = routeTaskAction(url.pathname, "run");
      if (method === "POST" && runTaskId) {
        const task = await runtime.runTask(runTaskId);
        jsonResponse(response, 200, { ok: true, task });
        return;
      }

      const finalizeTaskId = routeTaskAction(url.pathname, "finalize");
      if (method === "POST" && finalizeTaskId) {
        const task = await runtime.finalizeTask(finalizeTaskId);
        jsonResponse(response, 200, { ok: true, task });
        return;
      }

      const disputeTaskId = routeTaskAction(url.pathname, "dispute");
      if (method === "POST" && disputeTaskId) {
        const body = await readJsonBody(request);
        const reason = typeof body.reason === "string" ? body.reason : "";
        if (!reason) {
          throw new Error("reason is required");
        }
        const task = await runtime.disputeTask(disputeTaskId, reason);
        jsonResponse(response, 200, { ok: true, task });
        return;
      }

      const arbiterTaskId = routeTaskAction(url.pathname, "arbiter");
      if (method === "POST" && arbiterTaskId) {
        const body = await readJsonBody(request);
        const winner = body.winner === "creator" ? "creator" : body.winner === "executor" ? "executor" : null;
        const reason = typeof body.reason === "string" ? body.reason : "";
        if (!winner || !reason) {
          throw new Error("winner and reason are required");
        }
        const task = await runtime.arbiterReview(arbiterTaskId, winner, reason);
        jsonResponse(response, 200, { ok: true, task });
        return;
      }

      jsonResponse(response, 404, { ok: false, error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? sanitizeErrorMessage(error.message) : "Unknown error";
      jsonResponse(response, 400, { ok: false, error: message });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    runtime,
    url: `http://${address.address}:${address.port}`
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const port = Number(process.env.PORT ?? 3000);
  startHttpServer(port).then(({ url }) => {
    console.log(`TrustCommit HTTP API listening on ${url}`);
  });
}
