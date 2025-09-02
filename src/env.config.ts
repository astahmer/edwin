import { Schema } from "effect";

const envSchema = Schema.Struct({
  GITHUB_CLIENT_ID: Schema.String,
  GITHUB_CLIENT_SECRET: Schema.String,
  BETTER_AUTH_SECRET: Schema.String,
  DATABASE_URL: Schema.String,
  TURSO_AUTH_TOKEN: Schema.optional(Schema.String), // Optional for remote Turso connections
});

export const EnvConfig = Schema.decodeUnknownSync(envSchema)(process.env);
