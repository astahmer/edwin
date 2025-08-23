import { startTransition, useMemo, useRef, useState } from "react";
import { useSSE } from "~/components/use-sse";
import type { StarredRepoMessage } from "~/services/star-sync-service";

export function useStarredReposStream(url: string, enableLogging?: boolean) {
  const [repoList, setRepoList] = useState<StarredRepoMessage[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const repoRef = useRef<StarredRepoMessage[]>([]);

  const { connectionStatus, error } = useSSE(
    url,
    useMemo(
      () => ({
        enableLogging,
        eventHandlers: {
          error: (ctx) => {
            const errorData = ctx.data;
            let errorMessage = `Error: ${errorData.message}`;
            if (
              errorData.message.includes("token expired") ||
              errorData.message.includes("invalid")
            ) {
              errorMessage = "Your GitHub authentication has expired. Please log in again.";
            } else if (errorData.message.includes("Rate limit")) {
              errorMessage = "GitHub API rate limit exceeded. Please try again later.";
            }

            ctx.setError(errorMessage);
          },
          total: (ctx) => setTotal(ctx.data as number),
          repo: (ctx) => {
            const data = ctx.data as StarredRepoMessage;
            const maybeWithTransition =
              repoRef.current.length > 0 ? startTransition : (cb: () => void) => cb();
            maybeWithTransition(() => {
              setRepoList((prev) => {
                const ids = new Set(prev.map((repo) => repo.id));
                if (ids.has(data.id)) {
                  return prev;
                }

                const update = [...prev, data].sort((a, b) => b.starred_at - a.starred_at);
                // starred_at: new Date(starredRepo.starred_at).toISOString(),
                repoRef.current = update;
                return update;
              });
            });
          },
          complete: (ctx) => {
            console.log("Stream complete", repoRef.current);
            ctx.setConnectionStatus("completed");
            ctx.eventSource.close();
          },
        },
      }),
      [enableLogging]
    )
  );

  console.log(total);

  return { total, repoList, connectionStatus, error };
}
