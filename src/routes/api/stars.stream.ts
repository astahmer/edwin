import { createServerFileRoute } from "@tanstack/react-start/server";
import { Effect, Runtime, Stream } from "effect";
import { auth } from "../../auth";
import { DatabaseService } from "../../db/kysely";
import { GitHubClient } from "../../services/github-client";
import { StarSyncService } from "../../services/star-sync-service";
import { getGitHubAccessToken } from "../../utils/session";

export interface RepoMessage {
  id: number;
  name: string;
  owner: string;
  full_name: string;
  description: string | null;
  stars: number;
  language: string | null;
  starred_at: string;
}

interface SSEMessage {
  id: string;
  event: string;
  data: unknown;
}

const encoder = new TextEncoder();
const formatSSEMessage = (message: SSEMessage) => {
  return `id: ${message.id}\nevent: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
};

export const ServerRoute = createServerFileRoute("/api/stars/stream").methods({
  GET: async (ctx) => {
    const { request } = ctx;
    try {
      // Get session from better-auth
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }

      const userId = session.user.id;
      const lastEventId = request.headers.get("Last-Event-ID");

      // Get GitHub access token
      const accessToken = await getGitHubAccessToken(request);

      // Create Effect-native SSE stream
      const sseStream = Effect.gen(function* () {
        const service = yield* StarSyncService;

        // Create initial connection message
        const initMessage: SSEMessage = {
          id: "init",
          event: "connected",
          data: {
            message: "Connected to stars stream",
            userId,
            timestamp: Date.now(),
          },
        };

        // Create repo stream from StarSyncService
        const repoStream = service.streamUserStars(userId, accessToken, lastEventId ?? undefined);

        // Transform repos to SSE message stream
        const repoMessageStream = repoStream.pipe(
          Stream.map((repo) => {
            const message: SSEMessage = {
              id: repo.id.toString(),
              event: "repo",
              data: {
                id: repo.id,
                name: repo.full_name,
                owner: repo.owner,
                full_name: repo.full_name,
                description: repo.description,
                stars: repo.stars,
                language: repo.language,
                starred_at: repo.starred_at,
              },
            };

            return message;
          })
        );

        // Create completion message
        const completeMessage: SSEMessage = {
          id: "complete",
          event: "complete",
          data: {
            message: "All starred repositories streamed",
            timestamp: Date.now(),
          },
        };

        // Combine all messages: init + repos + complete
        const allMessages = Stream.make(initMessage).pipe(
          Stream.concat(repoMessageStream),
          Stream.concat(Stream.make(completeMessage)),
          Stream.catchAll((error) => {
            console.error("Failed to stream repos:", error);
            const errorMessage: SSEMessage = {
              id: "error",
              event: "error",
              data: {
                message: "Failed to fetch repositories",
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
              },
            };
            return Stream.make(errorMessage);
          })
        );

        return allMessages;
      }).pipe(
        Effect.provide(StarSyncService.Default),
        Effect.provide(DatabaseService.Default),
        Effect.provide(GitHubClient.Default)
      );

      // Execute the Effect and get the stream
      const starStream = await Effect.runPromise(sseStream);
      const bodyStream = starStream.pipe(
        // Stream.groupedWithin(100, "100 millis"),
        // Stream.map(Chunk.map((msg) => encoder.encode(formatSSEMessage(msg))))
        Stream.map((msg) => encoder.encode(formatSSEMessage(msg)))
        // Stream.schedule(Schedule.spaced("1 millis")), // Small delay for smooth streaming
      );

      return new Response(Stream.toReadableStreamRuntime(bodyStream, Runtime.defaultRuntime), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Last-Event-ID",
        },
      });
    } catch (error) {
      console.error("Stream setup error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
