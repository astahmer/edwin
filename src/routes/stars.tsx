import { createFileRoute, redirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { authClient } from "~/auth.client";
import { StarsPage } from "~/pages/stars.page";
import { requireAuthServerFn } from "~/utils/session";

export const Route = createFileRoute("/stars")({
  validateSearch: Schema.standardSchemaV1(
    Schema.Struct({
      search: Schema.String.pipe(Schema.optional),
      language: Schema.String.pipe(Schema.optional),
      minStars: Schema.String.pipe(Schema.optional),
      maxStars: Schema.String.pipe(Schema.optional),
      minDate: Schema.String.pipe(Schema.optional),
      maxDate: Schema.String.pipe(Schema.optional),
      sortBy: Schema.String.pipe(Schema.optional),
      sortOrder: Schema.String.pipe(Schema.optional),
    })
  ),
  beforeLoad: async (ctx) => {
    if (import.meta.env.SSR) {
      await requireAuthServerFn();
    } else {
      // Check authentication by making a request to our session endpoint
      try {
        const response = await authClient.getSession();
        if (!response.data) {
          throw new Error("Not authenticated");
        }
        const session = response.data;
        if (!session?.user) {
          throw new Error("No user session");
        }
      } catch (_error) {
        // Redirect to login if not authenticated
        throw redirect({
          to: "/login",
          search: { redirect: ctx.location.href },
        });
      }
    }
  },
  component: () => <StarsPage />,
});
