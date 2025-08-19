import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "../../auth";

export const ServerRoute = createServerFileRoute("/api/auth/$")
  .methods({
    GET: async ({ params, request }) => {
      return auth.handler(request);
    },
    POST: async ({ params, request }) => {
      return auth.handler(request);
    },
  });