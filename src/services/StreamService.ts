import { Effect, Context, Layer, Stream } from "effect";
import { StarIngestor } from "./StarIngestor";
import type { Repo } from "../db/schema";

export interface StreamService {
  readonly streamStars: (userId: string, accessToken: string, lastEventId?: string) => Stream.Stream<Repo, Error, never>;
}

export const StreamService = Context.GenericTag<StreamService>("StreamService");

export const StreamServiceLive = Layer.effect(
  StreamService,
  Effect.gen(function* (_) {
    const starIngestor = yield* _(StarIngestor);

    const streamStars = (userId: string, accessToken: string, lastEventId?: string) => {
      const baseStream = starIngestor.ingestUserStars(userId, accessToken);
      
      if (!lastEventId) {
        return baseStream;
      }
      
      // If lastEventId is provided, skip repos until we reach that point
      return baseStream.pipe(
        Stream.dropWhile((repo) => repo.id !== Number(lastEventId)),
        Stream.drop(1) // Skip the lastEventId repo itself
      );
    };

    return { streamStars };
  })
);