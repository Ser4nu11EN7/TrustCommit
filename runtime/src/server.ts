import http from "node:http";
import type { AddressInfo } from "node:net";
import { handleRuntimeApiRequest } from "./http-handler.js";
import { TrustCommitRuntime } from "./runtime.js";

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

export async function startHttpServer(port = Number(process.env.PORT ?? 3000), host = "127.0.0.1") {
  const runtime = new TrustCommitRuntime();
  await runtime.init();

  const server = http.createServer(async (request, response) => {
    const body = request.method === "POST" ? await readJsonBody(request) : undefined;
    const result = await handleRuntimeApiRequest(runtime, {
      method: request.method,
      url: request.url ?? `http://${host}:${port}/`,
      body
    });

    response.writeHead(result.statusCode, result.headers);
    if (typeof result.payload === "undefined") {
      response.end();
      return;
    }

    response.end(JSON.stringify(result.payload, null, 2));
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
