import BetterSqlite3 from "better-sqlite3";
import { Effect } from "effect";
import { Kysely, SqliteDialect } from "kysely";
import { EnvConfig } from "../env.config.js";
import {
  DatabaseGetUserError,
  DatabaseGetUserStarsError,
  DatabaseStaleCheckError,
  DatabaseUpsertRepoError,
  DatabaseUpsertUserError,
  DatabaseUpsertUserStarError,
} from "../errors";
import type { NewRepo, NewUser, NewUserStar, Repo, User, UserStar } from "./schema";

export interface Database {
  user: User;
  repo: Repo;
  user_star: UserStar;
}

const dialect = new SqliteDialect({
  database: new BetterSqlite3(EnvConfig.DATABASE_URL),
});

export const kysely = new Kysely<Database>({
  dialect,
});

export class DatabaseService extends Effect.Service<DatabaseService>()("DatabaseService", {
  effect: Effect.gen(function* () {
    return {
      db: kysely,
      getUser: (id: string) =>
        Effect.tryPromise({
          try: () => kysely.selectFrom("user").selectAll().where("id", "=", id).executeTakeFirst(),
          catch: (error) => new DatabaseGetUserError({ userId: id, cause: error }),
        }),
      upsertUser: (user: NewUser) =>
        Effect.tryPromise({
          try: async () => {
            const userValues = {
              ...user,
              emailVerified: user.emailVerified ?? false,
              role: user.role ?? "user",
              banned: user.banned ?? false,
              createdAt: user.createdAt || new Date(),
              updatedAt: user.updatedAt || new Date(),
            };

            await kysely
              .insertInto("user")
              .values(userValues)
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  login: userValues.login,
                  accessToken: userValues.accessToken,
                  updatedAt: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("user")
              .selectAll()
              .where("id", "=", user.id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseUpsertUserError({ userId: user.id, cause: error }),
        }),
      upsertRepo: (repo: NewRepo) =>
        Effect.tryPromise({
          try: async () => {
            const repoValues = {
              ...repo,
              id: repo.id ?? Date.now(), // Ensure id is present as number
              createdAt: repo.createdAt || new Date(),
              updatedAt: repo.updatedAt || new Date(),
              lastFetchedAt: repo.lastFetchedAt || new Date(),
              stars: repo.stars ?? 0,
            };

            await kysely
              .insertInto("repo")
              .values(repoValues)
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  name: repoValues.name,
                  owner: repoValues.owner,
                  fullName: repoValues.fullName,
                  description: repoValues.description,
                  stars: repoValues.stars,
                  language: repoValues.language,
                  lastFetchedAt: new Date(),
                  updatedAt: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("repo")
              .selectAll()
              .where("id", "=", repoValues.id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseUpsertRepoError({ repoId: repo.id || 0, cause: error }),
        }),
      upsertUserStar: (userStar: NewUserStar) =>
        Effect.tryPromise({
          try: async () => {
            const userStarValues = {
              ...userStar,
              lastCheckedAt: userStar.lastCheckedAt || new Date(),
            };

            await kysely
              .insertInto("user_star")
              .values(userStarValues)
              .onConflict((oc) =>
                oc.columns(["userId", "repoId"]).doUpdateSet({
                  lastCheckedAt: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("user_star")
              .selectAll()
              .where("userId", "=", userStar.userId)
              .where("repoId", "=", userStar.repoId)
              .executeTakeFirstOrThrow();
          },
          catch: (error) =>
            new DatabaseUpsertUserStarError({
              userId: userStar.userId,
              repoId: userStar.repoId,
              cause: error,
            }),
        }),
      getUserStars: (userId: string, limit = 100, offset = 0) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("user_star")
              .innerJoin("repo", "repo.id", "user_star.repoId")
              .selectAll()
              .where("user_star.userId", "=", userId)
              .orderBy("user_star.starredAt", "desc")
              .limit(limit)
              .offset(offset)
              .execute(),
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),
      isUserStarsStale: (userId: string, staleMins: number) =>
        Effect.tryPromise({
          try: async () => {
            const result = await kysely
              .selectFrom("user_star")
              .select("lastCheckedAt")
              .where("userId", "=", userId)
              .orderBy("lastCheckedAt", "desc")
              .executeTakeFirst();

            if (!result) return true;

            const staleTime = new Date(Date.now() - staleMins * 60 * 1000);
            return result.lastCheckedAt < staleTime;
          },
          catch: (error) =>
            new DatabaseStaleCheckError({
              type: "user",
              id: userId,
              cause: error,
            }),
        }),
      isRepoStale: (repoId: number, staleHours: number) =>
        Effect.tryPromise({
          try: async () => {
            const result = await kysely
              .selectFrom("repo")
              .select("lastFetchedAt")
              .where("id", "=", repoId)
              .executeTakeFirst();

            if (!result || !result.lastFetchedAt) return true;

            const staleTime = new Date(Date.now() - staleHours * 60 * 60 * 1000);
            return result.lastFetchedAt < staleTime;
          },
          catch: (error) =>
            new DatabaseStaleCheckError({
              type: "repo",
              id: repoId,
              cause: error,
            }),
        }),
    };
  }),
}) {}
