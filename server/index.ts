import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import type { ErrorRequestHandler } from "express";
import OpenAI from "openai";

dotenv.config();

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatProvider = "openai" | "deepseek" | "gemini";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const defaultProvider = normalizeProvider(process.env.AI_PROVIDER);
const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1";
const deepseekModel = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const geminiBaseUrl =
  process.env.GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: deepseekBaseUrl,
    })
  : null;
const geminiClient = process.env.GEMINI_API_KEY
  ? new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: geminiBaseUrl,
    })
  : null;

const handleJsonParseError: ErrorRequestHandler = (
  error,
  _request,
  response,
  next
) => {
  if ((error as { type?: unknown })?.type === "entity.parse.failed") {
    response.status(400).json({
      code: "invalid_json",
      error: "Request body must be valid JSON.",
    });
    return;
  }

  next(error);
};

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(handleJsonParseError);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    defaultProvider,
    providers: {
      openai: {
        configured: Boolean(openaiClient),
        model: openaiModel,
      },
      deepseek: {
        configured: Boolean(deepseekClient),
        model: deepseekModel,
      },
      gemini: {
        configured: Boolean(geminiClient),
        model: geminiModel,
      },
    },
  });
});

app.post("/api/chat", async (request, response) => {
  const provider = normalizeProvider(request.body?.provider);
  const messages = normalizeMessages(request.body?.messages);
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    "";

  if (!lastUserMessage) {
    response.status(400).json({ error: "At least one user message is required." });
    return;
  }

  const client = getProviderClient(provider);
  const model = getProviderModel(provider);

  if (!client) {
    response.status(503).json({
      code: `missing_${provider}_api_key`,
      error: `${getProviderApiKeyName(provider)} is not configured. Add it to .env or the host environment, then restart the Barry server.`,
      model,
      provider,
    });
    return;
  }

  try {
    const instructions = await readBarryPrompt();
    const message =
      provider === "openai"
        ? await createOpenAiResponse(client, model, instructions, messages)
        : await createChatCompletionResponse(client, model, instructions, messages);

    response.json({
      mode: "live",
      model,
      provider,
      message,
    });
  } catch (error) {
    console.error(`Barry ${provider} API error`, error);
    response.status(getHttpStatus(error)).json({
      code: `${provider}_request_failed`,
      error: getErrorMessage(error, provider),
      model,
      provider,
    });
  }
});

app.all("/api/chat", (request, response) => {
  response
    .set("Allow", "POST")
    .status(405)
    .json({
      code: "method_not_allowed",
      error: `Method ${request.method} is not allowed for /api/chat. Use POST with a JSON body.`,
    });
});

app.use("/api", (request, response) => {
  response.status(404).json({
    code: "api_route_not_found",
    error: `No API route found for ${request.method} ${request.originalUrl}.`,
  });
});

const staticDir = path.resolve(process.cwd(), "dist");
const staticIndex = path.join(staticDir, "index.html");

if (existsSync(staticIndex)) {
  app.use(express.static(staticDir));
  app.get("*", (_request, response) => {
    response.sendFile(staticIndex);
  });
}

app.listen(port, host, () => {
  console.log(`Barry server listening on http://${host}:${port}`);
});

function normalizeMessages(value: unknown): IncomingMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message): message is IncomingMessage => {
      if (!message || typeof message !== "object") return false;
      const candidate = message as Partial<IncomingMessage>;
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .slice(-24);
}

function normalizeProvider(value: unknown): ChatProvider {
  return value === "deepseek" || value === "gemini" || value === "openai"
    ? value
    : "openai";
}

function getProviderClient(provider: ChatProvider) {
  if (provider === "deepseek") return deepseekClient;
  if (provider === "gemini") return geminiClient;
  return openaiClient;
}

function getProviderModel(provider: ChatProvider) {
  if (provider === "deepseek") return deepseekModel;
  if (provider === "gemini") return geminiModel;
  return openaiModel;
}

function getProviderApiKeyName(provider: ChatProvider) {
  if (provider === "deepseek") return "DEEPSEEK_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  return "OPENAI_API_KEY";
}

async function readBarryPrompt() {
  const promptPath = path.resolve(process.cwd(), "prompts/barry-system.prompt.xml");
  return fs.readFile(promptPath, "utf8");
}

async function createOpenAiResponse(
  client: OpenAI,
  model: string,
  instructions: string,
  messages: IncomingMessage[]
) {
  const result = await client.responses.create({
    model,
    instructions,
    input: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  });

  return extractResponsesOutputText(result);
}

async function createChatCompletionResponse(
  client: OpenAI,
  model: string,
  instructions: string,
  messages: IncomingMessage[]
) {
  const result = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: instructions,
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  return extractChatCompletionText(result);
}

function extractResponsesOutputText(result: unknown) {
  const outputText = (result as { output_text?: string }).output_text;
  if (outputText?.trim()) return outputText.trim();

  const output = (result as { output?: Array<{ content?: unknown[] }> }).output;
  const textParts =
    output?.flatMap((item) =>
      (item.content ?? []).flatMap((content) => {
        if (
          content &&
          typeof content === "object" &&
          "text" in content &&
          typeof (content as { text?: unknown }).text === "string"
        ) {
          return [(content as { text: string }).text];
        }
        return [];
      })
    ) ?? [];

  return textParts.join("\n").trim() || "I could not extract a response.";
}

function extractChatCompletionText(result: unknown) {
  const content = (
    result as {
      choices?: Array<{
        message?: {
          content?: unknown;
        };
      }>;
    }
  ).choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return [(part as { text: string }).text];
        }
        return [];
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "I could not extract a response.";
}

function getHttpStatus(error: unknown) {
  const status =
    (error as { status?: unknown })?.status ??
    (error as { statusCode?: unknown })?.statusCode;

  return typeof status === "number" && status >= 400 && status <= 599
    ? status
    : 502;
}

function getErrorMessage(error: unknown, provider: ChatProvider) {
  if (error instanceof Error && error.message.trim()) {
    return `${getProviderLabel(provider)} request failed: ${error.message}`;
  }

  return `${getProviderLabel(provider)} request failed for an unknown reason. Check the Barry server logs.`;
}

function getProviderLabel(provider: ChatProvider) {
  if (provider === "gemini") return "Gemini";
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}
