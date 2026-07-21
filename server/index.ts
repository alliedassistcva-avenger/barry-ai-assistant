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
type ImageProvider = ChatProvider;

type GeneratedImage = {
  imageUrl?: string;
  imageBase64?: string;
  mimeType: string;
  prompt: string;
  providerUsed: ImageProvider;
  modelUsed: string;
};

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const defaultProvider = normalizeProvider(process.env.AI_PROVIDER);
const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1";
const openaiImageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const deepseekModel = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const geminiImageModel =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
const geminiBaseUrl =
  process.env.GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const geminiImageBaseUrl =
  process.env.GEMINI_IMAGE_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta";
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
        imageConfigured: Boolean(openaiClient),
        imageModel: openaiImageModel,
      },
      deepseek: {
        configured: Boolean(deepseekClient),
        model: deepseekModel,
        imageConfigured: false,
        imageUnavailableReason:
          "DeepSeek's public API does not currently expose image generation.",
      },
      gemini: {
        configured: Boolean(geminiClient),
        model: geminiModel,
        imageConfigured: Boolean(process.env.GEMINI_API_KEY),
        imageModel: geminiImageModel,
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

app.post("/api/image", async (request, response) => {
  const provider = normalizeProvider(request.body?.provider);
  const prompt = normalizePrompt(request.body?.prompt);
  const model = getImageProviderModel(provider);

  if (!prompt) {
    response.status(400).json({
      code: "missing_image_prompt",
      error: "An image prompt is required.",
      provider,
      model,
    });
    return;
  }

  if (provider === "deepseek") {
    response.status(501).json({
      code: "deepseek_image_unavailable",
      error:
        "DeepSeek image generation is unavailable because DeepSeek's public API does not currently expose an image-generation endpoint. Select OpenAI / ChatGPT or Gemini for image generation.",
      provider,
      model,
    });
    return;
  }

  if (!isImageProviderConfigured(provider)) {
    response.status(503).json({
      code: `missing_${provider}_api_key`,
      error: `${getProviderApiKeyName(provider)} is not configured. Add it to .env or the host environment, then restart the Barry server.`,
      provider,
      model,
    });
    return;
  }

  try {
    const image = await generateImage({ prompt, provider });

    response.json({
      mode: "live",
      ...image,
    });
  } catch (error) {
    console.error(`Barry ${provider} image API error`, error);
    response.status(getHttpStatus(error)).json({
      code: `${provider}_image_generation_failed`,
      error: getImageErrorMessage(error, provider),
      provider,
      model,
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

app.all("/api/image", (request, response) => {
  response
    .set("Allow", "POST")
    .status(405)
    .json({
      code: "method_not_allowed",
      error: `Method ${request.method} is not allowed for /api/image. Use POST with a JSON body.`,
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

function normalizePrompt(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function getImageProviderModel(provider: ImageProvider) {
  if (provider === "gemini") return geminiImageModel;
  if (provider === "deepseek") return "unavailable";
  return openaiImageModel;
}

function isImageProviderConfigured(provider: ImageProvider) {
  if (provider === "deepseek") return false;
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return Boolean(openaiClient);
}

async function generateImage({
  prompt,
  provider,
}: {
  prompt: string;
  provider: ImageProvider;
}): Promise<GeneratedImage> {
  if (provider === "gemini") {
    return generateGeminiImage(prompt);
  }

  if (provider === "deepseek") {
    throw new Error(
      "DeepSeek's public API does not currently expose image generation."
    );
  }

  return generateOpenAiImage(prompt);
}

async function generateOpenAiImage(prompt: string): Promise<GeneratedImage> {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const result = await openaiClient.images.generate({
    model: openaiImageModel,
    prompt,
    n: 1,
    size: "1024x1024",
  });

  const image = (
    result as {
      data?: Array<{
        b64_json?: string;
        url?: string;
      }>;
    }
  ).data?.[0];

  if (!image?.b64_json && !image?.url) {
    throw new Error("OpenAI returned no image data.");
  }

  return {
    imageBase64: image.b64_json,
    imageUrl: image.url,
    mimeType: "image/png",
    prompt,
    providerUsed: "openai",
    modelUsed: openaiImageModel,
  };
}

async function generateGeminiImage(prompt: string): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const endpoint = `${geminiImageBaseUrl.replace(/\/+$/, "")}/interactions`;
  const geminiResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: geminiImageModel,
      input: prompt,
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    }),
  });
  const responseText = await geminiResponse.text();
  const data = parseJsonResponse(responseText);

  if (!geminiResponse.ok) {
    throw new Error(
      extractProviderErrorMessage(data) ||
        responseText.trim() ||
        `Gemini returned HTTP ${geminiResponse.status}.`
    );
  }

  const image = extractGeminiImage(data);
  if (!image) {
    throw new Error("Gemini returned no image data.");
  }

  return {
    imageBase64: image.data,
    mimeType: image.mimeType,
    prompt,
    providerUsed: "gemini",
    modelUsed: geminiImageModel,
  };
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

function parseJsonResponse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractGeminiImage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const root = data as {
    output_image?: unknown;
    steps?: unknown;
    output?: unknown;
  };

  const directImage = extractImageBlock(root.output_image);
  if (directImage) return directImage;

  if (Array.isArray(root.steps)) {
    for (const step of root.steps) {
      if (!step || typeof step !== "object") continue;
      const content = (step as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        const image = extractImageBlock(block);
        if (image) return image;
      }
    }
  }

  if (Array.isArray(root.output)) {
    for (const block of root.output) {
      const image = extractImageBlock(block);
      if (image) return image;
    }
  }

  return null;
}

function extractImageBlock(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const block = value as {
    type?: unknown;
    data?: unknown;
    mime_type?: unknown;
    mimeType?: unknown;
  };

  if (block.type && block.type !== "image") return null;
  if (typeof block.data !== "string" || !block.data.trim()) return null;

  return {
    data: block.data,
    mimeType:
      typeof block.mime_type === "string"
        ? block.mime_type
        : typeof block.mimeType === "string"
          ? block.mimeType
          : "image/png",
  };
}

function extractProviderErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const error = (data as { error?: unknown }).error;

  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return null;
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

function getImageErrorMessage(error: unknown, provider: ImageProvider) {
  if (error instanceof Error && error.message.trim()) {
    return `${getProviderLabel(provider)} image generation failed: ${error.message}`;
  }

  return `${getProviderLabel(provider)} image generation failed for an unknown reason. Check the Barry server logs.`;
}

function getProviderLabel(provider: ChatProvider) {
  if (provider === "gemini") return "Gemini";
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}
