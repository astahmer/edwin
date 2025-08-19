import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Effect, Layer, Context } from 'effect';
import type { User, Repo, UserStar } from './schema';

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
}

export const DatabaseService = Context.GenericTag<DatabaseService>('DatabaseService');

export const DatabaseLive = Layer.succeed(
  DatabaseService,
  {
    db: kysely,
  }
);