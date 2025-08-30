import { useRouteContext } from "@tanstack/react-router";
import type { AppRouterContext } from "~/routes/-root.context";

export function useAuth<T = NonNullable<AppRouterContext["session"]["data"]>>(
  selector?: (auth: NonNullable<AppRouterContext["session"]["data"]>) => T
): T {
  const selection = useRouteContext({
    from: "/_authenticated",
    select: (ctx) =>
      selector
        ? selector(ctx.session.data as NonNullable<AppRouterContext["session"]["data"]>)
        : ctx.session.data,
  });

  return selection as T;
}
