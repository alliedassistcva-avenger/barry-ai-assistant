import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Code,
  Image as ImageIcon,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import barryLogo from "@/assets/barry-logo.png";
import { Button } from "@/components/ui/button";
import { createThread } from "@/lib/threads";

const suggestions = [
  {
    icon: Code,
    label: "Debug this stack trace",
    prompt: "Help me debug a stack trace. I'll paste it next.",
  },
  {
    icon: ImageIcon,
    label: "Generate a hero image",
    prompt:
      "Generate an image of a cinematic hero shot for a premium AI assistant dashboard.",
  },
  {
    icon: LineChart,
    label: "Analyze my ads",
    prompt:
      "I need to improve ad performance. Ask me for the data you need and give me a practical optimization plan.",
  },
  {
    icon: ShieldCheck,
    label: "Review a risky action",
    prompt:
      "Help me decide whether this action needs explicit confirmation before I run it.",
  },
];

export function ChatHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (starterPrompt?: string) => createThread(starterPrompt),
    onSuccess: (thread) => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
      });
    },
    onSettled: () => setPendingPrompt(null),
  });

  const startThread = (starterPrompt?: string) => {
    setPendingPrompt(starterPrompt ?? null);
    createMutation.mutate(starterPrompt);
  };

  return (
    <main className="chat-home">
      <section className="hero-panel" aria-labelledby="chat-home-title">
        <img
          src={barryLogo}
          alt="Barry"
          className="barry-logo"
          width={96}
          height={96}
        />
        <p className="eyebrow">Barry AI Assistant</p>
        <h1 id="chat-home-title">
          What are we shipping <span>fast</span>?
        </h1>
        <p className="hero-copy">
          Coding, ops, ads, content, analysis, and clear confirmation gates when
          the next move matters.
        </p>
        <Button
          size="lg"
          className="barry-glow"
          onClick={() => startThread()}
          disabled={createMutation.isPending}
        >
          <Sparkles aria-hidden="true" />
          Start a new conversation
        </Button>
      </section>

      <section className="suggestion-grid" aria-label="Starter prompts">
        {suggestions.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => startThread(prompt)}
            disabled={createMutation.isPending}
            className="suggestion-card"
          >
            <span className="suggestion-icon">
              <Icon aria-hidden="true" />
            </span>
            <span className="suggestion-text">
              <strong>{label}</strong>
              <span>{prompt}</span>
            </span>
          </button>
        ))}
      </section>

      {pendingPrompt ? (
        <p className="pending-note">Starting with: {pendingPrompt}</p>
      ) : null}
    </main>
  );
}
