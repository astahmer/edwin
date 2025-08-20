import { Effect, Option, Stream } from "effect";
import { DatabaseService } from "../db/kysely";
import type {
  SelectableGithubRepository,
  InsertableGithubRepository,
  InsertableGithubUserStar,
} from "../db/schema";
import { GitHubClient, type GitHubRepo, type StarredGithubRepo } from "./github-client";

export interface SyncResult {
  totalFetched: number;
  newRepos: number;
  updatedRepos: number;
  lastSyncAt: Date;
}

interface UserStarData {
  id: number;
  name: string;
  owner: string;
  full_name: string;
  description: string | null;
  stars: number;
  language: string | null;
  last_fetched_at: Date | null;
  created_at: Date;
  updated_at: Date;
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

    const transformGitHubRepoToRepo = (ghRepo: GitHubRepo): SelectableGithubRepository => ({
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

    const transformStarredRepoToDb = (starredRepo: StarredGithubRepo, userId: string) => {
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

    const getExistingStarsStream = (existingStars: UserStarData[]) =>
      Stream.fromIterable(existingStars);

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

    const processBatchOfStars = (
      starredReposBatch: ReadonlyArray<StarredGithubRepo>,
      userId: string,
      accessToken: string
    ) =>
      Effect.gen(function* () {
        const reposToUpsert = [];
        const userStarsToUpsert = [];

        for (const starredRepo of starredReposBatch) {
          const ghRepo = starredRepo.repo;
          const isRepoStale = yield* db.isRepoStale(ghRepo.id, 24);

          let repoData = ghRepo;
          // if (isRepoStale) {
          //   repoData = yield* githubClient.getRepoDetails(accessToken, ghRepo.full_name);
          // }

          const repo = transformGitHubRepoToRepo(repoData);
          reposToUpsert.push(repo);

          userStarsToUpsert.push({
            user_id: userId,
            repo_id: ghRepo.id,
            starred_at: starredRepo.starred_at ? new Date(starredRepo.starred_at) : new Date(),
          });
        }

        const upsertedRepos = yield* db.batchUpsertRepos(reposToUpsert);
        yield* db.batchUpsertUserStars(userStarsToUpsert);

        return upsertedRepos;
      });

    const createStreamFromExisting = (existingStars: UserStarData[], lastEventId?: string) => {
      let baseStream = getExistingStarsStream(existingStars);

      if (lastEventId) {
        baseStream = baseStream.pipe(
          Stream.dropWhile((repo) => repo.id !== Number(lastEventId)),
          Stream.drop(1)
        );
      }

      return baseStream;
    };

    const createIncrementalStream = (
      starsPaginated: Stream.Stream<StarredGithubRepo, unknown, never>,
      existingStars: UserStarData[],
      userId: string,
      accessToken: string,
      lastEventId?: string
    ) => {
      let resultStream = starsPaginated.pipe(
        Stream.groupedWithin(50, "1 second"),
        Stream.mapEffect((batch) => processBatchOfStars(Array.from(batch), userId, accessToken)),
        Stream.flatMap((repos) => Stream.fromIterable(repos)),
        Stream.concat(getExistingStarsStream(existingStars))
      );

      if (lastEventId) {
        resultStream = resultStream.pipe(
          Stream.dropWhile((repo) => repo.id !== Number(lastEventId)),
          Stream.drop(1)
        );
      }

      return resultStream;
    };

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
            const { repo, userStar } = transformStarredRepoToDb(starredRepo, userId);

            reposToUpsert.push(repo);
            userStarsToUpsert.push(userStar);

            if (repo.id && existingRepoIds.has(repo.id)) {
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
      streamUserStars: (userId: string, accessToken: string, lastEventId?: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const isStale = yield* db.isUserStarsStale(userId, 1);

            if (!isStale) {
              const existingStars = yield* db.getUserStars(userId);
              return createStreamFromExisting(existingStars, lastEventId);
            }

            // Get the most recent starred date to use as cursor
            const mostRecentStarredAt = yield* db.getMostRecentStarredAt(userId);
            const existingStars = yield* db.getUserStars(userId, 10000, 0);

            // Fetch only new stars since the most recent starred date
            const starsPaginated = fetchStarsFromCursor(
              accessToken,
              mostRecentStarredAt || undefined
            );

            const hasNewStars = yield* starsPaginated.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk).length > 0)
            );

            if (!hasNewStars) {
              return createStreamFromExisting(existingStars, lastEventId);
            }

            return createIncrementalStream(
              starsPaginated,
              existingStars,
              userId,
              accessToken,
              lastEventId
            );
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
