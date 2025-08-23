import { startTransition, useMemo, useRef, useState } from "react";
import { useSSE } from "~/components/use-sse";
import type { StarredRepoMessage } from "~/services/star-sync-service";

export interface SyncProgress {
  current: number;
  total: number;
  phase: "fetching" | "syncing" | "complete";
}

// Specialized hook for starred repositories using the generic SSE hook
export function useStarredReposStream(url: string, enableLogging?: boolean) {
  const [repoList, setRepoList] = useState<StarredRepoMessage[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const repoRef = useRef<StarredRepoMessage[]>([]);

  const { connectionStatus, error } = useSSE(
    url,
    useMemo(
      () => ({
        enableLogging,
        eventHandlers: {
          connected: () => {
            // Connection established
          },
          progress: (data: SyncProgress) => {
            setSyncProgress(data);
          },
          repo: (data: StarredRepoMessage) => {
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
        },
        onComplete: () => {
          console.log("Stream complete", repoRef.current);
        },
      }),
      [enableLogging]
    )
  );

  return { repos: repoList, connectionStatus, syncProgress, error };
}
