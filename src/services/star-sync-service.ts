import { Effect, Option, Stream } from "effect";
import { DatabaseService } from "../db/kysely";
import type {
  SelectableGithubRepository,
  InsertableGithubRepository,
  InsertableGithubUserStar,
} from "../db/schema";
import { GitHubClient, type GitHubRepo, type StarredGithubRepo } from "./github-client";
import type { DatabaseGetUserStarsError, GitHubRequestError } from "~/errors";

export interface SyncResult {
  totalFetched: number;
  newRepos: number;
  updatedRepos: number;
  lastSyncAt: Date;
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

    const transformGithubRepoToEntity = (ghRepo: GitHubRepo): SelectableGithubRepository => ({
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

    const transformGithubStarredRepoToInsertableEntity = (
      starredRepo: StarredGithubRepo,
      userId: string
    ) => {
      const repo = starredRepo.repo;
      return {
        repo: {
          id: repo.id,
          name: repo.name,
          owner: repo.owner.login,
          full_name: repo.full_name,
          description: repo.description || null,
          stars: repo.stargazers_count,
          language: repo.language || null,
          last_fetched_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        } as InsertableGithubRepository,
        userStar: {
          user_id: userId,
          repo_id: repo.id,
          starred_at: new Date(starredRepo.starred_at),
          last_checked_at: new Date(),
        } as InsertableGithubUserStar,
      };
    };

    const fetchStarsFromCursor = (accessToken: string, since?: Date) =>
      Stream.paginateEffect(1, (page) =>
        Effect.gen(function* () {
          const stars = yield* githubClient.getUserStars(accessToken, page);

          // Filter by cursor if provided
          const filteredStars = since
            ? stars.filter((star) => new Date(star.starred_at) > since)
            : stars;

          // Stop if no results or hit pagination limit
          if (stars.length === 0 || page > 400 || (since && filteredStars.length === 0)) {
            return [filteredStars, Option.none()];
          }

          return [filteredStars, stars.length < 100 ? Option.none() : Option.some(page + 1)];
        })
      ).pipe(Stream.flatMap(Stream.fromIterable));

    const upsertStarsChunk = (
      starredReposBatch: ReadonlyArray<StarredGithubRepo>,
      userId: string
    ) =>
      Effect.gen(function* () {
        const reposToUpsert: InsertableGithubRepository[] = [];
        const userStarsToUpsert: InsertableGithubUserStar[] = [];

        for (const starredRepo of starredReposBatch) {
          const repo = transformGithubRepoToEntity(starredRepo.repo);
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

    return {
      /**
       * Batch synchronization: Fetch all stars and sync to database
       * Use this for one-time syncs or when you need the complete result
       */
      syncUserStars: (userId: string, accessToken: string) =>
        Effect.gen(function* () {
          console.log(`Starting batch sync for user ${userId}`);

          // Get all starred repos from GitHub
          const starredRepos = yield* githubClient.getAllUserStars(accessToken);
          console.log(`Fetched ${starredRepos.length} starred repos from GitHub`);

          // Get existing synced repos for this user
          const existingStars = yield* db.getUserStars(userId);
          const existingRepoIds = new Set(existingStars.map((star) => star.repo_id));

          // Prepare batch data
          const reposToUpsert: InsertableGithubRepository[] = [];
          const userStarsToUpsert: InsertableGithubUserStar[] = [];
          let newRepos = 0;
          let updatedRepos = 0;

          for (const starredRepo of starredRepos) {
            const insertable = transformGithubStarredRepoToInsertableEntity(starredRepo, userId);

            reposToUpsert.push(insertable.repo);
            userStarsToUpsert.push(insertable.userStar);

            if (insertable.repo.id && existingRepoIds.has(insertable.repo.id)) {
              updatedRepos++;
            } else {
              newRepos++;
            }
          }

          // Perform batch operations
          yield* db.batchUpsertRepos(reposToUpsert);
          yield* db.batchUpsertUserStars(userStarsToUpsert);

          console.log(`Batch sync complete: ${newRepos} new, ${updatedRepos} updated`);

          return {
            totalFetched: starredRepos.length,
            newRepos,
            updatedRepos,
            lastSyncAt: new Date(),
          };
        }),

      /**
       * Incremental streaming: Smart fetching with real-time updates
       * Use this for SSE endpoints or when you want incremental updates
       */
      streamUserStars: (userId: string, accessToken: string, _lastEventId?: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Get the most recent starred date to use as cursor
            const mostRecentStarredAt = yield* db.getMostRecentStarredAt(userId);

            // Fetch only new stars since the most recent starred date
            const starsPaginated = fetchStarsFromCursor(accessToken, mostRecentStarredAt);

            const hasNewStars = yield* starsPaginated.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk).length > 0)
            );
            console.log({ hasNewStars, mostRecentStarredAt });

            if (!hasNewStars) {
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
                        starred_at: repo.starred_at.toISOString(),
                      };
                    })
                  )
                )
              );
            }

            return starsPaginated.pipe(
              Stream.groupedWithin(50, "1 second"),
              Stream.tap((chunk) => upsertStarsChunk(Array.from(chunk), userId)),
              Stream.flatMap((repos) => Stream.fromIterable(repos)),
              Stream.map((starredRepo) => ({
                id: starredRepo.repo.id,
                name: starredRepo.repo.name,
                owner: starredRepo.repo.owner.login,
                full_name: starredRepo.repo.full_name,
                description: starredRepo.repo.description,
                stars: starredRepo.repo.stargazers_count,
                language: starredRepo.repo.language,
                starred_at: new Date(starredRepo.starred_at).toISOString(),
              }))
            ) as Stream.Stream<
              {
                id: number;
                name: string;
                owner: string;
                full_name: string;
                description: string | null;
                stars: number;
                language: string | null;
                starred_at: string;
              },
              GitHubRequestError | DatabaseGetUserStarsError,
              never
            >;
          })
        ),

      /**
       * Utility methods
       */
      getLastSyncTime: (userId: string) =>
        Effect.gen(function* () {
          const userStars = yield* db.getUserStars(userId);

          if (userStars.length === 0) {
            return null;
          }

          // Find the most recent lastCheckedAt time
          const mostRecent = userStars.reduce(
            (latest, star) => (star.last_checked_at > latest ? star.last_checked_at : latest),
            userStars[0].last_checked_at
          );

          return mostRecent;
        }),

      isRepoSynced: (userId: string, repoId: number) =>
        Effect.gen(function* () {
          const userStars = yield* db.getUserStars(userId);
          return userStars.some((star) => star.repo_id === repoId);
        }),
    };
  }),
}) {}
