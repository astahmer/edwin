import { useRouteContext } from "@tanstack/react-router";
import type { AppRouterContext } from "~/routes/-root.context";

export function useAuth<T = NonNullable<AppRouterContext["session"]>>(
  selector?: (auth: NonNullable<AppRouterContext["session"]>) => T
): T {
  const selection = useRouteContext({
    from: "/_authenticated",
    select: (ctx) =>
      selector ? selector(ctx.session as NonNullable<AppRouterContext["session"]>) : ctx.session,
  });

  return selection as T;
}
