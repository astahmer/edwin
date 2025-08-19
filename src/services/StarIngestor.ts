import { Effect, Context, Layer, Stream } from "effect";
import { GitHubClient, type GitHubRepo } from "./GitHubClient";
import { DatabaseService } from "../db/kysely";
import type { Repo } from "../db/schema";

export interface StarIngestor {
  readonly ingestUserStars: (userId: string, accessToken: string) => Stream.Stream<Repo, Error, never>;
}

export const StarIngestor = Context.GenericTag<StarIngestor>("StarIngestor");

export const StarIngestorLive = Layer.effect(
  StarIngestor,
  Effect.gen(function* (_) {
    const githubClient = yield* _(GitHubClient);
    const db = yield* _(DatabaseService);

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
        Effect.gen(function* (_) {
          // Check if user stars are stale (>1 minute)
          const isStale = yield* _(db.isUserStarsStale(userId, 1));
          
          if (!isStale) {
            // Return existing stars from database
            const existingStars = yield* _(db.getUserStars(userId));
            return Stream.fromIterable(existingStars.map((star) => ({
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
            })));
          }

          // Fetch all pages of starred repos
          let page = 1;
          let allStars: GitHubRepo[] = [];
          
          while (true) {
            const stars = yield* _(githubClient.getUserStars(accessToken, page));
            if (stars.length === 0) break;
            
            allStars = [...allStars, ...stars];
            page++;
            
            // Prevent infinite loops - GitHub API typically returns max 400 pages
            if (page > 400) break;
          }

          // Create a stream that processes repos one by one
          return Stream.fromIterable(allStars).pipe(
            Stream.mapEffect((ghRepo) =>
              Effect.gen(function* (_) {
                // Check if repo is stale (>24 hours) before fetching details
                const isRepoStale = yield* _(db.isRepoStale(ghRepo.id, 24));
                
                let repoData = ghRepo;
                if (isRepoStale) {
                  // Fetch fresh repo details
                  repoData = yield* _(githubClient.getRepoDetails(accessToken, ghRepo.full_name));
                }

                // Transform and upsert repo
                const repo = transformGitHubRepoToRepo(repoData);
                const upsertedRepo = yield* _(db.upsertRepo(repo));

                // Upsert user star relationship
                yield* _(db.upsertUserStar({
                  userId,
                  repoId: ghRepo.id,
                  starredAt: ghRepo.starred_at ? new Date(ghRepo.starred_at) : new Date(),
                }));

                return upsertedRepo;
              })
            )
          );
        })
      );

    return { ingestUserStars };
  })
);