import { createServerFileRoute } from "@tanstack/react-start/server";
import { Effect, Layer, Stream } from "effect";
import { auth } from "../../auth";
import { StreamService, StreamServiceLive } from "../../services/StreamService";
import { StarIngestorLive } from "../../services/StarIngestor";
import { GitHubClientLive } from "../../services/GitHubClient";
import { DatabaseLive } from "../../db/kysely";

// Create a program that provides all dependencies
const AppLive = Layer.mergeAll(
  DatabaseLive,
  GitHubClientLive,
  StarIngestorLive,
  StreamServiceLive
);

export const ServerRoute = createServerFileRoute("/api/stars/stream")
  .methods({
    GET: async ({ request }) => {
      try {
        // Get session from better-auth
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        
        if (!session?.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        // For now, we'll assume we can get the access token from the session
        // This will need to be updated when we properly store GitHub tokens
        const accessToken = "github_token_placeholder";
        const userId = session.user.id;
        
        const lastEventId = request.headers.get("Last-Event-ID");

        // Create a simple response for now - we'll implement proper streaming later
        const program = Effect.gen(function* (_) {
          const streamService = yield* _(StreamService);
          
          // For now, just return a simple JSON response
          // We'll implement proper SSE streaming in a future iteration
          return new Response(
            JSON.stringify({ 
              message: "Stars streaming endpoint", 
              userId, 
              lastEventId: lastEventId || null 
            }), 
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        });

        return Effect.runPromise(program.pipe(Effect.provide(AppLive)));
        
      } catch (error) {
        console.error("Stream error:", error);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
          }
        );
      }
    },
  });