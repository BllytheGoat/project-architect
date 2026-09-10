// AI provider abstraction. Application logic depends on this interface,
// never on a concrete provider, so the model can be swapped without
// touching business logic. Providers implement generateStructured
// (validated against a caller-supplied Zod schema) plus text helpers.

import { z } from "zod";

export interface AIGenerationOptions {
  /** Stable operation name for logging, e.g. "interview.step". */
  operation?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Extra structured context objects to serialize into the system prompt. */
  context?: unknown;
  signal?: AbortSignal;
  /** Request-scoped id for observability. */
  requestId?: string;
}

export interface AIProvider {
  readonly name: string;
  /** Generate free-form text. */
  generateText(prompt: string, options?: AIGenerationOptions): Promise<string>;
  /**
   * Generate a JSON object that must validate against `schema`.
   * The provider is responsible for retrying malformed output up to
   * `maxRetries` times; if it still fails, it throws AIOutputError.
   */
  generateStructured<T extends z.ZodType>(
    prompt: string,
    schema: T,
    options?: AIGenerationOptions & { maxRetries?: number },
  ): Promise<z.infer<T>>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly code: "provider_failure" | "timeout" | "invalid_output" | "auth" | "rate_limit" = "provider_failure",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

/**
 * OpenAI-compatible chat-completions provider. Works with OpenAI,
 * and with any /v1/chat/completions-compatible endpoint (e.g. Agnes).
 * No SDK dependency — plain fetch against the configured base URL.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly cfg: {
      baseUrl: string; // e.g. https://apihub.agnes-ai.com/v1
      apiKey: string;
      model: string;
    },
  ) {}

  private async chat(prompt: string, jsonMode: boolean, options?: AIGenerationOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    if (options?.signal) options.signal.addEventListener("abort", () => controller.abort());

    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? this.cfg.model,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 4096,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: this.systemPrompt(jsonMode, options) },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        throw new AIProviderError("The AI provider timed out.", "timeout");
      }
      throw new AIProviderError("Could not reach the AI provider.", "provider_failure");
    }
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      throw new AIProviderError("AI provider rejected credentials.", "auth");
    }
    if (res.status === 429) {
      throw new AIProviderError("AI provider rate limit reached. Try again shortly.", "rate_limit");
    }
    if (!res.ok) {
      throw new AIProviderError(`AI provider error (${res.status}).`, "provider_failure");
    }

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIProviderError("AI provider returned an empty response.", "provider_failure");
    }
    return content;
  }

  private systemPrompt(jsonMode: boolean, options?: AIGenerationOptions): string {
    const parts = [
      "You are Project Architect's planning engine. You help turn a vague app idea into a clear, structured project specification.",
      "Never invent major product behavior on your own. Distinguish user decisions from technical recommendations. Every question you ask must have a concrete reason.",
      "Output only valid JSON matching the requested schema. No markdown fences, no commentary.",
    ];
    if (options?.context) {
      parts.push(`Current structured context:\n${JSON.stringify(options.context)}`);
    }
    if (jsonMode) parts.push("The response must be a single JSON object.");
    return parts.join("\n\n");
  }

  async generateText(prompt: string, options?: AIGenerationOptions): Promise<string> {
    return this.chat(prompt, false, options);
  }

  async generateStructured<T extends z.ZodType>(
    prompt: string,
    schema: T,
    options?: AIGenerationOptions & { maxRetries?: number },
  ): Promise<z.infer<T>> {
    const maxRetries = options?.maxRetries ?? 2;
    let workingPrompt = prompt;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let raw: string;
      try {
        raw = await this.chat(workingPrompt, true, { ...options, temperature: attempt === 0 ? 0.2 : 0 });
      } catch (err) {
        // A transport/auth/rate-limit failure is not "invalid output"; surface it.
        throw err;
      }
      try {
        const parsed = schema.safeParse(extractJson(raw));
        if (parsed.success) return parsed.data as z.infer<T>;
        lastError = new AIProviderError(
          `AI output failed schema validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          "invalid_output",
        );
      } catch {
        lastError = new AIProviderError("AI returned malformed JSON.", "invalid_output");
      }
      if (attempt < maxRetries) {
        workingPrompt = `${prompt}\n\nYour previous response was invalid (${String(lastError).slice(0, 300)}). Respond again with strictly valid JSON matching the schema.`;
      }
    }
    throw lastError instanceof AIProviderError
      ? lastError
      : new AIProviderError("AI returned invalid output.", "invalid_output");
  }
}

/** Strip markdown fences / leading text so JSON can be extracted reliably. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error("No JSON object found in AI response.");
}
