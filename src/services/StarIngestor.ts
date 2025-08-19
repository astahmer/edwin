import { Effect, Context, Layer, Stream } from "effect";
import { GitHubClient, type GitHubRepo, type StarredGithubRepo } from "./GitHubClient";
import { DatabaseService } from "../db/kysely";
import type { Repo } from "../db/schema";

export class StarIngestor extends Context.Tag("StarIngestor")<
  StarIngestor,
  {
    readonly ingestUserStars: (userId: string, accessToken: string) => Stream.Stream<Repo, Error, never>;
  }
>() {}

export const StarIngestorLive = Layer.effect(
  StarIngestor,
  Effect.gen(function* () {
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
        Effect.gen(function* (_) {
          // Check if user stars are stale (>1 minute)
          const isStale = yield* db.isUserStarsStale(userId, 1);
          
          if (!isStale) {
            // Return existing stars from database
            const existingStars = yield* db.getUserStars(userId);
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
          let allStars: StarredGithubRepo[] = [];
          
          while (true) {
            const stars = yield* githubClient.getUserStars(accessToken, page);
            if (stars.length === 0) break;
            
            allStars = [...allStars, ...stars];
            page++;
            
            // Prevent infinite loops - GitHub API typically returns max 400 pages
            if (page > 400) break;
          }

          // Create a stream that processes repos one by one
          return Stream.fromIterable(allStars).pipe(
            Stream.mapEffect((starredRepo) =>
              Effect.gen(function* (_) {
                const ghRepo = starredRepo.repo;
                // Check if repo is stale (>24 hours) before fetching details
                const isRepoStale = yield* db.isRepoStale(ghRepo.id, 24);
                
                let repoData = ghRepo;
                if (isRepoStale) {
                  // Fetch fresh repo details
                  repoData = yield* githubClient.getRepoDetails(accessToken, ghRepo.full_name);
                }

                // Transform and upsert repo
                const repo = transformGitHubRepoToRepo(repoData);
                const upsertedRepo = yield* db.upsertRepo(repo);

                // Upsert user star relationship
                yield* db.upsertUserStar({
                  userId,
                  repoId: ghRepo.id,
                  starredAt: starredRepo.starred_at ? new Date(starredRepo.starred_at) : new Date(),
                });

                return upsertedRepo;
              })
            )
          );
        })
      );

    return { ingestUserStars };
  })
);