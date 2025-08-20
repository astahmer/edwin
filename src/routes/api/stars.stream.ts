import { createServerFileRoute } from "@tanstack/react-start/server";
import { Effect, Stream, Schedule } from "effect";
import { auth } from "../../auth";
import { StarSyncService } from "../../services/star-sync-service";
import { DatabaseService } from "../../db/kysely";
import { GitHubClient } from "../../services/github-client";
import { getGitHubAccessToken } from "../../utils/session";

// SSE message types for type safety
interface SSEMessage {
  id: string;
  event: string;
  data: unknown;
}

// Helper function to format SSE messages
const formatSSEMessage = (message: SSEMessage): Uint8Array => {
  const formattedMessage = `id: ${message.id}\nevent: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
  return new TextEncoder().encode(formattedMessage);
};

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
              data: repo,
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
          Stream.concat(Stream.make(completeMessage))
        );

        // Convert SSE messages to bytes with slight delay between messages
        return allMessages.pipe(
          Stream.groupedWithin(100, "100 millis"),
          Stream.map((chunk) => Array.from(chunk).map(formatSSEMessage)),
          // Stream.schedule(Schedule.spaced("1 millis")), // Small delay for smooth streaming
          // Stream.map(formatSSEMessage),
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
            return Stream.make(formatSSEMessage(errorMessage));
          })
        );
      }).pipe(
        Effect.provide(StarSyncService.Default),
        Effect.provide(DatabaseService.Default),
        Effect.provide(GitHubClient.Default)
      );

      // Execute the Effect and get the stream
      const stream = await Effect.runPromise(sseStream);

      // Create Effect-native streaming response
      const streamingResponse = await Effect.runPromise(
        Effect.gen(function* () {
          // Convert Effect Stream to ReadableStream for Response
          const readableStream = new ReadableStream<Uint8Array>({
            start(controller) {
              const runStream = Effect.gen(function* () {
                yield* Stream.runForEach(stream, (chunk) =>
                  Effect.sync(() => {
                    if (Array.isArray(chunk)) {
                      for (const chunkItem of chunk) {
                        controller.enqueue(chunkItem);
                      }
                    } else {
                      controller.enqueue(chunk);
                    }
                  })
                );
              }).pipe(
                Effect.catchAll((error) => {
                  console.error("Stream error:", error);
                  return Effect.sync(() => {
                    const errorMessage =
                      typeof error === "object" && error !== null && "message" in error
                        ? String((error as { message: unknown }).message)
                        : "Unknown error";
                    const errorChunk = formatSSEMessage({
                      id: "error",
                      event: "error",
                      data: {
                        message: "Stream error occurred",
                        error: errorMessage,
                        timestamp: Date.now(),
                      },
                    });
                    controller.enqueue(errorChunk);
                  });
                }),
                Effect.ensuring(Effect.sync(() => controller.close()))
              );

              Effect.runFork(runStream);
            },

            cancel() {
              console.log("SSE stream cancelled by client");
            },
          });

          return new Response(readableStream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Last-Event-ID",
            },
          });
        })
      );

      return streamingResponse;
    } catch (error) {
      console.error("Stream setup error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
