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

export interface DataSyncService {
  readonly syncUserStars: (userId: string, accessToken: string) => Effect.Effect<SyncResult, Error>;
  readonly getLastSyncTime: (userId: string) => Effect.Effect<Date | null, Error>;
  readonly isRepoSynced: (userId: string, repoId: number) => Effect.Effect<boolean, Error>;
}

export const DataSyncService = Context.GenericTag<DataSyncService>("DataSyncService");

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

export const DataSyncServiceLive = Layer.effect(
  DataSyncService,
  Effect.gen(function* (_) {
    const db = yield* _(DatabaseService);
    const githubClient = yield* _(GitHubClient);

    return {
      syncUserStars: (userId: string, accessToken: string) =>
        Effect.gen(function* (_) {
          console.log(`Starting sync for user ${userId}`);
          
          // Get all starred repos from GitHub
          const starredRepos = yield* _(githubClient.getAllUserStars(accessToken));
          console.log(`Fetched ${starredRepos.length} starred repos from GitHub`);

          // Get existing synced repos for this user
          const existingStars = yield* _(db.getUserStars(userId));
          const existingRepoIds = new Set(existingStars.map(star => star.repoId));
          
          let newRepos = 0;
          let updatedRepos = 0;

          for (const starredRepo of starredRepos) {
            const { repo, userStar } = transformStarredRepoToDb(starredRepo, userId);
            
            if (existingRepoIds.has(repo.id)) {
              // Update existing repo and user star
              yield* _(db.upsertRepo(repo));
              yield* _(db.upsertUserStar(userStar));
              updatedRepos++;
            } else {
              // Insert new repo and user star
              yield* _(db.upsertRepo(repo));
              yield* _(db.upsertUserStar(userStar));
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
        Effect.gen(function* (_) {
          const userStars = yield* _(db.getUserStars(userId));
          
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
        Effect.gen(function* (_) {
          const userStars = yield* _(db.getUserStars(userId));
          const isSync = userStars.some(star => star.repoId === repoId);
          return isSync;
        }),
    };
  })
);