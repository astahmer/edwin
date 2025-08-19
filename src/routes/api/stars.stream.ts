import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "../../auth";
import { getGitHubAccessToken } from "../../utils/session";
import { Effect, pipe } from "effect";
import { GitHubClient, GitHubClientLive } from "../../services/GitHubClient";

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
              timestamp: Date.now()
            })}\n\n`;
            controller.enqueue(encoder.encode(initMessage));

            // Fetch and stream repos from GitHub API using Effect
            const streamRepos = async () => {
              try {
                const program = pipe(
                  GitHubClient,
                  Effect.flatMap(client => client.getUserStars(accessToken, 1)),
                  Effect.provide(GitHubClientLive)
                );

                const repos = await Effect.runPromise(program);

                for (let i = 0; i < repos.length; i++) {
                  const {repo,starred_at} = repos[i];

                  // Transform GitHub repo to our format
                  const formattedRepo = {
                    starred_at,
                    id: repo.id,
                    name: repo.name,
                    owner: repo.owner.login,
                    fullName: repo.full_name,
                    description: repo.description || undefined,
                    stars: repo.stargazers_count,
                    language: repo.language || undefined,
                    lastFetchedAt: new Date().toISOString(),
                  };

                  // Skip repos until we reach lastEventId (for resumability)
                  if (lastEventId && String(repo.id) !== lastEventId && i === 0) {
                    const lastIndex = repos.findIndex(r => String(r.repo.id) === lastEventId);
                    if (lastIndex !== -1) {
                      i = lastIndex; // Start from the repo after lastEventId
                      continue;
                    }
                  }

                  const message = `id: ${repo.id}\nevent: repo\ndata: ${JSON.stringify(formattedRepo)}\n\n`;
                  controller.enqueue(encoder.encode(message));

                  // Add delay between repos to simulate real-time streaming
                  // if (i < repos.length - 1) {
                  //   await new Promise(resolve => setTimeout(resolve, 500));
                  // }
                }

                // Send completion message
                const completeMessage = `id: complete\nevent: complete\ndata: ${JSON.stringify({
                  message: "All starred repositories streamed",
                  total: repos.length,
                  timestamp: Date.now()
                })}\n\n`;
                controller.enqueue(encoder.encode(completeMessage));
                controller.close();

              } catch (error) {
                console.error("Failed to fetch repos from GitHub:", error);
                const errorMessage = `id: error\nevent: error\ndata: ${JSON.stringify({
                  message: "Failed to fetch repositories from GitHub",
                  error: error instanceof Error ? error.message : "Unknown error",
                  timestamp: Date.now()
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
          }
        });

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Last-Event-ID",
          },
        });

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
