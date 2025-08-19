import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Effect, Layer, Context } from 'effect';
import type { User, Repo, UserStar, NewUser, NewRepo, NewUserStar } from './schema';

export interface Database {
  users: User;
  repos: Repo;
  user_stars: UserStar;
}

const dialect = new SqliteDialect({
  database: new Database('./edwin.db'),
});

export const kysely = new Kysely<Database>({
  dialect,
});

export interface DatabaseService {
  readonly db: Kysely<Database>;
  readonly getUser: (id: string) => Effect.Effect<User | undefined, Error>;
  readonly upsertUser: (user: NewUser) => Effect.Effect<User, Error>;
  readonly upsertRepo: (repo: NewRepo) => Effect.Effect<Repo, Error>;
  readonly upsertUserStar: (userStar: NewUserStar) => Effect.Effect<UserStar, Error>;
  readonly getUserStars: (userId: string, limit?: number, offset?: number) => Effect.Effect<Array<Repo & UserStar>, Error>;
  readonly isUserStarsStale: (userId: string, staleMins: number) => Effect.Effect<boolean, Error>;
  readonly isRepoStale: (repoId: string, staleHours: number) => Effect.Effect<boolean, Error>;
}

export const DatabaseService = Context.GenericTag<DatabaseService>('DatabaseService');

export const DatabaseLive = Layer.succeed(
  DatabaseService,
  {
    db: kysely,
    getUser: (id: string) =>
      Effect.tryPromise({
        try: () => kysely.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst(),
        catch: (error) => new Error(`Failed to get user: ${error}`),
      }),
    upsertUser: (user: NewUser) =>
      Effect.tryPromise({
        try: async () => {
          const userValues = {
            ...user,
            createdAt: user.createdAt || new Date(),
            updatedAt: user.updatedAt || new Date(),
          };
          
          await kysely
            .insertInto('users')
            .values(userValues)
            .onConflict((oc) => 
              oc.column('id').doUpdateSet({
                login: userValues.login,
                accessToken: userValues.accessToken,
                updatedAt: new Date(),
              })
            )
            .execute();
          return await kysely.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();
        },
        catch: (error) => new Error(`Failed to upsert user: ${error}`),
      }),
    upsertRepo: (repo: NewRepo) =>
      Effect.tryPromise({
        try: async () => {
          const repoValues = {
            ...repo,
            createdAt: repo.createdAt || new Date(),
            updatedAt: repo.updatedAt || new Date(),
            lastFetchedAt: repo.lastFetchedAt || new Date(),
            stars: repo.stars ?? 0,
          };
          
          await kysely
            .insertInto('repos')
            .values(repoValues)
            .onConflict((oc) =>
              oc.column('id').doUpdateSet({
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
          return await kysely.selectFrom('repos').selectAll().where('id', '=', repo.id).executeTakeFirstOrThrow();
        },
        catch: (error) => new Error(`Failed to upsert repo: ${error}`),
      }),
    upsertUserStar: (userStar: NewUserStar) =>
      Effect.tryPromise({
        try: async () => {
          const userStarValues = {
            ...userStar,
            lastCheckedAt: userStar.lastCheckedAt || new Date(),
          };
          
          await kysely
            .insertInto('user_stars')
            .values(userStarValues)
            .onConflict((oc) =>
              oc.columns(['userId', 'repoId']).doUpdateSet({
                lastCheckedAt: new Date(),
              })
            )
            .execute();
          return await kysely
            .selectFrom('user_stars')
            .selectAll()
            .where('userId', '=', userStar.userId)
            .where('repoId', '=', userStar.repoId)
            .executeTakeFirstOrThrow();
        },
        catch: (error) => new Error(`Failed to upsert user star: ${error}`),
      }),
    getUserStars: (userId: string, limit = 100, offset = 0) =>
      Effect.tryPromise({
        try: () => 
          kysely
            .selectFrom('user_stars')
            .innerJoin('repos', 'repos.id', 'user_stars.repoId')
            .selectAll()
            .where('user_stars.userId', '=', userId)
            .orderBy('user_stars.starredAt', 'desc')
            .limit(limit)
            .offset(offset)
            .execute(),
        catch: (error) => new Error(`Failed to get user stars: ${error}`),
      }),
    isUserStarsStale: (userId: string, staleMins: number) =>
      Effect.tryPromise({
        try: async () => {
          const result = await kysely
            .selectFrom('user_stars')
            .select('lastCheckedAt')
            .where('userId', '=', userId)
            .orderBy('lastCheckedAt', 'desc')
            .executeTakeFirst();
          
          if (!result) return true;
          
          const staleTime = new Date(Date.now() - (staleMins * 60 * 1000));
          return result.lastCheckedAt < staleTime;
        },
        catch: (error) => new Error(`Failed to check if user stars are stale: ${error}`),
      }),
    isRepoStale: (repoId: string, staleHours: number) =>
      Effect.tryPromise({
        try: async () => {
          const result = await kysely
            .selectFrom('repos')
            .select('lastFetchedAt')
            .where('id', '=', repoId)
            .executeTakeFirst();
          
          if (!result || !result.lastFetchedAt) return true;
          
          const staleTime = new Date(Date.now() - (staleHours * 60 * 60 * 1000));
          return result.lastFetchedAt < staleTime;
        },
        catch: (error) => new Error(`Failed to check if repo is stale: ${error}`),
      }),
  }
);