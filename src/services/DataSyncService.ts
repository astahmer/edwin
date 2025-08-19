import { Effect, Context, Layer } from "effect";
import { DatabaseService } from "../db/kysely";
import { GitHubClient, StarredGithubRepo } from "./GitHubClient";
import type { NewRepo, NewUserStar } from "../db/schema";

export interface SyncResult {
  totalFetched: number;
  newRepos: number;
  updatedRepos: number;
  lastSyncAt: Date;
}

export class DataSyncService extends Effect.Service<DataSyncService>()("DataSyncService", {
  effect: Effect.gen(function* () {
    const db = yield* DatabaseService;
    const githubClient = yield* GitHubClient;

    const transformStarredRepoToDb = (starredRepo: StarredGithubRepo, userId: string) => {
  const repo = starredRepo.repo;
  return {
    repo: {
      id: repo.id, // Keep as number
      name: repo.name,
      owner: repo.owner.login,
      fullName: repo.full_name,
      description: repo.description || null,
      stars: repo.stargazers_count,
      language: repo.language || null,
      lastFetchedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NewRepo,
    userStar: {
      userId,
      repoId: repo.id, // Keep as number
      starredAt: new Date(starredRepo.starred_at),
      lastCheckedAt: new Date(),
    } as NewUserStar
  };
};

    return {
      syncUserStars: (userId: string, accessToken: string) =>
        Effect.gen(function* () {
          console.log(`Starting sync for user ${userId}`);

          // Get all starred repos from GitHub
          const starredRepos = yield* githubClient.getAllUserStars(accessToken);
          console.log(`Fetched ${starredRepos.length} starred repos from GitHub`);

          // Get existing synced repos for this user
          const existingStars = yield* db.getUserStars(userId);
          const existingRepoIds = new Set(existingStars.map(star => star.repoId));

          let newRepos = 0;
          let updatedRepos = 0;

          for (const starredRepo of starredRepos) {
            const { repo, userStar } = transformStarredRepoToDb(starredRepo, userId);

            if (repo.id && existingRepoIds.has(repo.id)) {
              // Update existing repo and user star
              yield* db.upsertRepo(repo);
              yield* db.upsertUserStar(userStar);
              updatedRepos++;
            } else {
              // Insert new repo and user star
              yield* db.upsertRepo(repo);
              yield* db.upsertUserStar(userStar);
              newRepos++;
            }
          }

          console.log(`Sync complete: ${newRepos} new, ${updatedRepos} updated`);

          return {
            totalFetched: starredRepos.length,
            newRepos,
            updatedRepos,
            lastSyncAt: new Date(),
          };
        }),

      getLastSyncTime: (userId: string) =>
        Effect.gen(function* () {
          const userStars = yield* db.getUserStars(userId);

          if (userStars.length === 0) {
            return null;
          }

          // Find the most recent lastCheckedAt time
          const mostRecent = userStars.reduce((latest, star) =>
            star.lastCheckedAt > latest ? star.lastCheckedAt : latest
          , userStars[0].lastCheckedAt);

          return mostRecent;
        }),

      isRepoSynced: (userId: string, repoId: number) =>
        Effect.gen(function* () {
          const userStars = yield* db.getUserStars(userId);
          const isSync = userStars.some(star => star.repoId === repoId);
          return isSync;
        }),
    };
  })
}) {}
