---

## 📋 Plan (pinned for reference)

1. Database layer
 • Define schema with Drizzle.
 • Generate migrations.
 • Use Kysely for queries, wrapped in Effect.
2. Auth layer
 • Configure better-auth with GitHub provider.
 • Store user in users table.
 • Session cookie handled by better-auth.
3. Repo ingestion
 • StarIngestor: fetch user’s starred repos (if >1min since last check).
 • RepoFetcher: fetch repo details (if >24h since last fetch).
 • Deduplicate across users.
4. Streaming
 • SSE endpoint /stars/stream.
 • Streams repos as they are ingested.
 • Supports resumability via Last-Event-ID.
5. Frontend (TanStack Start + shadcn/ui)
 • /login → GitHub login.
 • /stars → SSE stream of repos.


---

## 🗄 Database Schema (Drizzle)

// filepath: /db/schema.ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // GitHub user ID
  login: text("login").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(), // GitHub repo ID
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  description: text("description"),
  stars: integer("stars"),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
});

export const userStars = sqliteTable(
  "user_stars",
  {
    userId: text("user_id").notNull().references(() => users.id),
    repoId: text("repo_id").notNull().references(() => repos.id),
    starredAt: integer("starred_at", { mode: "timestamp" }),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.repoId] }),
  })
);

---

## ⚡ Effect Services (Implementation)

### GitHub Client

// filepath: /services/GitHubClient.ts
import { Effect, Layer } from "effect";

export interface Repo {
  id: string;
  name: string;
  owner: string;
  description?: string;
  stars: number;
}

export class GitHubClient extends Effect.Service<GitHubClient>()("GitHubClient", {
  effect: {
    getUserStars: (accessToken: string, page = 1) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(`https://api.github.com/user/starred?page=${page}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error("GitHub API error");
          return res.json();
        },
        catch: (e) => new Error(String(e)),
      }),
     getRepoDetails: (accessToken: string, fullName: string) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(`https://api.github.com/repos/${fullName}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error("GitHub API error");
          return res.json();
        },
        catch: (e) => new Error(String(e)),
      }),
  },
}) {}

---

### Star Ingestor

// filepath: /services/StarIngestor.ts
import { Effect, Layer } from "effect";
import { GitHubClient } from "./GitHubClient";
import { db } from "../db/kysely";

export class StarIngestor extends Effect.Service<StarIngestor>()("StarIngestor", {
  effect: {
    ingestUserStars: (userId: string, accessToken: string) =>
      Effect.gen(function* (_) {
        const gh = yield* _(GitHubClient);
        const stars = yield* _(gh.getUserStars(accessToken));

        for (const repo of stars) {
          // Upsert repo if stale (>24h)
          yield* _(
            db
              .insertInto("repos")
              .values({
                id: repo.id,
                name: repo.name,
                owner: repo.owner.login,
                description: repo.description,
                stars: repo.stargazers_count,
                lastFetchedAt: Date.now(),
              })
              .onConflict((oc) =>
                oc.column("id").doUpdateSet({
                  lastFetchedAt: Date.now(),
                })
              )
              .execute()
          );

          // Upsert user_stars if stale (>1min)
          yield* _(
            db
              .insertInto("user_stars")
              .values({
                userId,
                repoId: repo.id,
                starredAt: new Date(repo.starred_at).getTime(),
                lastCheckedAt: Date.now(),
              })
              .onConflict((oc) =>
                oc.columns(["user_id", "repo_id"]).doUpdateSet({
                  lastCheckedAt: Date.now(),
                })
              )
              .execute()
          );
        }

        return stars;
      }),
  },
}) {}

---

### Streaming Service (SSE)

// filepath: /services/StreamService.ts
import { Effect, Stream } from "effect";
import { StarIngestor } from "./StarIngestor";

export class StreamService extends Effect.Service<StreamService>()("StreamService", {
  effect: {
    streamStars: (userId: string, accessToken: string, lastEventId?: string) =>
      Stream.fromEffect(
        StarIngestor.ingestUserStars(userId, accessToken)
      ).pipe(
       Stream.flatMap((repos) =>
          Stream.fromIterable(repos).pipe(
            Stream.dropWhile((r) => lastEventId && r.id <= lastEventId)
          )
        )
      ),
  },
}) {}

---

## 🌐 HttpApiBuilder Routes

// filepath: /api/index.ts
import { HttpApiBuilder } from "@effect/platform";
import { StreamService } from "../services/StreamService";
import { betterAuth } from "better-auth";

export const api = HttpApiBuilder.make()
  .get("/stars/stream", ({ req, res }) =>
    Effect.gen(function* (_) {
      const user = yield* _(betterAuth.getUser(req));
      if (!user) return res.status(401).send("Unauthorized");

      const stream = yield* _(
        StreamService.streamStars(user.id, user.accessToken, req.headers["last-event-id"])
      );

      return res.sse(stream, (repo) => ({
        id: repo.id,
        data: JSON.stringify(repo),
      }));
    })
  );

---

## ✅ Next Steps

• Wire up better-auth GitHub provider.
• Implement frontend routes in TanStack Start (/login, /stars).
• Add shadcn/ui components for repo list.
