import test from "node:test";
import assert from "node:assert/strict";
import type { ExecutionPlan, GeneratedTaskPlan, ModelProvider, ProviderContext, TaskRecord, TaskSpec } from "../src/core/types.js";
import { ProviderRouter } from "../src/providers/router.js";

class FakeProvider implements ModelProvider {
  public constructor(
    public readonly name: "openai" | "claude" | "mock",
    private readonly behavior: "success" | "fail"
  ) {}

  public async generateTaskPlan(input: TaskSpec, _context: ProviderContext) {
    if (this.behavior === "fail") {
      throw new Error(`${this.name} failed`);
    }
    return {
      provider: this.name,
      model: `${this.name}-test`,
      value: {
        ...input,
        title: input.title || "ok"
      } satisfies GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(_task: TaskRecord, repoContext: Record<string, unknown>, _context: ProviderContext) {
    if (this.behavior === "fail") {
      throw new Error(`${this.name} failed`);
    }
    return {
      provider: this.name,
      model: `${this.name}-test`,
      value: {
        summary: "Grounded execution plan",
        steps: ["inspect", "generate", "verify"],
        successCriteria: ["schema present"],
        evidenceFocus: Array.isArray(repoContext.topFiles) ? (repoContext.topFiles as string[]).slice(0, 2) : [],
        maxAttempts: 2
      } satisfies ExecutionPlan
    };
  }

  public async generateArtifact(task: TaskRecord, _repoContext: Record<string, unknown>, _context: ProviderContext) {
    if (this.behavior === "fail") {
      throw new Error(`${this.name} failed`);
    }
    return {
      provider: this.name,
      model: `${this.name}-test`,
      value: {
        taskTitle: task.title
      }
    };
  }
}

class CountingProvider extends FakeProvider {
  public checks = 0;

  public override async generateTaskPlan(input: TaskSpec, context: ProviderContext) {
    this.checks += 1;
    return super.generateTaskPlan(input, context);
  }
}

const sampleTask: TaskSpec = {
  title: "Test task",
  instructions: "Do work",
  outputSchema: { summary: "string" },
  reward: 1,
  requiredStake: 1,
  deadlineHours: 1
};

const sampleRecord: TaskRecord = {
  id: "task-1",
  title: "Test task",
  instructions: "Do work",
  outputSchemaJson: JSON.stringify({ summary: "string" }),
  reward: 1,
  requiredStake: 1,
  deadlineTs: 1,
  status: "created",
  covenantId: null,
  executorAgentId: 1,
  createdBy: "test",
  proofHash: null,
  taskHash: null,
  artifactPath: null,
  createdAt: 1,
  updatedAt: 1
};

test("provider router falls back when primary throws", async () => {
  const router = new ProviderRouter("openai", "claude", {
    openai: new FakeProvider("openai", "fail"),
    claude: new FakeProvider("claude", "success")
  });

  const result = await router.generateTaskPlan(sampleTask, {
    systemPrompt: "test",
    userPrompt: "test"
  });

  assert.equal(result.provider, "claude");
});

test("provider router reports missing env providers as unconfigured", async () => {
  const router = new ProviderRouter("openai", "mock", {
    mock: new FakeProvider("mock", "success")
  }, () => Date.now(), { enableClaudeCli: false });

  const health = await router.getHealth(true);

  assert.equal(health.openai.configured, false);
  assert.equal(health.claude.configured, false);
  assert.equal(health.mock.healthy, true);
});

test("provider router health uses cache between checks", async () => {
  const openai = new CountingProvider("openai", "success");
  const router = new ProviderRouter(
    "openai",
    "mock",
    {
      openai,
      mock: new FakeProvider("mock", "success")
    },
    () => 1000,
    { enableClaudeCli: false }
  );

  const first = await router.getHealth(true);
  const second = await router.getHealth(false);

  assert.equal(first.openai.healthy, true);
  assert.equal(second.openai.source, "cache");
  assert.equal(openai.checks, 1);
});

test("provider router returns static health without probing when refresh is false", async () => {
  const openai = new CountingProvider("openai", "success");
  const router = new ProviderRouter(
    "openai",
    "mock",
    {
      openai,
      mock: new FakeProvider("mock", "success")
    },
    () => 1000,
    { enableClaudeCli: false }
  );

  const health = await router.getHealth(false);

  assert.equal(health.openai.source, "static");
  assert.equal(health.openai.healthy, true);
  assert.equal(openai.checks, 0);
});

test("provider router falls back for artifact generation too", async () => {
  const router = new ProviderRouter("openai", "claude", {
    openai: new FakeProvider("openai", "fail"),
    claude: new FakeProvider("claude", "success")
  });

  const result = await router.generateArtifact(sampleRecord, { topFiles: ["README.md"] }, {
    systemPrompt: "test",
    userPrompt: "test"
  });

  assert.equal(result.provider, "claude");
});
