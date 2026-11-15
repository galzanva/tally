import { AppError } from "@/lib/errors";
import { forUser } from "@/lib/db";
import { startOfTodayInstant } from "@/lib/dates";

export const AI_CAP_MESSAGE =
  "The AI helper has hit today's limit, so this stays on you for now. Totals, expenses, and exports still work. The limit resets at midnight.";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: unknown;
};

export type ToolCall = { id: string; name: string; arguments: string };

export function llmConfigured() {
  return Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL);
}

export async function tokensUsedToday(userId: string, timeZone: string) {
  const db = forUser(userId);
  const usage = await db.llmUsage.aggregate({
    where: { createdAt: { gte: startOfTodayInstant(timeZone) } },
    _sum: { promptTokens: true, completionTokens: true },
  });
  return (usage._sum.promptTokens ?? 0) + (usage._sum.completionTokens ?? 0);
}

export async function chat(options: {
  userId: string;
  timeZone: string;
  cap: number;
  feature: string;
  messages: ChatMessage[];
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  json?: boolean;
}) {
  if (!llmConfigured()) {
    throw new AppError(503, "ai_unconfigured", "The AI helper isn't configured yet. Totals and expenses still work.");
  }
  const used = await tokensUsedToday(options.userId, options.timeZone);
  if (used >= options.cap) throw new AppError(429, "ai_cap", AI_CAP_MESSAGE);

  const base = process.env.LLM_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      temperature: 0.2,
      messages: options.messages,
      tools: options.tools?.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      response_format: options.json ? { type: "json_object" } : undefined,
    }),
  });
  if (!response.ok) {
    throw new AppError(502, "ai_unavailable", "The AI helper didn't answer. Your numbers are still here.");
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const promptTokens = body.usage?.prompt_tokens ?? 0;
  const completionTokens = body.usage?.completion_tokens ?? 0;
  const db = forUser(options.userId);
  await db.llmUsage.create({
    data: {
      feature: options.feature,
      model: process.env.LLM_MODEL!,
      promptTokens,
      completionTokens,
    },
  });
  const message = body.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
  return {
    content: message?.content ?? null,
    toolCalls,
    promptTokens,
    completionTokens,
    rawMessage: { content: message?.content ?? null, tool_calls: message?.tool_calls ?? [] },
  };
}
