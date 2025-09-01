import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type SSEEventHandler = (ctx: {
  data: any;
  eventSource: EventSource;
  setError: Dispatch<SetStateAction<string | null>>;
  setConnectionStatus: Dispatch<SetStateAction<ConnectionState>>;
}) => void;

export type ConnectionState = "connecting" | "connected" | "completed" | "error";

export function useSSE(
  url: string,
  options: {
    enableLogging?: boolean;
    eventHandlers: Partial<Record<string, SSEEventHandler>>;
  } = { enableLogging: false, eventHandlers: {} }
) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  const { enableLogging, eventHandlers } = options;

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

        eventSource.addEventListener("open", () => {
          if (enableLogging) {
            console.log("SSE connection opened");
          }
          setConnectionStatus("connected");
        });

        eventSource.addEventListener("error", (event: MessageEvent) => {
          if (enableLogging) {
            console.error("SSE connection error:", event);
          }
          const errorMessage = "Connection to stream failed. Please check your network connection.";
          setError(errorMessage);
          setConnectionStatus("error");
          eventSource?.close();
        });

        // Set up custom event handlers
        Object.entries(eventHandlers).forEach(([eventName, handler]) => {
          eventSource!.addEventListener(eventName, (event) => {
            try {
              const data = JSON.parse(event.data);
              if (enableLogging) {
                console.log(`SSE event '${eventName}':`, data);
              }
              handler?.({ data, eventSource: eventSource!, setConnectionStatus, setError });
            } catch (e) {
              if (enableLogging) {
                console.error(`Failed to parse ${eventName} data:`, e);
              }
            }
          });
        });
      } catch (err) {
        if (enableLogging) {
          console.error("Failed to connect to stream:", err);
        }
        const errorMessage = "Failed to connect to stream";
        setError(errorMessage);
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
  }, [url, enableLogging, eventHandlers]);

  return { connectionStatus, error };
}
