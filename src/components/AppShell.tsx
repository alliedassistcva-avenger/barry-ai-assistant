import { PropsWithChildren } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Github, Search, ShieldCheck } from "lucide-react";
import barryLogo from "@/assets/barry-logo.png";
import { createThread, listThreads } from "@/lib/threads";

const capabilityActions = [
  {
    icon: Bot,
    label: "Code and ops",
    prompt:
      "Help me with code and operations. Ask for the repo or process context you need, then give me the fastest safe path.",
  },
  {
    icon: Search,
    label: "Current research",
    prompt:
      "Research this with current sources. Tell me what you can verify, what is uncertain, and what action you recommend.",
  },
  {
    icon: ShieldCheck,
    label: "Confirmation gates",
    prompt:
      "Review this action for risk. Tell me whether it needs explicit confirmation before spending money, publishing, deploying, deleting, or sending externally.",
  },
  {
    icon: Github,
    label: "Repo-ready",
    prompt:
      "Help me prepare this repository change. Check the likely files, validation steps, commit scope, and anything that should not be pushed.",
  },
];

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const threadsQuery = useQuery({
    queryKey: ["threads"],
    queryFn: listThreads,
  });

  const startCapability = useMutation({
    mutationFn: (starterPrompt: string) => createThread(starterPrompt),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      await navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
      });
    },
  });

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Barry workspace">
        <Link to="/chat" className="brand">
          <img src={barryLogo} alt="" width={42} height={42} />
          <span>
            <strong>Barry</strong>
            <small>AI Assistant</small>
          </span>
        </Link>

        <nav className="thread-nav" aria-label="Recent conversations">
          <p>Recent</p>
          {(threadsQuery.data ?? []).length === 0 ? (
            <span className="muted-small">No conversations yet</span>
          ) : (
            threadsQuery.data?.map((thread) => (
              <Link
                key={thread.id}
                to="/chat/$threadId"
                params={{ threadId: thread.id }}
                className={
                  pathname === `/chat/${thread.id}`
                    ? "thread-link active"
                    : "thread-link"
                }
              >
                {thread.title}
              </Link>
            ))
          )}
        </nav>

        <div className="capability-strip" aria-label="Barry capabilities">
          {capabilityActions.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => startCapability.mutate(prompt)}
              disabled={startCapability.isPending}
              className="capability-action"
              title={`Start ${label}`}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="workspace">{children}</div>
    </div>
  );
}
