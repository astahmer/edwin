import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { useStarredReposStream } from "~/components/use-starred-repos-stream";
import { StarsPage } from "~/pages/stars.page";

export const Route = createFileRoute("/_authenticated/stars")({
  validateSearch: Schema.standardSchemaV1(
    Schema.Struct({
      search: Schema.String.pipe(Schema.optional),
      owner: Schema.String.pipe(Schema.optional),
      tags: Schema.String.pipe(Schema.optional), // comma-separated tags
      language: Schema.String.pipe(Schema.optional),
      minStars: Schema.String.pipe(Schema.optional),
      maxStars: Schema.String.pipe(Schema.optional),
      minDate: Schema.String.pipe(Schema.optional),
      maxDate: Schema.String.pipe(Schema.optional),
      activePreset: Schema.String.pipe(Schema.optional),
      sortBy: Schema.String.pipe(Schema.optional),
      sortOrder: Schema.String.pipe(Schema.optional),
      filtersExpanded: Schema.Boolean.pipe(Schema.optional),
    })
  ),
  component: () => {
    const stream = useStarredReposStream("/api/stars/stream");
    return <StarsPage {...stream} />;
  },
});
