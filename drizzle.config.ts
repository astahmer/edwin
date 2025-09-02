import { defineConfig } from "drizzle-kit";
import { EnvConfig } from "~/env.config";

console.log(
  EnvConfig.TURSO_AUTH_TOKEN ? "Using remote Turso database" : "Using local SQLite database",
  EnvConfig.DATABASE_URL
);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: EnvConfig.TURSO_AUTH_TOKEN ? "turso" : "sqlite",
  dbCredentials: {
    url: EnvConfig.DATABASE_URL,
    authToken: EnvConfig.TURSO_AUTH_TOKEN,
  },
});
