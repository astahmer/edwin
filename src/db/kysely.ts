import BetterSqlite3 from "better-sqlite3";
import { Effect } from "effect";
import { Kysely, SqliteDialect } from "kysely";
import { EnvConfig } from "../env.config.ts";
import {
  DatabaseGetUserError,
  DatabaseGetUserStarsError,
  DatabaseStaleCheckError,
  DatabaseUpsertRepoError,
  DatabaseUpsertUserError,
  DatabaseUpsertUserStarError,
} from "../errors.ts";
import { SqliteDataTypePlugin } from "./kysely.sqlite.plugin.ts";
import type {
  InsertableGithubRepository,
  InsertableGithubUser,
  InsertableGithubUserStar,
  InsertableUser,
  SelectableGithubRepository,
  SelectableGithubUser,
  SelectableGithubUserStar,
  SelectableUser,
} from "./schema.ts";

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
      upsertUser: (input: InsertableUser) =>
        Effect.tryPromise({
          try: async () => {
            const insertable = {
              ...input,
              email_verified: input.email_verified ?? false,
              role: input.role ?? "user",
              banned: input.banned ?? false,
              created_at: input.created_at || new Date(),
              updated_at: input.updated_at || new Date(),
            } satisfies InsertableUser;

            await kysely
              .insertInto("user")
              .values(insertable)
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  name: insertable.name,
                  email: insertable.email,
                  image: insertable.image,
                  updated_at: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("user")
              .selectAll()
              .where("id", "=", input.id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseUpsertUserError({ userId: input.id, cause: error }),
        }),
      upsertGithubUser: (input: InsertableGithubUser) =>
        Effect.tryPromise({
          try: async () => {
            const insertable = {
              ...input,
              created_at: input.created_at || new Date(),
              updated_at: input.updated_at || new Date(),
            } satisfies InsertableGithubUser;

            await kysely
              .insertInto("github_user")
              .values(insertable)
              .onConflict((oc) =>
                oc.column("user_id").doUpdateSet({
                  login: insertable.login,
                  access_token: insertable.access_token,
                  updated_at: new Date(),
                })
              )
              .execute();
            return await kysely
              .selectFrom("github_user")
              .selectAll()
              .where("user_id", "=", input.user_id)
              .executeTakeFirstOrThrow();
          },
          catch: (error) => new DatabaseUpsertUserError({ userId: input.user_id, cause: error }),
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
      batchUpsertRepos: (inputList: InsertableGithubRepository[]) =>
        Effect.tryPromise({
          try: async () => {
            if (inputList.length === 0) return [];

            const now = new Date();
            const insertableList = inputList.map((repo) => ({
              ...repo,
              id: repo.id, // Ensure id is present as number
              created_at: repo.created_at || now,
              updated_at: repo.updated_at || now,
              pushed_at: repo.pushed_at || now,
              last_fetched_at: repo.last_fetched_at || now,
              raw: repo.raw,
            })) satisfies InsertableGithubRepository[];

            return await kysely.transaction().execute(async (trx) => {
              await trx
                .insertInto("github_repository")
                .values(insertableList)
                .onConflict((oc) =>
                  oc.column("id").doUpdateSet((eb) => ({
                    name: eb.ref("excluded.name"),
                    description: eb.ref("excluded.description"),
                    full_name: eb.ref("excluded.full_name"),
                    stargazers_count: eb.ref("excluded.stargazers_count"),
                    pushed_at: eb.ref("excluded.pushed_at"),
                    archived: eb.ref("excluded.archived"),
                    last_fetched_at: new Date(),
                    topics: eb.ref("excluded.topics"),
                    raw: eb.ref("excluded.raw"),
                    updated_at: eb.ref("excluded.updated_at"),
                  }))
                )
                .execute();
            });
          },
          catch: (error) => new DatabaseUpsertRepoError({ repoId: 0, cause: error }),
        }),
      batchUpsertUserStars: (inputList: InsertableGithubUserStar[]) =>
        Effect.tryPromise({
          try: async () => {
            if (inputList.length === 0) return [];

            const insertableList = inputList.map((userStar) => ({
              ...userStar,
              last_checked_at: userStar.last_checked_at || new Date(),
            }));

            return await kysely.transaction().execute(async (trx) => {
              await trx
                .insertInto("github_user_star")
                .values(insertableList)
                .onConflict((oc) =>
                  oc.columns(["user_id", "repo_id"]).doUpdateSet({
                    last_checked_at: new Date(),
                  })
                )
                .execute();
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
                query = query.orderBy("github_repository.stargazers_count", sortOrder);
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
      getUserStarsCount: (userId: string, limit = 100, offset = 0) =>
        Effect.tryPromise({
          try: () =>
            kysely
              .selectFrom("github_user_star")
              .select((eb) => eb.fn.count("github_user_star.user_id").as("count"))
              .where("github_user_star.user_id", "=", userId)
              .orderBy("github_user_star.starred_at", "desc")
              .limit(limit)
              .offset(offset)
              .executeTakeFirstOrThrow()
              .then((res) => Number(res.count ?? 0) ?? 0),
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
