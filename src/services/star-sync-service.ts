import { Effect, Option, Stream } from "effect";
import { DatabaseService } from "../db/kysely";
import type {
  InsertableGithubRepository,
  InsertableGithubUserStar,
  SelectableGithubRepository,
} from "../db/schema";
import { GitHubClient, type GitHubRepo, type StarredGithubRepo } from "./github-client";

export interface SyncResult {
  totalFetched: number;
  newRepos: number;
  updatedRepos: number;
  lastSyncAt: Date;
}

export interface StarredRepoMessage {
  id: number;
  name: string;
  owner: string;
  full_name: string;
  description: string | null;
  stars: number;
  language: string | null;
  starred_at: number;
}

/**
 * Unified service for syncing GitHub stars with support for both:
 * - Batch synchronization (syncUserStars)
 * - Incremental streaming (streamUserStars)
 */
export class StarSyncService extends Effect.Service<StarSyncService>()("StarSyncService", {
  effect: Effect.gen(function* () {
    const githubClient = yield* GitHubClient;
    const db = yield* DatabaseService;

    const createPaginatedStarStream = (input: {
      accessToken: string;
      since?: Date;
      initialPage?: number;
    }) =>
      Stream.paginateEffect(input.initialPage ?? 1, (page) =>
        Effect.gen(function* () {
          const starsResponse = yield* githubClient.getUserStars(input.accessToken, page);
          const stars = starsResponse.json;

          // Filter by cursor if provided
          const since = input.since;
          const filteredStars = since
            ? stars.filter((star) => new Date(star.starred_at) > since)
            : stars;

          // Stop if no results or hit pagination limit
          if (stars.length === 1 || (input.since && filteredStars.length === 0)) {
            return [filteredStars, Option.none()];
          }

          return [filteredStars, stars.length < 100 ? Option.none() : Option.some(page + 1)];
        })
      );

    const upsertStarsChunk = (
      starredReposBatch: ReadonlyArray<StarredGithubRepo>,
      userId: string
    ) =>
      Effect.gen(function* () {
        const reposToUpsert: InsertableGithubRepository[] = [];
        const userStarsToUpsert: InsertableGithubUserStar[] = [];

        for (const starredRepo of starredReposBatch) {
          const repo = mapGithubRepoToEntity(starredRepo.repo);
          reposToUpsert.push(repo);

          userStarsToUpsert.push({
            user_id: userId,
            repo_id: starredRepo.repo.id,
            starred_at: new Date(starredRepo.starred_at),
          });
        }

        const upsertedRepos = yield* db.batchUpsertRepos(reposToUpsert);
        yield* db.batchUpsertUserStars(userStarsToUpsert);

        return upsertedRepos;
      });

    const createExistingStarsStream = (userId: string) =>
      Effect.gen(function* () {
        const count = yield* db.getUserStarsCount(userId);
        const existingStarsStream = Stream.paginateEffect(0, (offset) =>
          Effect.gen(function* () {
            {
              if (offset >= count) {
                return [[], Option.none()];
              }
              const next = yield* db.getUserStars(userId, 500, offset);
              return [next, Option.some(offset + 500)];
            }
          })
        );
        return existingStarsStream.pipe(
          Stream.flatMap((batch) =>
            Stream.fromIterable(
              batch.map((repo) => {
                return {
                  id: repo.id,
                  name: repo.name,
                  owner: repo.owner,
                  full_name: repo.full_name,
                  description: repo.description,
                  stars: repo.stars,
                  language: repo.language,
                  starred_at: repo.starred_at.getTime(),
                } as StarredRepoMessage;
              })
            )
          )
        );
      });

    return {
      createUserStarsStream: (userId: string, accessToken: string, _lastEventId?: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const mostRecentStarredAt = yield* db.getMostRecentStarredAt(userId);

            return Stream.unwrap(createExistingStarsStream(userId)).pipe(
              Stream.concat(
                createPaginatedStarStream({
                  accessToken,
                  since: mostRecentStarredAt,
                  initialPage: 1,
                }).pipe(
                  Stream.tap((page) => Effect.log(page.length)),
                  Stream.tap((chunk) => upsertStarsChunk(Array.from(chunk), userId)),
                  Stream.flatMap(Stream.fromIterable),
                  Stream.map(
                    (starredRepo) =>
                      ({
                        id: starredRepo.repo.id,
                        name: starredRepo.repo.name,
                        owner: starredRepo.repo.owner.login,
                        full_name: starredRepo.repo.full_name,
                        description: starredRepo.repo.description,
                        stars: starredRepo.repo.stargazers_count,
                        language: starredRepo.repo.language,
                        starred_at: starredRepo.starred_at,
                      }) as StarredRepoMessage
                  )
                )
              )
            );
          })
        ),
    };
  }),
}) {}

const mapGithubRepoToEntity = (ghRepo: GitHubRepo): SelectableGithubRepository => ({
  id: ghRepo.id,
  name: ghRepo.name,
  owner: ghRepo.owner.login,
  full_name: ghRepo.full_name,
  description: ghRepo.description || null,
  stars: ghRepo.stargazers_count,
  language: ghRepo.language || null,
  last_fetched_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
});
