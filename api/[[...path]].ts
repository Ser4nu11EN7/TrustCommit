import { handleRuntimeApiRequest, sanitizeErrorMessage } from "../runtime/src/http-handler.js";
import { TrustCommitRuntime } from "../runtime/src/runtime.js";

type VercelLikeRequest = {
  method?: string;
  url?: string;
  body?: unknown;
};

type VercelLikeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelLikeResponse;
  json(payload: unknown): void;
  end(body?: string): void;
};

let runtimePromise: Promise<TrustCommitRuntime> | null = null;

async function getRuntime(): Promise<TrustCommitRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const runtime = new TrustCommitRuntime(process.cwd());
      await runtime.init();
      return runtime;
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }

  return runtimePromise;
}

export default async function handler(request: VercelLikeRequest, response: VercelLikeResponse): Promise<void> {
  try {
    const runtime = await getRuntime();
    const result = await handleRuntimeApiRequest(runtime, {
      method: request.method,
      url: request.url,
      body: request.body
    });

    for (const [name, value] of Object.entries(result.headers)) {
      response.setHeader(name, value);
    }

    response.status(result.statusCode);
    if (typeof result.payload === "undefined") {
      response.end();
      return;
    }

    response.json(result.payload);
  } catch (error) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.status(500).json({
      ok: false,
      error: error instanceof Error ? sanitizeErrorMessage(error.message) : "Unexpected server error"
    });
  }
}
