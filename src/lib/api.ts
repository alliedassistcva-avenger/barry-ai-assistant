import { ChatMessage } from "@/lib/types";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type ChatProvider = "openai" | "deepseek";

export interface ChatRequest {
  messages: ChatMessage[];
  provider: ChatProvider;
}

export interface ChatResponse {
  message: string;
  mode: "live";
  model: string;
  provider: ChatProvider;
}

interface ChatErrorResponse {
  code?: string;
  error?: string;
  model?: string;
  provider?: ChatProvider;
}

export class ChatApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown } = {}
  ) {
    super(message);
    this.name = "ChatApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export async function sendChatMessage(payload: ChatRequest) {
  try {
    const response = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await createChatApiError(response);
    }

    const data = (await response.json()) as Partial<ChatResponse>;
    if (typeof data.message !== "string" || !data.message.trim()) {
      throw new ChatApiError("Barry API returned a 200 response without a message.", {
        details: data,
      });
    }

    return data as ChatResponse;
  } catch (error) {
    const chatError =
      error instanceof ChatApiError
        ? error
        : new ChatApiError(
            error instanceof Error
              ? `Barry API request failed before a response was received: ${error.message}`
              : "Barry API request failed before a response was received.",
            { details: error }
          );

    console.error("Barry chat request failed", chatError);
    throw chatError;
  }
}

async function createChatApiError(response: Response) {
  const details = await readErrorDetails(response);
  const serverMessage =
    typeof details === "object" && details && "error" in details
      ? (details as ChatErrorResponse).error
      : null;
  const code =
    typeof details === "object" && details && "code" in details
      ? (details as ChatErrorResponse).code
      : undefined;

  return new ChatApiError(
    [
      `Barry API request failed with HTTP ${response.status} ${response.statusText}.`,
      serverMessage ?? "No error message was returned by the server.",
    ].join(" "),
    {
      status: response.status,
      code,
      details,
    }
  );
}

async function readErrorDetails(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as ChatErrorResponse;
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.trim() ? text : null;
}
