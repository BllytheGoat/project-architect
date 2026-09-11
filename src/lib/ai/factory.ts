// Provider factory. Picks the live provider in prod/dev and the mock for
// tests. Kept isolated so business logic only ever imports getAIProvider().
import { OpenAICompatibleProvider, type AIProvider } from "./provider";
import { MockProvider } from "./mock";

let cached: AIProvider | null = null;

/**
 * Force the deterministic mock provider. Called by the test harness so tests
 * never touch the network.
 */
export function setMockProvider(): void {
  cached = new MockProvider();
}

export function resetProviderCache(): void {
  cached = null;
}

export function getAIProvider(forceMock = false): AIProvider {
  if (forceMock || process.env.AI_PROVIDER === "mock") {
    if (!cached || cached.name !== "mock") cached = new MockProvider();
    return cached;
  }

  if (cached && cached.name === "openai-compatible") return cached;

  const baseUrl = process.env.AI_BASE_URL ?? "https://apihub.agnes-ai.com/v1";
  const apiKey = process.env.AI_API_KEY ?? "";
  // Default matches the validated, live-deployed model. AI_MODEL should be set
  // explicitly in the environment; this fallback is only a safety net.
  const model = process.env.AI_MODEL ?? "agnes-2.5-flash";

  if (!apiKey) {
    // No credentials configured -> degrade to mock so the app still works.
    cached = new MockProvider();
    return cached;
  }

  cached = new OpenAICompatibleProvider({ baseUrl, apiKey, model });
  return cached;
}
