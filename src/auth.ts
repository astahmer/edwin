import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { EnvConfig } from "./env.config.js";

export const auth = betterAuth({
  database: new Database(EnvConfig.DATABASE_URL),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      scope: ["read:user"],
    },
  },
  secret: process.env.BETTER_AUTH_SECRET || "",
  // trustedOrigins: ["http://localhost:3000"],
  trustedOrigins: ["*"],
  user: {
    modelName: "user",
    fields: {
      name: "name",
      email: "email",
      image: "image",
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      role: "role",
      banned: "banned",
      banReason: "ban_reason",
      banExpires: "ban_expires",
    },
    additionalFields: {
      role: { type: "string", defaultValue: "user" },
      banned: { type: "boolean", fieldName: "banned", defaultValue: false },
      banReason: { type: "string", fieldName: "ban_reason" },
      banExpires: { type: "date", fieldName: "ban_expires" },
    },
  },
  session: {
    modelName: "user_session",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      token: "token",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      activeOrganizationId: "active_organization_id",
      impersonatedBy: "impersonated_by",
    },
    additionalFields: {
      impersonatedBy: { type: "string", fieldName: "impersonated_by" },
    },
  },
  account: {
    modelName: "user_account",
    fields: {
      userId: "user_id",
      providerId: "provider_id",
      accountId: "account_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      scope: "scope",
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verification",
    fields: {
      identifier: "identifier",
      value: "value",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  passkey: {
    modelName: "auth_passkey",
    fields: {
      userId: "user_id",
      name: "name",
      publicKey: "public_key",
      credentialID: "credential_id",
      counter: "counter",
      deviceType: "device_type",
      backedUp: "backed_up",
      transports: "transports",
      createdAt: "created_at",
    },
  },
});

export type Session = typeof auth.$Infer.Session;
