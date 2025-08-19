import { Effect, Context, Layer } from "effect";

export interface GitHubRepo {
  id: string;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  description?: string;
  stargazers_count: number;
  language?: string;
  starred_at?: string;
}

export interface GitHubUser {
  id: string;
  login: string;
}

export interface GitHubClient {
  readonly getUserStars: (accessToken: string, page?: number) => Effect.Effect<GitHubRepo[], Error>;
  readonly getRepoDetails: (accessToken: string, fullName: string) => Effect.Effect<GitHubRepo, Error>;
  readonly getAuthenticatedUser: (accessToken: string) => Effect.Effect<GitHubUser, Error>;
}

export const GitHubClient = Context.GenericTag<GitHubClient>("GitHubClient");

const makeGitHubRequest = <T>(url: string, accessToken: string) =>
  Effect.tryPromise({
    try: async (): Promise<T> => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3.star+json",
          "User-Agent": "Edwin-Stars-Organizer",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error (${response.status}): ${error}`);
      }

      return await response.json();
    },
    catch: (error) => new Error(`GitHub API request failed: ${String(error)}`),
  });

export const GitHubClientLive = Layer.succeed(GitHubClient, {
  getUserStars: (accessToken: string, page = 1) =>
    makeGitHubRequest<GitHubRepo[]>(
      `https://api.github.com/user/starred?page=${page}&per_page=100`,
      accessToken
    ),
  
  getRepoDetails: (accessToken: string, fullName: string) =>
    makeGitHubRequest<GitHubRepo>(
      `https://api.github.com/repos/${fullName}`,
      accessToken
    ),
  
  getAuthenticatedUser: (accessToken: string) =>
    makeGitHubRequest<GitHubUser>(
      "https://api.github.com/user",
      accessToken
    ),
});