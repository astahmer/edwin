import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "~/auth.client";
import { LoginPage } from "~/pages/login.page";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login", replace: true });

    try {
      return { session };
    } catch (e) {
      console.error(e);
      await authClient.signOut();
      throw redirect({ to: "/login", replace: true });
    }
  },
  loader: async (args) => {
    return {
      session: args.context.session,
    };
  },
  component: () => {
    const ctx = Route.useRouteContext();
    if (!ctx.session.data) {
      return <LoginPage />;
    }

    return <Outlet />;
  },
});
