import { HttpServerResponse } from "@effect/platform";
import { createServerFileRoute, getEvent } from "@tanstack/react-start/server";
import { Chunk, Deferred, Effect, Exit, Stream } from "effect";
import { auth } from "../../auth";
import { DatabaseService } from "../../db/kysely";
import { GitHubClient } from "../../services/github-client";
import { StarSyncService, type StarredRepoMessage } from "../../services/star-sync-service";
import { getGitHubAccessToken } from "../../utils/session";

export interface SSEMessage {
  id: string;
  event: string;
  data: unknown;
}

const encoder = new TextEncoder();
const endOfMessage = `\n\n`;
const encodeServerSideMsg = (message: SSEMessage) => {
  return `id: ${message.id}\nevent: ${message.event}\ndata: ${JSON.stringify(message.data)}${endOfMessage}`;
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
      const lastEventId = request.headers.get("Last-Event-ID") ?? undefined;

      const accessToken = await getGitHubAccessToken(request);

      const starStream = await Effect.runPromise(
        makeServerSideEventStream({ userId, accessToken, lastEventId }).pipe(
          Effect.provide(StarSyncService.Default),
          Effect.provide(DatabaseService.Default),
          Effect.provide(GitHubClient.Default)
        )
      );

      const bodyStream = starStream.pipe(
        Stream.groupedWithin(100, "100 millis"),
        Stream.map(Chunk.map((msg) => encodeServerSideMsg(msg))),
        Stream.map((chunk) => encoder.encode(Chunk.toArray(chunk).join("")))
        // Stream.schedule(Schedule.spaced("100 millis")) // Small delay for smooth streaming
      );

      return HttpServerResponse.stream(bodyStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Last-Event-ID",
        },
      }).pipe(HttpServerResponse.toWeb);
    } catch (error) {
      console.error("Stream setup error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});

const makeServerSideEventStream = Effect.fn(function* (input: {
  userId: string;
  accessToken: string;
  lastEventId?: string;
}) {
  const service = yield* StarSyncService;
  const signal = yield* createDeferredSignal;

  const { userId, accessToken, lastEventId } = input;

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
  const repoStream = service.createUserStarsStream(userId, accessToken, lastEventId ?? undefined);

  const repoMessageStream = repoStream.pipe(
    Stream.map((value) => {
      if (typeof value === "number") {
        return {
          id: "total",
          event: "total",
          data: value,
        } as SSEMessage;
      }

      const repo = value;
      const data: StarredRepoMessage = {
        id: repo.id,
        name: repo.name,
        owner: repo.owner,
        full_name: repo.full_name,
        description: repo.description,
        stars: repo.stars,
        language: repo.language,
        topics: repo.topics,
        starred_at: repo.starred_at,
        pushed_at: repo.pushed_at,
        created_at: repo.created_at,
      };

      const message: SSEMessage = {
        id: repo.id.toString(),
        event: "repo",
        data,
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

  return allMessages.pipe(Stream.interruptWhenDeferred(signal));
});

/** @see https://github.com/TanStack/router/issues/3490 */
const createAbortSignal = () => {
  const controller = new AbortController();

  const { res } = getEvent().node;

  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  return controller;
};

const createDeferredSignal = Effect.gen(function* () {
  const abortController = createAbortSignal();
  const deferred = yield* Deferred.make();

  abortController.signal.addEventListener(
    "abort",
    () => {
      Deferred.unsafeDone(deferred, Exit.void);
    },
    { once: true }
  );

  return deferred;
});
