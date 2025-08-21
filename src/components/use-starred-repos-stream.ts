import { useCallback, useMemo, useState } from "react";
import { useSSE } from "~/components/use-sse";
import type { RepoMessage } from "~/routes/api/stars.stream";

export interface SyncProgress {
  current: number;
  total: number;
  phase: "fetching" | "syncing" | "complete";
}

// Specialized hook for starred repositories using the generic SSE hook
export function useStarredReposStream(url: string, enableLogging?: boolean) {
  const [repos, setRepos] = useState<RepoMessage[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Memoize event handlers object
  const eventHandlers = useMemo(
    () => ({
      connected: () => {
        // Connection established
      },
      progress: (data: SyncProgress) => {
        setSyncProgress(data);
      },
      repo: (data: RepoMessage) => {
        setRepos((prev) => {
          const ids = new Set(prev.map((repo) => repo.id));
          if (ids.has(data.id)) {
            return prev;
          }

          return [...prev, data];
        });
      },
    }),
    []
  );

  const { connectionStatus, error } = useSSE(url, {
    enableLogging,
    eventHandlers,
    onComplete: useCallback(() => {
      console.log("Stream complete", repos);
    }, [repos]),
  });

  return { repos, connectionStatus, syncProgress, error };
}
