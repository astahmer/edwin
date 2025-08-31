import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "~/auth.client";
import { LoginPage } from "~/pages/login.page";
import { requireAuthServerFn } from "~/utils/session";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async (ctx) => {
    if (import.meta.env.SSR) {
      const result = await requireAuthServerFn();
      return { session: result };
    } else {
      // Check authentication by making a request to our session endpoint
      try {
        const response = await authClient.getSession();
        if (!response.data) {
          throw new Error("Not authenticated");
        }
        const session = response.data;
        if (!session?.user) {
          throw new Error("No user session");
        }

        return { session: response.data };
      } catch (_error) {
        // Redirect to login if not authenticated
        throw redirect({
          to: "/login",
          search: { redirect: ctx.location.href },
        });
      }
    }
  },
  loader: async (args) => {
    return {
      session: args.context.session,
    };
  },
  component: () => {
    const ctx = Route.useRouteContext();
    if (!ctx.session) {
      return <LoginPage />;
    }

    return <Outlet />;
  },
});
