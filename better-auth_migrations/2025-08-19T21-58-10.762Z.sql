alter table "user" add column "email_verified" integer not null;

alter table "user" add column "created_at" date not null;

alter table "user" add column "updated_at" date not null;

alter table "user" add column "role" text not null;

alter table "user" add column "banned" integer not null;

alter table "user" add column "ban_reason" text not null;

alter table "user" add column "ban_expires" date not null;

create table "user_session" ("id" text not null primary key, "expires_at" date not null, "token" text not null unique, "created_at" date not null, "updated_at" date not null, "ip_address" text, "user_agent" text, "user_id" text not null references "user" ("id") on delete cascade, "impersonated_by" text not null);

create table "user_account" ("id" text not null primary key, "account_id" text not null, "provider_id" text not null, "user_id" text not null references "user" ("id") on delete cascade, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" date, "scope" text, "password" text, "created_at" date not null, "updated_at" date not null);

create table "auth_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expires_at" date not null, "created_at" date, "updated_at" date);