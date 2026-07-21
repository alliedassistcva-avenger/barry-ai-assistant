import { ChatMessage, ChatThread } from "@/lib/types";

const storageKey = "barry.threads.v1";

function now() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function readThreads(): ChatThread[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeThreads(threads: ChatThread[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(threads));
}

export async function listThreads() {
  return readThreads().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getThread(threadId: string) {
  return readThreads().find((thread) => thread.id === threadId) ?? null;
}

export async function createThread(starterPrompt?: string) {
  const timestamp = now();
  const thread: ChatThread = {
    id: createId("thr"),
    title: starterPrompt ? starterPrompt.slice(0, 46) : "New conversation",
    messages: starterPrompt
      ? [
          {
            id: createId("msg"),
            role: "user",
            content: starterPrompt,
            createdAt: timestamp,
          },
        ]
      : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeThreads([thread, ...readThreads()]);
  return thread;
}

export function appendMessage(
  threadId: string,
  message: Pick<ChatMessage, "role" | "content">
) {
  const threads = readThreads();
  const timestamp = now();
  const next = threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          updatedAt: timestamp,
          messages: [
            ...thread.messages,
            {
              id: createId("msg"),
              createdAt: timestamp,
              ...message,
            },
          ],
        }
      : thread
  );
  writeThreads(next);
}

export function updateThreadTitleFromMessages(threadId: string) {
  const threads = readThreads();
  const next = threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    const firstUser = thread.messages.find((message) => message.role === "user");
    if (!firstUser) return thread;
    return {
      ...thread,
      title:
        firstUser.content.length > 52
          ? `${firstUser.content.slice(0, 49)}...`
          : firstUser.content,
    };
  });
  writeThreads(next);
}

export function deleteThread(threadId: string) {
  writeThreads(readThreads().filter((thread) => thread.id !== threadId));
}

