import type { QueryClient } from "@tanstack/react-query";
import type { UserWithRole } from "better-auth/plugins";
import type { Session } from "better-auth/types";
import type { FileRoutesByTo } from "../routeTree.gen";

export interface AppRouterContext {
  queryClient: QueryClient;
  session: {
    user: UserWithRole;
    session: Session;
  };
}

export const routeId = <T extends keyof FileRoutesByTo>(id: T) => id;
export type RouteTo = keyof FileRoutesByTo;
