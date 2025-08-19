import { createServerFileRoute } from "@tanstack/react-start/server";

// Mock GitHub starred repos for now
const mockRepos = [
  {
    id: "1",
    name: "react",
    owner: "facebook",
    fullName: "facebook/react",
    description: "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
    stars: 227000,
    language: "JavaScript",
    lastFetchedAt: new Date().toISOString(),
  },
  {
    id: "2", 
    name: "tanstack-router",
    owner: "TanStack",
    fullName: "TanStack/router",
    description: "🤖 Fully typesafe Router for React (and friends) w/ built-in caching, 1st class search-params APIs, client-side cache integration and isomorphic rendering.",
    stars: 8900,
    language: "TypeScript",
    lastFetchedAt: new Date().toISOString(),
  },
  {
    id: "3",
    name: "effect",
    owner: "Effect-TS", 
    fullName: "Effect-TS/effect",
    description: "A fully-fledged functional effect system for TypeScript with a rich standard library",
    stars: 7800,
    language: "TypeScript",
    lastFetchedAt: new Date().toISOString(),
  },
];

export const ServerRoute = createServerFileRoute("/api/stars/stream")
  .methods({
    GET: async ({ request }) => {
      try {
        // Get session from better-auth (skip for now to test streaming)
        // const session = await auth.api.getSession({
        //   headers: request.headers,
        // });
        
        // if (!session?.user) {
        //   return new Response("Unauthorized", { status: 401 });
        // }

        const userId = "mock-user-id"; // session?.user?.id || "mock-user-id";
        const lastEventId = request.headers.get("Last-Event-ID");

        // Create SSE stream
        const encoder = new TextEncoder();
        let repoIndex = 0;
        
        const readable = new ReadableStream({
          start(controller) {
            // Send initial connection message
            const initMessage = `id: init\nevent: connected\ndata: ${JSON.stringify({ 
              message: "Connected to stars stream", 
              userId,
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(encoder.encode(initMessage));

            // Stream repos with delay to simulate real fetching
            const streamRepos = () => {
              if (repoIndex < mockRepos.length) {
                const repo = mockRepos[repoIndex];
                
                // Skip repos until we reach lastEventId (for resumability)
                if (lastEventId && repo.id !== lastEventId) {
                  repoIndex++;
                  setTimeout(streamRepos, 100);
                  return;
                }
                
                // If we found the lastEventId, skip it and start from next
                if (lastEventId && repo.id === lastEventId) {
                  repoIndex++;
                  setTimeout(streamRepos, 100);
                  return;
                }

                const message = `id: ${repo.id}\nevent: repo\ndata: ${JSON.stringify(repo)}\n\n`;
                controller.enqueue(encoder.encode(message));
                
                repoIndex++;
                setTimeout(streamRepos, 1000); // 1 second delay between repos
              } else {
                // Send completion message
                const completeMessage = `id: complete\nevent: complete\ndata: ${JSON.stringify({ 
                  message: "All starred repositories streamed", 
                  total: mockRepos.length,
                  timestamp: Date.now()
                })}\n\n`;
                controller.enqueue(encoder.encode(completeMessage));
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