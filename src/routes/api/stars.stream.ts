import { createServerFileRoute } from "@tanstack/react-start/server";
import { Effect, Stream } from "effect";
import { auth } from "../../auth";
import { StarSyncService } from "../../services/star-sync-service";
import { DatabaseService } from "../../db/kysely";
import { GitHubClient } from "../../services/github-client";
import { getGitHubAccessToken } from "../../utils/session";

export const ServerRoute = createServerFileRoute("/api/stars/stream").methods({
  GET: async ({ request }) => {
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

      // Create SSE stream
      const encoder = new TextEncoder();

      const readable = new ReadableStream({
        start(controller) {
          // Send initial connection message
          const initMessage = `id: init\nevent: connected\ndata: ${JSON.stringify({
            message: "Connected to stars stream",
            userId,
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(initMessage));

          // Stream repos using StarSyncService with cursor-based pagination
          const streamRepos = async () => {
            try {
              const program = Effect.gen(function* () {
                const service = yield* StarSyncService;
                const repoStream = service.streamUserStars(userId, accessToken, lastEventId || undefined);

                yield* Stream.runForEach(repoStream, (repo) =>
                  Effect.sync(() => {
                    // Transform repo to our streaming format
                    const formattedRepo = {
                      id: repo.id,
                      name: repo.name,
                      owner: repo.owner,
                      fullName: repo.fullName,
                      description: repo.description || undefined,
                      stars: repo.stars,
                      language: repo.language || undefined,
                      lastFetchedAt: repo.lastFetchedAt?.toISOString(),
                      createdAt: repo.createdAt?.toISOString(),
                      updatedAt: repo.updatedAt?.toISOString(),
                    };

                    const message = `id: ${repo.id}\nevent: repo\ndata: ${JSON.stringify(formattedRepo)}\n\n`;
                    controller.enqueue(encoder.encode(message));
                  })
                );
              }).pipe(
                Effect.provide(StarSyncService.Default),
                Effect.provide(DatabaseService.Default),
                Effect.provide(GitHubClient.Default)
              );

              await Effect.runPromise(program);

              // Send completion message
              const completeMessage = `id: complete\nevent: complete\ndata: ${JSON.stringify({
                message: "All starred repositories streamed",
                timestamp: Date.now(),
              })}\n\n`;
              controller.enqueue(encoder.encode(completeMessage));
              controller.close();
            } catch (error) {
              console.error("Failed to stream repos:", error);
              const errorMessage = `id: error\nevent: error\ndata: ${JSON.stringify({
                message: "Failed to fetch repositories",
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
              })}\n\n`;
              controller.enqueue(encoder.encode(errorMessage));
              controller.close();
            }
          };

          // Start streaming after a short delay
          setTimeout(streamRepos, 500);
        },

        cancel() {
          console.log("SSE stream cancelled by client");
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Last-Event-ID",
        },
      });
    } catch (error) {
      console.error("Stream error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
