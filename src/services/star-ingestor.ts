import { Effect, Option, Stream } from "effect";
import { DatabaseService } from "../db/kysely";
import type { Repo } from "../db/schema";
import { GitHubClient, type GitHubRepo } from "./github-client";

export class StarIngestor extends Effect.Service<StarIngestor>()("StarIngestor", {
  effect: Effect.gen(function* () {
    const githubClient = yield* GitHubClient;
    const db = yield* DatabaseService;

    const transformGitHubRepoToRepo = (ghRepo: GitHubRepo): Repo => ({
      id: ghRepo.id,
      name: ghRepo.name,
      owner: ghRepo.owner.login,
      fullName: ghRepo.full_name,
      description: ghRepo.description || null,
      stars: ghRepo.stargazers_count,
      language: ghRepo.language || null,
      lastFetchedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ingestUserStars = (userId: string, accessToken: string) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Check if user stars are stale (>1 minute)
          const isStale = yield* db.isUserStarsStale(userId, 1);

          if (!isStale) {
            // Return existing stars from database
            const existingStars = yield* db.getUserStars(userId);
            return Stream.fromIterable(
              existingStars.map((star) => ({
                id: star.id,
                name: star.name,
                owner: star.owner,
                fullName: star.fullName,
                description: star.description,
                stars: star.stars,
                language: star.language,
                lastFetchedAt: star.lastFetchedAt,
                createdAt: star.createdAt,
                updatedAt: star.updatedAt,
              }))
            );
          }

          // Fetch all pages of starred repos
          // Use Stream pagination instead of while loop
          const starsPaginated = Stream.paginateEffect(1, (page) =>
            Effect.gen(function* () {
              const stars = yield* githubClient.getUserStars(accessToken, page);

              // If no more stars or we've reached the limit, stop pagination
              if (stars.length === 0 || page > 400) {
                return [stars, Option.none()];
              }

              return [stars, Option.some(page + 1)];
            })
          ).pipe(Stream.flatMap(Stream.fromIterable));

          // Create a stream that processes repos in batches for efficiency
          return starsPaginated.pipe(
            // Group into chunks for batch processing
            Stream.groupedWithin(50, "1 second"),
            Stream.mapEffect((starredReposBatch) =>
              Effect.gen(function* () {
                const reposToUpsert = [];
                const userStarsToUpsert = [];

                // Process each repo in the batch
                for (const starredRepo of starredReposBatch) {
                  const ghRepo = starredRepo.repo;
                  
                  // Check if repo is stale (>24 hours) before fetching details
                  const isRepoStale = yield* db.isRepoStale(ghRepo.id, 24);

                  let repoData = ghRepo;
                  if (isRepoStale) {
                    // Fetch fresh repo details
                    repoData = yield* githubClient.getRepoDetails(accessToken, ghRepo.full_name);
                  }

                  // Transform repo data
                  const repo = transformGitHubRepoToRepo(repoData);
                  reposToUpsert.push(repo);

                  // Prepare user star data
                  userStarsToUpsert.push({
                    userId,
                    repoId: ghRepo.id,
                    starredAt: starredRepo.starred_at ? new Date(starredRepo.starred_at) : new Date(),
                  });
                }

                // Perform batch operations
                const upsertedRepos = yield* db.batchUpsertRepos(reposToUpsert);
                yield* db.batchUpsertUserStars(userStarsToUpsert);

                return upsertedRepos;
              })
            ),
            // Flatten the batched results back to individual repos
            Stream.flatMap((repos) => Stream.fromIterable(repos))
          );
        })
      );

    return { ingestUserStars };
  }),
}) {}
