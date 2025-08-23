import { useEffect, useState } from "react";

type SSEEventHandler = (data: any) => void;

// Generic SSE hook with configurable logging
export function useSSE(
  url: string,
  options: {
    enableLogging?: boolean;
    eventHandlers: Partial<Record<string, SSEEventHandler>>;
    onError?: (error: string) => void;
    onComplete?: () => void;
  } = { enableLogging: false, eventHandlers: {} }
) {
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "completed" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  const { enableLogging, eventHandlers, onError, onComplete } = options;

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectToStream = () => {
      try {
        setError(null);
        setConnectionStatus("connecting");

        if (enableLogging) {
          console.log("Connecting to SSE stream:", url);
        }

        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          if (enableLogging) {
            console.log("SSE connection opened");
          }
          setConnectionStatus("connected");
        };

        // Set up custom event handlers
        Object.entries(eventHandlers).forEach(([eventName, handler]) => {
          eventSource!.addEventListener(eventName, (event) => {
            try {
              const data = JSON.parse(event.data);
              if (enableLogging) {
                console.log(`SSE event '${eventName}':`, data);
              }
              handler?.(data);
            } catch (e) {
              if (enableLogging) {
                console.error(`Failed to parse ${eventName} data:`, e);
              }
            }
          });
        });

        // Handle completion
        eventSource.addEventListener("complete", (event) => {
          if (enableLogging) {
            console.log("Stream completed:", event.data);
          }
          setConnectionStatus("completed");
          onComplete?.();
          eventSource?.close();
        });

        // Handle errors
        eventSource.addEventListener("error", (event: MessageEvent) => {
          try {
            const errorData = JSON.parse(event.data);
            if (enableLogging) {
              console.error("SSE API error:", errorData);
            }

            let errorMessage = `Error: ${errorData.message}`;
            if (
              errorData.message.includes("token expired") ||
              errorData.message.includes("invalid")
            ) {
              errorMessage = "Your GitHub authentication has expired. Please log in again.";
            } else if (errorData.message.includes("Rate limit")) {
              errorMessage = "GitHub API rate limit exceeded. Please try again later.";
            }

            setError(errorMessage);
            onError?.(errorMessage);
          } catch (_e) {
            if (enableLogging) {
              console.error("SSE stream error:", event, _e);
            }
            const errorMessage = "Failed to fetch data from server";
            setError(errorMessage);
            onError?.(errorMessage);
          }
          setConnectionStatus("error");
          eventSource?.close();
        });

        eventSource.onerror = (event) => {
          if (enableLogging) {
            console.error("SSE connection error:", event);
          }
          const errorMessage = "Connection to stream failed. Please check your network connection.";
          setError(errorMessage);
          onError?.(errorMessage);
          setConnectionStatus("error");
          eventSource?.close();
        };
      } catch (err) {
        if (enableLogging) {
          console.error("Failed to connect to stream:", err);
        }
        const errorMessage = "Failed to connect to stream";
        setError(errorMessage);
        onError?.(errorMessage);
        setConnectionStatus("error");
      }
    };

    connectToStream();

    return () => {
      if (enableLogging) {
        console.log("Cleaning up SSE connection");
      }
      eventSource?.close();
    };
  }, [url, enableLogging, eventHandlers, onError, onComplete]);

  return { connectionStatus, error };
}
