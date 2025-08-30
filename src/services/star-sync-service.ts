import { Effect, Option, Stream } from "effect";
import { DatabaseService } from "../db/kysely";
import type {
  InsertableGithubRepository,
  InsertableGithubUserStar,
  SelectableGithubRepository,
} from "../db/schema";
import { GitHubClient } from "~/services/github-client";
import type { GithubSchema } from "~/services/github/github";

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
    }) => {
      // Create a stream that generates page numbers to fetch concurrently
      const createPageNumberStream = (startPage: number) =>
        Stream.iterate(startPage, (page) => page + 1);

      return createPageNumberStream(input.initialPage ?? 1).pipe(
        // Fetch up to 5 pages concurrently
        Stream.mapEffect(
          (page) =>
            Effect.gen(function* () {
              const starsResponse = yield* githubClient.getMyStars({
                accessToken: input.accessToken,
                page,
              });
              const stars = starsResponse.json;

              // Filter by cursor if provided
              const since = input.since;
              const filteredStars = since
                ? stars.filter((star) => new Date(star.starred_at) > since)
                : stars;

              return {
                page,
                stars: filteredStars,
                total: starsResponse.pagination?.total,
                hasMorePages: stars.length === 100, // GitHub returns 100 items per page max
                isEmpty: stars.length === 0,
                filteredEmpty: input.since && filteredStars.length === 0,
              };
            }),
          { concurrency: 20 }
        ),
        // Stop fetching when we hit an empty page or filtered results are empty
        Stream.takeWhile((result) => !result.isEmpty && !result.filteredEmpty),
        // Also take one more page if it's not empty to ensure we get all data
        Stream.takeUntil((result) => !result.hasMorePages)
      );
    };

    const upsertStarsChunk = (
      starredReposBatch: ReadonlyArray<GithubSchema.starred_repository>,
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

        yield* db.batchUpsertRepos(reposToUpsert);
        yield* db.batchUpsertUserStars(userStarsToUpsert);
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
                  stars: repo.stargazers_count,
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

            const makeFetchedStarStream = createPaginatedStarStream({
              accessToken,
              since: mostRecentStarredAt,
              initialPage: 1,
            }).pipe(
              Stream.tap((pageResult) => upsertStarsChunk(pageResult.stars, userId)),
              Stream.flatMap((pageResult) =>
                Stream.merge(
                  Stream.fromIterable(pageResult.stars.map(fetchedStarredRepoToMsg)),
                  Stream.when(
                    Stream.make(pageResult.total as number),
                    () => pageResult.total != null
                  )
                )
              )
            );

            const existingStarsStream = Stream.unwrap(createExistingStarsStream(userId));
            return existingStarsStream.pipe(Stream.concat(makeFetchedStarStream));
          })
        ),
    };
  }),
}) {}

const mapGithubRepoToEntity = (ghRepo: GithubSchema.repository): SelectableGithubRepository => ({
  id: ghRepo.id,
  name: ghRepo.name,
  owner: ghRepo.owner.login,
  full_name: ghRepo.full_name,
  description: ghRepo.description || null,
  stargazers_count: ghRepo.stargazers_count,
  language: ghRepo.language,
  created_at: ghRepo.created_at ? new Date(ghRepo.created_at) : null,
  updated_at: ghRepo.updated_at ? new Date(ghRepo.updated_at) : null,
  pushed_at: ghRepo.pushed_at ? new Date(ghRepo.pushed_at) : null,
  archived: ghRepo.archived,
  topics: ghRepo.topics ?? [],
  private: ghRepo.private,
  //
  raw: ghRepo,
  last_fetched_at: new Date(),
});

const fetchedStarredRepoToMsg = (starredRepo: GithubSchema.starred_repository) =>
  ({
    id: starredRepo.repo.id,
    name: starredRepo.repo.name,
    owner: starredRepo.repo.owner.login,
    full_name: starredRepo.repo.full_name,
    description: starredRepo.repo.description,
    stars: starredRepo.repo.stargazers_count,
    language: starredRepo.repo.language,
    starred_at: new Date(starredRepo.starred_at).getTime(),
  }) as StarredRepoMessage;
