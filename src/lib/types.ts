export type ChatRole = "user" | "assistant";
export type ChatProvider = "openai" | "deepseek" | "gemini";
export type MessageContentType = "text" | "image";

export interface ChatImagePayload {
  imageUrl?: string;
  imageBase64?: string;
  mimeType: string;
  prompt: string;
  providerUsed: ChatProvider;
  modelUsed: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  contentType?: MessageContentType;
  image?: ChatImagePayload;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
