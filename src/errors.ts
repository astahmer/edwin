import { Data } from "effect";

// GitHub API related errors
export class GitHubRateLimitError extends Data.TaggedError("GitHubRateLimitError")<{
  retryAfter: number;
  message: string;
}> {}

export class GitHubAuthError extends Data.TaggedError("GitHubAuthError")<{
  message: string;
}> {}

export class GitHubApiError extends Data.TaggedError("GitHubApiError")<{
  status: number;
  message: string;
}> {}

export class GitHubRequestError extends Data.TaggedError("GitHubRequestError")<{
  cause: unknown;
  message: string;
}> {}

// Database related errors
export class DatabaseGetUserError extends Data.TaggedError("DatabaseGetUserError")<{
  userId: string;
  cause: unknown;
}> {}

export class DatabaseUpsertUserError extends Data.TaggedError("DatabaseUpsertUserError")<{
  userId: string;
  cause: unknown;
}> {}

export class DatabaseUpsertRepoError extends Data.TaggedError("DatabaseUpsertRepoError")<{
  repoId: number;
  cause: unknown;
}> {}

export class DatabaseUpsertUserStarError extends Data.TaggedError("DatabaseUpsertUserStarError")<{
  userId: string;
  repoId: number;
  cause: unknown;
}> {}

export class DatabaseGetUserStarsError extends Data.TaggedError("DatabaseGetUserStarsError")<{
  userId: string;
  cause: unknown;
}> {}

export class DatabaseStaleCheckError extends Data.TaggedError("DatabaseStaleCheckError")<{
  type: "user" | "repo";
  id: string | number;
  cause: unknown;
}> {}

// Union types for easier error handling
export type GitHubError =
  | GitHubRateLimitError
  | GitHubAuthError
  | GitHubApiError
  | GitHubRequestError;
export type DatabaseError =
  | DatabaseGetUserError
  | DatabaseUpsertUserError
  | DatabaseUpsertRepoError
  | DatabaseUpsertUserStarError
  | DatabaseGetUserStarsError
  | DatabaseStaleCheckError;
export type AppError = GitHubError | DatabaseError;
