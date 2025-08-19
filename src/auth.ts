import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database("./edwin.db"),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // scope: ["read:user", "read:repo", "user:email"],
      scope: ["read:user"],
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  // trustedOrigins: ["http://localhost:3000"],
  trustedOrigins: ["*"],
});

export type Session = typeof auth.$Infer.Session;
