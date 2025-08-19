import { Schema } from 'effect';

const envSchema = Schema.Struct({
    GITHUB_CLIENT_ID: Schema.String,
    GITHUB_CLIENT_SECRET: Schema.String,
    BETTER_AUTH_SECRET: Schema.String,
    DATABASE_URL: Schema.String,
});

export const EnvConfig = Schema.decodeUnknownSync(envSchema)(process.env);
