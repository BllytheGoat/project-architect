// Deterministic mock provider. Used by unit/integration tests and by the
// demo/seed flow so the app works without a live model. Never depends on a
// network call.
//
// It keys off `options.operation`:
//   "idea.analyze"        -> canned IdeaAnalysis derived from the prompt text
//   "interview.next"      -> a canned PlannerResponse (one question + updates)
//   "interview.complete"  -> action=complete
//   "answer.interpret"    -> a PlannerResponse that records the answer

import { z } from "zod";
import type { AIProvider, AIGenerationOptions } from "./provider";
import { ideaAnalysisSchema, plannerResponseSchema } from "@/lib/validation/schemas";
import type { IdeaAnalysis } from "@/types";

function guessFeatureName(text: string): string {
  const t = text.toLowerCase();
  if (/note/.test(t)) return "Note sharing";
  if (/todo|task/.test(t)) return "Task management";
  if (/market|shop|store|buy|sell/.test(t)) return "Listing marketplace";
  if (/file|upload|download/.test(t)) return "File handling";
  if (/chat|message|discuss/.test(t)) return "Discussion";
  return "Core feature";
}

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async generateText(prompt: string): Promise<string> {
    return `[mock] ${prompt.slice(0, 120)}`;
  }

  async generateStructured<T extends z.ZodType>(
    prompt: string,
    schema: T,
    options?: AIGenerationOptions & { maxRetries?: number },
  ): Promise<z.infer<T>> {
    const op = options?.operation ?? "generic";
    const result = this.canned(op, prompt, schema);
    // Return the same object reference; Zod already validated the shape.
    return result as z.infer<T>;
  }

  private canned(op: string, prompt: string, schema: z.ZodType): unknown {
    if (op === "idea.analyze") {
      const idea = prompt.split("Idea: ")[1]?.trim() ?? prompt;
      const analysis: IdeaAnalysis = {
        projectNameSuggestion: "Untitled",
        summary: `A rough idea: ${idea.slice(0, 240)}`,
        problem: "Not yet defined.",
        targetUsers: ["students"],
        initialFeatures: [guessFeatureName(idea), "Accounts"],
        unknowns: ["Who can access content?", "Should content be public or private?"],
      };
      return schema.parse(JSON.parse(JSON.stringify(analysis)));
    }

    if (op === "interview.complete") {
      return schema.parse(
        JSON.parse(
          JSON.stringify({
            message: "All critical unknowns are resolved.",
            action: "complete",
            updates: [],
            recommendations: [],
            conflicts: [],
          }),
        ),
      );
    }

    if (op === "interview.next") {
      const resp = {
        message: "Let's nail down the most important decision first.",
        action: "ask_question",
        question: {
          questionKey: "auth_required",
          type: "single_choice",
          question: "Should users have accounts?",
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
            {
              id: "unsure",
              label: "I'm not sure",
              explanation:
                "Accounts let each user manage their own data and make permissions straightforward. If your app associates content with people, you almost always want them.",
            },
          ],
          priority: "high",
          reason: "Authentication affects data ownership and permissions.",
          category: "security",
          status: "pending",
        },
        updates: [
          {
            op: "upsert_feature",
            feature: {
              id: crypto.randomUUID(),
              name: "Accounts",
              description: "Users can sign up and sign in.",
              priority: "must_have",
              status: "confirmed",
              source: "ai",
            },
          },
        ],
        recommendations: [],
        conflicts: [],
      };
      return schema.parse(JSON.parse(JSON.stringify(resp)));
    }

    if (op === "answer.interpret") {
      // Generic: record the answer as a fact keyed by the question.
      const resp = {
        message: "Got it — recorded.",
        action: "record_information",
        question: undefined,
        updates: [{ op: "set_fact", key: "last_answer", value: prompt.slice(0, 500) }],
        recommendations: [],
        conflicts: [],
      };
      return schema.parse(JSON.parse(JSON.stringify(resp)));
    }

    // Default: complete with no-op.
    return schema.parse(
      JSON.parse(
        JSON.stringify({ message: "No further action.", action: "complete", updates: [], recommendations: [], conflicts: [] }),
      ),
    );
  }
}
