import { Effect, Stream } from "effect";
import { StarIngestor } from "./star-ingestor";

export class StreamService extends Effect.Service<StreamService>()("StreamService", {
  effect: Effect.gen(function* () {
    const starIngestor = yield* StarIngestor;

    return {
      streamStars: (userId: string, accessToken: string, lastEventId?: string) => {
        const baseStream = starIngestor.ingestUserStars(userId, accessToken);

        if (!lastEventId) {
          return baseStream;
        }

        // If lastEventId is provided, skip repos until we reach that point
        return baseStream.pipe(
          Stream.dropWhile((repo) => repo.id !== Number(lastEventId)),
          Stream.drop(1) // Skip the lastEventId repo itself
        );
      },
    };
  }),
}) {}
