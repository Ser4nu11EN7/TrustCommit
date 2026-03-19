import OpenAI from "openai";
import type {
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

export class OpenAiProvider implements ModelProvider {
  public readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  public constructor(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  public async generateTaskPlan(input: TaskSpec, context: ProviderContext): Promise<ModelResult<GeneratedTaskPlan>> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: context.systemPrompt },
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nInput:\n${JSON.stringify(input, null, 2)}`
        }
      ]
    });
    const parsed = extractJsonObject(completion.choices[0]?.message?.content ?? "");
    return {
      provider: this.name,
      model: this.model,
      value: parsed as unknown as GeneratedTaskPlan
    };
  }

  public async generateExecutionPlan(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<ExecutionPlan>> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: context.systemPrompt },
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
        }
      ]
    });
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(completion.choices[0]?.message?.content ?? "") as unknown as ExecutionPlan
    };
  }

  public async generateArtifact(
    task: TaskRecord,
    repoContext: Record<string, unknown>,
    context: ProviderContext
  ): Promise<ModelResult<Record<string, unknown>>> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: context.systemPrompt },
        {
          role: "user",
          content: `${context.userPrompt}\n\nReturn JSON only.\n\nTask:\n${JSON.stringify(task, null, 2)}\n\nRepo context:\n${JSON.stringify(repoContext, null, 2)}`
        }
      ]
    });
    return {
      provider: this.name,
      model: this.model,
      value: extractJsonObject(completion.choices[0]?.message?.content ?? "")
    };
  }
}
