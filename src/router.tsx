import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HomeRedirect } from "@/routes/index";
import { ChatHome } from "@/routes/chat.index";
import { ChatThread } from "@/routes/chat.thread";

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRedirect,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatHome,
});

const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$threadId",
  component: ChatThread,
});

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, threadRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

