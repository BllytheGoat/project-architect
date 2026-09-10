// Public AI surface for the rest of the app. Business logic imports this,
// never a concrete provider, so the model stays swappable.
export { getAIProvider, setMockProvider, resetProviderCache } from "./factory";
export { OpenAICompatibleProvider, AIProviderError, extractJson } from "./provider";
export type { AIProvider, AIGenerationOptions } from "./provider";
export { MockProvider } from "./mock";
