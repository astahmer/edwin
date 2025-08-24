import { sql } from "drizzle-orm";
import * as sqlite from "drizzle-orm/sqlite-core";

const timestamp = () => sqlite.integer({ mode: "timestamp" });
const timestampWithDefault = () =>
  sqlite.integer({ mode: "timestamp" }).default(sql`(unixepoch())`);
const boolean = () => sqlite.integer({ mode: "boolean" });
const json = () => sqlite.text({ mode: "json" });

/* -----------------------------------------------------------------------------
 * Better Auth tables
 * -----------------------------------------------------------------------------*/
export const user = sqlite.sqliteTable("user", {
  id: sqlite.text().primaryKey(),
  name: sqlite.text().notNull(),
  email: sqlite.text().notNull().unique(),
  email_verified: boolean().notNull().default(false),
  image: sqlite.text(),
  created_at: timestampWithDefault().notNull(),
  updated_at: timestampWithDefault().notNull(),
  // Admin plugin
  role: sqlite.text().notNull().default("user"),
  banned: boolean().notNull().default(false),
  ban_reason: sqlite.text(),
  ban_expires: timestamp(),
});

export const userSession = sqlite.sqliteTable("user_session", {
  id: sqlite.text().primaryKey(),
  expires_at: timestamp().notNull(),
  token: sqlite.text().notNull().unique(),
  created_at: timestamp().notNull(),
  updated_at: timestamp().notNull(),
  ip_address: sqlite.text(),
  user_agent: sqlite.text(),
  user_id: sqlite
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonated_by: sqlite.text(),
});

export const userAccount = sqlite.sqliteTable("user_account", {
  id: sqlite.text().primaryKey(),
  account_id: sqlite.text().notNull(),
  provider_id: sqlite.text().notNull(),
  user_id: sqlite
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  access_token: sqlite.text(),
  refresh_token: sqlite.text(),
  id_token: sqlite.text(),
  access_token_expires_at: timestamp(),
  refresh_token_expires_at: timestamp(),
  scope: sqlite.text(),
  password: sqlite.text(),
  created_at: timestamp().notNull(),
  updated_at: timestamp().notNull(),
});

export const authVerification = sqlite.sqliteTable("auth_verification", {
  id: sqlite.text().primaryKey(),
  identifier: sqlite.text().notNull(),
  value: sqlite.text().notNull(),
  expires_at: timestamp().notNull(),
  created_at: timestamp(),
  updated_at: timestamp(),
});

/* -----------------------------------------------------------------------------
 * GitHub-specific user data
 * -----------------------------------------------------------------------------*/
export const githubUser = sqlite.sqliteTable("github_user", {
  user_id: sqlite
    .text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  github_id: sqlite.text().notNull().unique(), // GitHub user ID
  login: sqlite.text().notNull(),
  avatar_url: sqlite.text(),
  access_token: sqlite.text().notNull(),
  //
  created_at: timestampWithDefault().notNull(),
  updated_at: timestampWithDefault().notNull(),
  raw: json().$type(),
});

export const githubRepository = sqlite.sqliteTable(
  "github_repository",
  {
    id: sqlite.integer().primaryKey(), // GitHub repo ID is a number
    name: sqlite.text().notNull(),
    owner: sqlite.text().notNull(),
    full_name: sqlite.text().notNull(),
    description: sqlite.text(),
    private: boolean().notNull(),
    stargazers_count: sqlite.integer().notNull().default(0),
    language: sqlite.text().notNull(),
    topics: sqlite.text().notNull(),
    created_at: timestampWithDefault().notNull(),
    updated_at: timestampWithDefault().notNull(),
    pushed_at: timestampWithDefault().notNull(),
    archived: boolean().notNull(),
    //
    last_fetched_at: timestamp(),
    raw: json().$type(),
  },
  (self) => [
    sqlite.index("idx_github_repository_name").on(self.name),
    sqlite.index("idx_github_repository_owner").on(self.owner),
    sqlite.index("idx_github_repository_full_name").on(self.full_name),
    sqlite.index("idx_github_repository_stargazers_count").on(self.stargazers_count),
    sqlite.index("idx_github_repository_pushed_at").on(self.pushed_at),
  ]
);

export const githubUserStar = sqlite.sqliteTable(
  "github_user_star",
  {
    user_id: sqlite
      .text()
      .notNull()
      .references(() => user.id),
    repo_id: sqlite
      .integer()
      .notNull()
      .references(() => githubRepository.id),
    starred_at: timestamp().notNull(),
    //
    last_checked_at: timestampWithDefault().notNull(),
  },
  (t) => ({
    pk: sqlite.primaryKey({ columns: [t.user_id, t.repo_id] }),
  })
);

export type SelectableUser = typeof user.$inferSelect;
export type InsertableUser = typeof user.$inferInsert;
export type SelectableGithubUser = typeof githubUser.$inferSelect;
export type InsertableGithubUser = typeof githubUser.$inferInsert;
export type SelectableGithubRepository = typeof githubRepository.$inferSelect;
export type InsertableGithubRepository = typeof githubRepository.$inferInsert & {
  id: SelectableGithubRepository["id"];
};
export type SelectableGithubUserStar = typeof githubUserStar.$inferSelect;
export type InsertableGithubUserStar = typeof githubUserStar.$inferInsert;
