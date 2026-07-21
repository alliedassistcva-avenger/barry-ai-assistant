import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowUp, CircleAlert, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatProvider, sendChatMessage } from "@/lib/api";
import {
  appendMessage,
  createThread,
  deleteThread,
  getThread,
  updateThreadTitleFromMessages,
} from "@/lib/threads";

const providerStorageKey = "barry.chatProvider.v1";
const providerOptions: Array<{ label: string; value: ChatProvider }> = [
  { label: "OpenAI / ChatGPT", value: "openai" },
  { label: "DeepSeek", value: "deepseek" },
];

export function ChatThread() {
  const { threadId } = useParams({ from: "/chat/$threadId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<ChatProvider>(readStoredProvider);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const autoRunRef = useRef<string | null>(null);

  const threadQuery = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThread(threadId),
  });

  const thread = threadQuery.data;
  const messages = thread?.messages ?? [];
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user"),
    [messages]
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      content,
      storeUserMessage = true,
    }: {
      content: string;
      storeUserMessage?: boolean;
    }) => {
      if (storeUserMessage) {
        appendMessage(threadId, { role: "user", content });
        updateThreadTitleFromMessages(threadId);
        await queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
        await queryClient.invalidateQueries({ queryKey: ["threads"] });
      }

      const refreshedThread = getThread(threadId);
      const response = await sendChatMessage({
        messages: refreshedThread?.messages ?? [],
        provider,
      });

      appendMessage(threadId, {
        role: "assistant",
        content: response.message,
      });
      updateThreadTitleFromMessages(threadId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      inputRef.current?.focus();
    },
  });
  const chatErrorMessage =
    sendMutationErrorMessage(sendMutation.error) ??
    "Barry could not complete the request.";

  const createThreadMutation = useMutation({
    mutationFn: () => createThread(),
    onSuccess: async (newThread) => {
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      await navigate({
        to: "/chat/$threadId",
        params: { threadId: newThread.id },
      });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendMutation.isPending) return;
    setDraft("");
    sendMutation.mutate({ content });
  };

  const handleDelete = async () => {
    deleteThread(threadId);
    await queryClient.invalidateQueries({ queryKey: ["threads"] });
    await navigate({ to: "/chat" });
  };

  const handleProviderChange = (nextProvider: ChatProvider) => {
    setProvider(nextProvider);
    window.localStorage.setItem(providerStorageKey, nextProvider);
  };

  useEffect(() => {
    const starterMessage =
      messages.length === 1 && messages[0]?.role === "user"
        ? messages[0]
        : null;

    if (
      starterMessage &&
      autoRunRef.current !== starterMessage.id &&
      !sendMutation.isPending
    ) {
      autoRunRef.current = starterMessage.id;
      sendMutation.mutate({
        content: starterMessage.content,
        storeUserMessage: false,
      });
    }
  }, [messages, sendMutation, threadId]);

  if (threadQuery.isLoading) {
    return <main className="thread-surface">Loading Barry...</main>;
  }

  if (!thread) {
    return (
      <main className="thread-surface empty-thread">
        <CircleAlert aria-hidden="true" />
        <h1>Conversation not found</h1>
        <Button onClick={() => navigate({ to: "/chat" })}>Start over</Button>
      </main>
    );
  }

  return (
    <main className="thread-surface">
      <header className="thread-header">
        <div>
          <p className="eyebrow">Barry thread</p>
          <h1>{thread.title}</h1>
        </div>
        <div className="thread-actions">
          <label className="provider-control">
            <span>AI</span>
            <select
              value={provider}
              disabled={sendMutation.isPending}
              onChange={(event) =>
                handleProviderChange(event.target.value as ChatProvider)
              }
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() => createThreadMutation.mutate()}
            disabled={createThreadMutation.isPending}
          >
            <Plus aria-hidden="true" />
            New
          </Button>
          <Button variant="ghost" onClick={handleDelete}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </header>

      <section className="message-list" aria-label="Conversation">
        {messages.length === 0 ? (
          <div className="empty-message">
            <Sparkles aria-hidden="true" />
            <h2>Barry is ready.</h2>
            <p>
              Ask for code, campaign strategy, data analysis, content, or a plan
              with explicit checkpoints before consequential actions.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`message-row message-${message.role}`}
            >
              <div className="message-bubble">
                <span>{message.role === "assistant" ? "Barry" : "You"}</span>
                <p>{message.content}</p>
              </div>
            </article>
          ))
        )}

        {sendMutation.isPending ? (
          <article className="message-row message-assistant">
            <div className="message-bubble thinking">
              <span>Barry</span>
              <p>Thinking fast, checking the details...</p>
            </div>
          </article>
        ) : null}

        {sendMutation.isError ? (
          <div className="error-banner" role="alert">
            <strong>Barry request failed.</strong>
            <span>{chatErrorMessage}</span>
          </div>
        ) : null}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-draft">
          Message Barry
        </label>
        <textarea
          id="chat-draft"
          ref={inputRef}
          value={draft}
          rows={1}
          placeholder={
            lastUserMessage
              ? "Keep going..."
              : "Ask Barry to build, debug, analyze, write, or plan..."
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" disabled={!draft.trim() || sendMutation.isPending}>
          <ArrowUp aria-hidden="true" />
          Send
        </Button>
      </form>
    </main>
  );
}

function readStoredProvider(): ChatProvider {
  if (typeof window === "undefined") return "openai";
  return window.localStorage.getItem(providerStorageKey) === "deepseek"
    ? "deepseek"
    : "openai";
}

function sendMutationErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error);
}
