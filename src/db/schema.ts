import { sql } from "drizzle-orm";
import * as sqlite from "drizzle-orm/sqlite-core";

// Main user table - compatible with Better Auth
export const user = sqlite.sqliteTable("user", {
  id: sqlite.text().primaryKey(),
  name: sqlite.text().notNull(),
  email: sqlite.text().notNull().unique(),
  emailVerified: sqlite.integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: sqlite.text(),
  createdAt: sqlite
    .integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: sqlite
    .integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
    // Admin plugin
  role: sqlite.text().notNull().default("user"),
  banned: sqlite.integer({ mode: "boolean" }).notNull().default(false),
  banReason: sqlite.text("ban_reason"),
  banExpires: sqlite.integer("ban_expires", { mode: "timestamp" }),
});

// GitHub-specific user data
export const githubUser = sqlite.sqliteTable("github_user", {
  userId: sqlite
    .text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  githubId: sqlite.text("github_id").notNull().unique(), // GitHub user ID
  login: sqlite.text().notNull(),
  accessToken: sqlite.text("access_token").notNull(),
  createdAt: sqlite
    .integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: sqlite
    .integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Better Auth session table
export const userSession = sqlite.sqliteTable("user_session", {
  id: sqlite.text().primaryKey(),
  expiresAt: sqlite.integer("expires_at", { mode: "timestamp" }).notNull(),
  token: sqlite.text().notNull().unique(),
  createdAt: sqlite.integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: sqlite.integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: sqlite.text("ip_address"),
  userAgent: sqlite.text("user_agent"),
  userId: sqlite
    .text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: sqlite.text("impersonated_by"),
});

// Better Auth account table
export const userAccount = sqlite.sqliteTable("user_account", {
  id: sqlite.text().primaryKey(),
  accountId: sqlite.text("account_id").notNull(),
  providerId: sqlite.text("provider_id").notNull(),
  userId: sqlite
    .text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: sqlite.text("access_token"),
  refreshToken: sqlite.text("refresh_token"),
  idToken: sqlite.text("id_token"),
  accessTokenExpiresAt: sqlite.integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: sqlite.integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: sqlite.text(),
  password: sqlite.text(),
  createdAt: sqlite.integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: sqlite.integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Better Auth verification table
export const authVerification = sqlite.sqliteTable("auth_verification", {
  id: sqlite.text().primaryKey(),
  identifier: sqlite.text().notNull(),
  value: sqlite.text().notNull(),
  expiresAt: sqlite.integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: sqlite.integer("created_at", { mode: "timestamp" }),
  updatedAt: sqlite.integer("updated_at", { mode: "timestamp" }),
});

// Application-specific tables
export const githubRepository = sqlite.sqliteTable("github_repository", {
  id: sqlite.integer().primaryKey(), // GitHub repo ID is a number
  name: sqlite.text().notNull(),
  owner: sqlite.text().notNull(),
  fullName: sqlite.text("full_name").notNull(),
  description: sqlite.text(),
  stars: sqlite.integer().notNull().default(0),
  language: sqlite.text(),
  lastFetchedAt: sqlite.integer("last_fetched_at", { mode: "timestamp" }),
  createdAt: sqlite
    .integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: sqlite
    .integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const githubUserStar = sqlite.sqliteTable(
  "github_user_star",
  {
    userId: sqlite
      .text("user_id")
      .notNull()
      .references(() => user.id),
    repoId: sqlite
      .integer("repo_id")
      .notNull()
      .references(() => githubRepository.id),
    starredAt: sqlite.integer("starred_at", { mode: "timestamp" }).notNull(),
    lastCheckedAt: sqlite
      .integer("last_checked_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    pk: sqlite.primaryKey({ columns: [t.userId, t.repoId] }),
  })
);

export type SelectableUser = typeof user.$inferSelect;
export type InsertableUser = typeof user.$inferInsert;
export type SelectableGithubUser = typeof githubUser.$inferSelect;
export type InsertableGithubUser = typeof githubUser.$inferInsert;
export type SelectableGithubRepository = typeof githubRepository.$inferSelect;
export type InsertableGithubRepository = typeof githubRepository.$inferInsert;
export type SelectableGithubUserStar = typeof githubUserStar.$inferSelect;
export type InsertableGithubUserStar = typeof githubUserStar.$inferInsert;
