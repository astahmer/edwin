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
import type {
  InsertableGithubRepository,
  InsertableGithubUser,
  InsertableGithubUserStar,
  InsertableUser,
  SelectableGithubRepository,
  SelectableGithubUser,
  SelectableGithubUserStar,
  SelectableUser,
} from "./schema";
import { SqliteDataTypePlugin } from "~/db/kysely.sqlite.plugin.js";

export interface Database {
  user: SelectableUser;
  github_user: SelectableGithubUser;
  github_repository: SelectableGithubRepository;
  github_user_star: SelectableGithubUserStar;
}

const dialect = new SqliteDialect({
  database: new BetterSqlite3(EnvConfig.DATABASE_URL),
});

export const kysely = new Kysely<Database>({
  dialect,
  plugins: [new SqliteDataTypePlugin()],
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
      upsertUser: (user: InsertableUser) =>
        Effect.tryPromise({
          try: async () => {
            const userValues = {
              ...user,
              email_verified: user.email_verified ?? false,
              role: user.role ?? "user",
              banned: user.banned ?? false,
              created_at: user.created_at || new Date(),
              updated_at: user.updated_at || new Date(),
            } satisfies InsertableUser;

            await kysely
              .insertInto("user")
              .values(userValues)
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  name: userValues.name,
                  email: userValues.email,
                  image: userValues.image,
                  updated_at: new Date(),
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
      upsertGithubUser: (githubUser: InsertableGithubUser) =>
        Effect.tryPromise({
          try: async () => {
            const githubUserValues = {
              ...githubUser,
              created_at: githubUser.created_at || new Date(),
              updated_at: githubUser.updated_at || new Date(),
            };

            await kysely
              .insertInto("github_user")
              .values(githubUserValues)
              .onConflict((oc) =>
                oc.column("user_id").doUpdateSet({
                  login: githubUserValues.login,
                  access_token: githubUserValues.access_token,
                  updated_at: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("github_user")
              .selectAll()
              .where("user_id", "=", githubUser.user_id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) =>
            new DatabaseUpsertUserError({ userId: githubUser.user_id, cause: error }),
        }),
      getGithubUser: (userId: string) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("github_user")
              .selectAll()
              .where("user_id", "=", userId)
              .executeTakeFirst(),
          catch: (error) => new DatabaseGetUserError({ userId, cause: error }),
        }),
      upsertRepo: (repo: InsertableGithubRepository) =>
        Effect.tryPromise({
          try: async () => {
            const repoValues = {
              ...repo,
              id: repo.id, // Ensure id is present as number
              created_at: repo.created_at || new Date(),
              updated_at: repo.updated_at || new Date(),
              last_fetched_at: repo.last_fetched_at || new Date(),
              stars: repo.stars ?? 0,
            } satisfies InsertableGithubRepository;

            await kysely
              .insertInto("github_repository")
              .values(repoValues)
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  name: repoValues.name,
                  owner: repoValues.owner,
                  full_name: repoValues.full_name,
                  description: repoValues.description,
                  stars: repoValues.stars,
                  language: repoValues.language,
                  last_fetched_at: new Date(),
                  updated_at: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("github_repository")
              .selectAll()
              .where("id", "=", repoValues.id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseUpsertRepoError({ repoId: repo.id || 0, cause: error }),
        }),
      upsertUserStar: (userStar: InsertableGithubUserStar) =>
        Effect.tryPromise({
          try: async () => {
            const userStarValues = {
              ...userStar,
              last_checked_at: userStar.last_checked_at || new Date(),
            } satisfies InsertableGithubUserStar;

            await kysely
              .insertInto("github_user_star")
              .values(userStarValues)
              .onConflict((oc) =>
                oc.columns(["user_id", "repo_id"]).doUpdateSet({
                  last_checked_at: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("github_user_star")
              .selectAll()
              .where("user_id", "=", userStar.user_id)
              .where("repo_id", "=", userStar.repo_id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) =>
            new DatabaseUpsertUserStarError({
              userId: userStar.user_id,
              repoId: userStar.repo_id,
              cause: error,
            }),
        }),
      batchUpsertRepos: (repos: InsertableGithubRepository[]) =>
        Effect.tryPromise({
          try: async () => {
            if (repos.length === 0) return [];

            const repoValues = repos.map((repo) => ({
              ...repo,
              id: repo.id, // Ensure id is present as number
              created_at: repo.created_at || new Date(),
              updated_at: repo.updated_at || new Date(),
              last_fetched_at: repo.last_fetched_at || new Date(),
              stars: repo.stars ?? 0,
            }));

            // Use transaction for batch operation
            return await kysely.transaction().execute(async (trx) => {
              const results = [];
              for (const repoValue of repoValues) {
                await trx
                  .insertInto("github_repository")
                  .values(repoValue)
                  .onConflict((oc) =>
                    oc.column("id").doUpdateSet({
                      name: repoValue.name,
                      owner: repoValue.owner,
                      full_name: repoValue.full_name,
                      description: repoValue.description,
                      stars: repoValue.stars,
                      language: repoValue.language,
                      last_fetched_at: new Date(),
                      updated_at: new Date(),
                    })
                  )
                  .execute();

                const result = await trx
                  .selectFrom("github_repository")
                  .selectAll()
                  .where("id", "=", repoValue.id)
                  .executeTakeFirstOrThrow();
                results.push(result);
              }
              return results;
            });
          },
          catch: (error) => new DatabaseUpsertRepoError({ repoId: 0, cause: error }),
        }),
      batchUpsertUserStars: (userStars: InsertableGithubUserStar[]) =>
        Effect.tryPromise({
          try: async () => {
            if (userStars.length === 0) return [];

            const userStarValues = userStars.map((userStar) => ({
              ...userStar,
              last_checked_at: userStar.last_checked_at || new Date(),
            }));

            // Use transaction for batch operation
            return await kysely.transaction().execute(async (trx) => {
              const results = [];
              for (const userStarValue of userStarValues) {
                await trx
                  .insertInto("github_user_star")
                  .values(userStarValue)
                  .onConflict((oc) =>
                    oc.columns(["user_id", "repo_id"]).doUpdateSet({
                      last_checked_at: new Date(),
                    })
                  )
                  .execute();

                const result = await trx
                  .selectFrom("github_user_star")
                  .selectAll()
                  .where("user_id", "=", userStarValue.user_id)
                  .where("repo_id", "=", userStarValue.repo_id)
                  .executeTakeFirstOrThrow();
                results.push(result);
              }
              return results;
            });
          },
          catch: (error) =>
            new DatabaseUpsertUserStarError({
              userId: "batch",
              repoId: 0,
              cause: error,
            }),
        }),
      searchUserStars: (
        userId: string,
        searchQuery?: string,
        language?: string,
        sortBy: "stars" | "name" | "date" = "date",
        sortOrder: "asc" | "desc" = "desc",
        limit = 100,
        offset = 0
      ) =>
        Effect.tryPromise({
          try: () => {
            let query = kysely
              .selectFrom("github_user_star")
              .innerJoin("github_repository", "github_repository.id", "github_user_star.repo_id")
              .selectAll()
              .where("github_user_star.user_id", "=", userId);

            // Apply search filter
            if (searchQuery?.trim()) {
              const search = `%${searchQuery.trim()}%`;
              query = query.where((eb) =>
                eb.or([
                  eb("github_repository.name", "like", search),
                  eb("github_repository.full_name", "like", search),
                  eb("github_repository.description", "like", search),
                  eb("github_repository.owner", "like", search),
                ])
              );
            } // Apply language filter
            if (language && language !== "all") {
              query = query.where("github_repository.language", "=", language);
            }

            // Apply sorting
            switch (sortBy) {
              case "stars":
                query = query.orderBy("github_repository.stars", sortOrder);
                break;
              case "name":
                query = query.orderBy("github_repository.name", sortOrder);
                break;
              case "date":
              default:
                query = query.orderBy("github_user_star.starred_at", sortOrder);
                break;
            }

            return query.limit(limit).offset(offset).execute();
          },
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),
      getUserStarsLanguages: (userId: string) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("github_user_star")
              .innerJoin("github_repository", "github_repository.id", "github_user_star.repo_id")
              .select("github_repository.language")
              .where("github_user_star.user_id", "=", userId)
              .where("github_repository.language", "is not", null)
              .groupBy("github_repository.language")
              .orderBy("github_repository.language", "asc")
              .execute(),
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),
      getUserStarsCount: (userId: string, searchQuery?: string, language?: string) =>
        Effect.tryPromise({
          try: () => {
            let query = kysely
              .selectFrom("github_user_star")
              .innerJoin("github_repository", "github_repository.id", "github_user_star.repo_id")
              .select((eb) => eb.fn.count("github_user_star.user_id").as("count"))
              .where("github_user_star.user_id", "=", userId);

            // Apply search filter
            if (searchQuery?.trim()) {
              const search = `%${searchQuery.trim()}%`;
              query = query.where((eb) =>
                eb.or([
                  eb("github_repository.name", "like", search),
                  eb("github_repository.full_name", "like", search),
                  eb("github_repository.description", "like", search),
                  eb("github_repository.owner", "like", search),
                ])
              );
            }

            // Apply language filter
            if (language && language !== "all") {
              query = query.where("github_repository.language", "=", language);
            }

            return query.executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),
      getUserStars: (userId: string, limit = 100, offset = 0) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("github_user_star")
              .innerJoin("github_repository", "github_repository.id", "github_user_star.repo_id")
              .selectAll()
              .where("github_user_star.user_id", "=", userId)
              .orderBy("github_user_star.starred_at", "desc")
              .limit(limit)
              .offset(offset)
              .execute(),
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),

      getMostRecentStarredAt: (userId: string) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("github_user_star")
              .select("starred_at")
              .where("user_id", "=", userId)
              .orderBy("starred_at", "desc")
              .limit(1)
              .executeTakeFirst()
              .then((result) => result?.starred_at),
          catch: (error) => new DatabaseGetUserStarsError({ userId, cause: error }),
        }),

      isUserStarsStale: (userId: string, staleMins: number) =>
        Effect.tryPromise({
          try: async () => {
            const result = await kysely
              .selectFrom("github_user_star")
              .select("last_checked_at")
              .where("user_id", "=", userId)
              .orderBy("last_checked_at", "desc")
              .executeTakeFirst();

            if (!result) return true;

            const staleTime = new Date(Date.now() - staleMins * 60 * 1000);
            return result.last_checked_at < staleTime;
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
              .selectFrom("github_repository")
              .select("last_fetched_at")
              .where("id", "=", repoId)
              .executeTakeFirst();

            if (!result || !result.last_fetched_at) return true;

            const staleTime = new Date(Date.now() - staleHours * 60 * 60 * 1000);
            return result.last_fetched_at < staleTime;
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
