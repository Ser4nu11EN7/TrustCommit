import type {
  ArbiterDecision,
  ExecutionPlan,
  ModelProvider,
  ProviderContext,
  ProviderHealthStatus,
  ProviderName,
  TaskRecord,
  TaskSpec
} from "../core/types.js";
import { ClaudeProvider } from "./claude-provider.js";
import { ClaudeCliProvider, resolveClaudeCliPath } from "./claude-cli-provider.js";
import { MockProvider } from "./mock-provider.js";
import { OpenAiProvider } from "./openai-provider.js";

interface ProviderBinding {
  requested: ProviderName;
  provider: ModelProvider | null;
  transport: ProviderHealthStatus["transport"];
  configured: boolean;
  reason: string | null;
}

type ProviderMap = Partial<Record<ProviderName, ModelProvider>>;
interface RouterOptions {
  enableClaudeCli?: boolean;
}

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

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

function buildBinding(name: ProviderName, overrides: ProviderMap, options: RouterOptions): ProviderBinding {
  const override = overrides[name];
  if (override) {
    return {
      requested: name,
      provider: override,
      transport: name === "mock" ? "mock" : "api",
      configured: true,
      reason: null
    };
  }

  if (name === "mock") {
    return {
      requested: name,
      provider: new MockProvider(),
      transport: "mock",
      configured: true,
      reason: null
    };
  }

  if (name === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      return {
        requested: name,
        provider: null,
        transport: "unconfigured",
        configured: false,
        reason: "OPENAI_API_KEY is not set"
      };
    }
    return {
      requested: name,
      provider: new OpenAiProvider(process.env.OPENAI_API_KEY),
      transport: "api",
      configured: true,
      reason: null
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      requested: name,
      provider: new ClaudeProvider(process.env.ANTHROPIC_API_KEY),
      transport: "api",
      configured: true,
      reason: null
    };
  }

  const cliPath = options.enableClaudeCli === false ? null : resolveClaudeCliPath();
  if (cliPath) {
    return {
      requested: name,
      provider: new ClaudeCliProvider(cliPath),
      transport: "cli",
      configured: true,
      reason: null
    };
  }

  return {
    requested: name,
    provider: null,
    transport: "unconfigured",
    configured: false,
    reason: "ANTHROPIC_API_KEY is not set and Claude CLI was not found"
  };
}

export class ProviderRouter {
  private readonly primary: ProviderBinding;
  private readonly fallback: ProviderBinding;
  private readonly bindings: Record<ProviderName, ProviderBinding>;
  private readonly healthCache = new Map<ProviderName, ProviderHealthStatus>();

  public constructor(
    primary: "openai" | "mock",
    fallback: "claude" | "mock",
    overrides: ProviderMap = {},
    private readonly now: () => number = () => Date.now(),
    options: RouterOptions = {}
  ) {
    this.bindings = {
      openai: buildBinding("openai", overrides, options),
      claude: buildBinding("claude", overrides, options),
      mock: buildBinding("mock", overrides, options)
    };
    this.primary = this.bindings[primary];
    this.fallback = this.bindings[fallback];
  }

  public async generateTaskPlan(task: TaskSpec, context: ProviderContext) {
    return this.withFallback((provider) => provider.generateTaskPlan(task, context));
  }

  public async generateExecutionPlan(task: TaskRecord, repoContext: Record<string, unknown>, context: ProviderContext) {
    return this.withFallback((provider) => provider.generateExecutionPlan(task, repoContext, context));
  }

  public async generateArtifact(task: TaskRecord, repoContext: Record<string, unknown>, context: ProviderContext) {
    return this.withFallback((provider) => provider.generateArtifact(task, repoContext, context));
  }

  public async generateArbiterDecision(task: TaskRecord, reviewContext: Record<string, unknown>, context: ProviderContext) {
    return this.withFallback((provider) => {
      if (!provider.generateArbiterDecision) {
        throw new Error(`${provider.name} does not support arbiter decisions`);
      }
      return provider.generateArbiterDecision(task, reviewContext, context);
    }) as Promise<{
      provider: string;
      model: string;
      value: Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">;
    }>;
  }

  public async getHealth(forceRefresh = false): Promise<Record<ProviderName, ProviderHealthStatus>> {
    return {
      openai: await this.checkProvider("openai", forceRefresh),
      claude: await this.checkProvider("claude", forceRefresh),
      mock: await this.checkProvider("mock", forceRefresh)
    };
  }

  private async withFallback<T>(runner: (provider: ModelProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const binding of [this.primary, this.fallback]) {
      if (!binding.provider) {
        errors.push(`${binding.requested}: ${binding.reason ?? "not configured"}`);
        continue;
      }

      try {
        return await runner(binding.provider);
      } catch (error) {
        errors.push(`${binding.requested}: ${sanitizeErrorMessage(this.getErrorMessage(error))}`);
      }
    }

    throw new Error(`No provider succeeded. ${errors.join(" | ")}`);
  }

  private async checkProvider(name: ProviderName, forceRefresh: boolean): Promise<ProviderHealthStatus> {
    const binding = this.bindings[name];
    if (!binding.provider) {
      return {
        provider: name,
        transport: "unconfigured",
        configured: false,
        healthy: false,
        checkedAt: null,
        source: "static",
        error: binding.reason
      };
    }

    const cached = this.healthCache.get(name);
    if (!forceRefresh && cached && cached.checkedAt && this.now() - cached.checkedAt < HEALTH_CACHE_TTL_MS) {
      return {
        ...cached,
        source: "cache"
      };
    }

    if (!forceRefresh) {
      return {
        provider: name,
        transport: binding.transport,
        configured: binding.configured,
        healthy: name === "mock" ? true : binding.configured,
        checkedAt: null,
        source: "static",
        error: binding.reason
      };
    }

    if (name === "mock") {
      const status: ProviderHealthStatus = {
        provider: name,
        transport: "mock",
        configured: true,
        healthy: true,
        checkedAt: this.now(),
        source: "live",
        error: null
      };
      this.healthCache.set(name, status);
      return status;
    }

    try {
      if (binding.provider.healthCheck) {
        await binding.provider.healthCheck();
      } else {
        await binding.provider.generateTaskPlan(
          {
            title: "health-check",
            instructions: "Return a tiny JSON task plan.",
            outputSchema: { ok: "boolean" },
            reward: 1_000_000,
            requiredStake: 1_000_000,
            deadlineHours: 1
          },
          {
            systemPrompt: "You are performing a provider health check for TrustCommit. Return valid JSON only.",
            userPrompt: "Respond with a valid structured task plan."
          }
        );
      }
      const status: ProviderHealthStatus = {
        provider: name,
        transport: binding.transport,
        configured: true,
        healthy: true,
        checkedAt: this.now(),
        source: "live",
        error: null
      };
      this.healthCache.set(name, status);
      return status;
    } catch (error) {
      const status: ProviderHealthStatus = {
        provider: name,
        transport: binding.transport,
        configured: true,
        healthy: false,
        checkedAt: this.now(),
        source: "live",
        error: sanitizeErrorMessage(this.getErrorMessage(error))
      };
      this.healthCache.set(name, status);
      return status;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
