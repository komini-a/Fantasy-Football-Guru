import "server-only";
import { requiredEnvironmentVariable } from "@/lib/env";

export type JsonGeneration = {
  instructions: string;
  context: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
};

export interface AIService {
  generateJson(request: JsonGeneration): Promise<unknown>;
}

export class AIServiceError extends Error {}

class GeminiService implements AIService {
  async generateJson(request: JsonGeneration): Promise<unknown> {
    try {
      const key = requiredEnvironmentVariable("GEMINI_KEY");
      const model = requiredEnvironmentVariable("GEMINI_MODEL").replace(
        /^models\//,
        "",
      );
      if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid model");
      const timeout = AbortSignal.timeout(45_000);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          cache: "no-store",
          redirect: "error",
          signal: request.signal
            ? AbortSignal.any([request.signal, timeout])
            : timeout,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.instructions }] },
            contents: [{ role: "user", parts: [{ text: request.context }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: request.schema,
              maxOutputTokens: 8192,
            },
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 429)
          throw new AIServiceError("The AI request limit was reached. Please try again later.");
        if (response.status === 401 || response.status === 403)
          throw new AIServiceError("The AI provider denied access. Check the server configuration.");
        throw new Error("Provider unavailable");
      }
      const body = await response.json();
      const candidate = body?.candidates?.[0];
      if (
        candidate?.finishReason !== "STOP" ||
        !Array.isArray(candidate.content?.parts)
      )
        throw new Error("Incomplete response");
      const text = candidate.content.parts
        .filter(
          (part: { text?: unknown; thought?: boolean }) =>
            !part.thought && typeof part.text === "string",
        )
        .map((part: { text: string }) => part.text)
        .join("");
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError(
        "The AI evaluation is unavailable right now. Please try again.",
      );
    }
  }
}

export function getAIService(): AIService {
  return new GeminiService();
}
