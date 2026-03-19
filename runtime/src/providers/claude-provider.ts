import Anthropic from "@anthropic-ai/sdk";
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
    throw new Error("Provider did not return JSON");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

export class ClaudeProvider implements ModelProvider {
  public readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model: string;

  public constructor(apiKey: string, model = process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  public async generateTaskPlan(input: TaskSpec, context: ProviderContext): Promise<ModelResult<GeneratedTaskPlan>> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: context.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nInput:\n${JSON.stringify(input, null, 2)}`
        }
      ]
    });
    const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(text) as unknown as GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<ExecutionPlan>> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1536,
      system: context.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
        }
      ]
    });
    const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(text) as unknown as ExecutionPlan
    };
  }

  public async generateArtifact(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Record<string, unknown>>> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1536,
      system: context.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
        }
      ]
    });
    const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(text)
    };
  }

  public async generateArbiterDecision(
    task: TaskRecord,
    reviewContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">>> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1536,
      system: context.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nReview context:\n${JSON.stringify(reviewContext, null, 2)}`
        }
      ]
    });
    const text = response.content.map((entry) => ("text" in entry ? entry.text : "")).join("\n");
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(text) as unknown as Omit<ArbiterDecision, "taskId" | "createdAt" | "reviewMode">
    };
  }
}
