import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // GitHub user ID
  login: text("login").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(), // GitHub repo ID
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  stars: integer("stars").notNull().default(0),
  language: text("language"),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const userStars = sqliteTable("user_stars", {
  userId: text("user_id").notNull().references(() => users.id),
  repoId: text("repo_id").notNull().references(() => repos.id),
  starredAt: integer("starred_at", { mode: "timestamp" }).notNull(),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.repoId] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type UserStar = typeof userStars.$inferSelect;
export type NewUserStar = typeof userStars.$inferInsert;