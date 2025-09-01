import { Effect } from "effect";
import {
  GitHubApiError,
  GitHubAuthError,
  GitHubRateLimitError,
  GitHubRequestError,
} from "../errors";
import type { Schemas as Github } from "./github/github.openapi.codegen.ts";
import { githubApi } from "~/services/github/github.api.codegen.ts";

export class GitHubClient extends Effect.Service<GitHubClient>()("GitHubClient", {
  effect: Effect.succeed({
    /** @see https://docs.github.com/en/rest/activity/starring?apiVersion=2022-11-28#list-repositories-starred-by-the-authenticated-user */
    getMyStars: (input: { accessToken: string; page?: number; perPage?: number }) => {
      const { page = 1, perPage = 100 } = input;

      // return Effect.gen(function* () {
      //   const response = yield* Effect.tryPromise({
      //     try: () =>
      //       githubApi.get("/user/starred", {
      //         query: { page, per_page: perPage },
      //         withResponse: true,
      //         overrides: {
      //           headers: {
      //             Authorization: `Bearer ${input.accessToken}`,
      //             Accept: "application/vnd.github.v3.star+json",
      //             "User-Agent": "Edwin-Stars-Organizer",
      //             "X-GitHub-Api-Version": "2022-11-28",
      //           },
      //         },
      //       }),
      //     catch: (error) =>
      //       new GitHubRequestError({ cause: error, message: "Failed to parse JSON" }),
      //   });

      //   const pagination = getPagination(response);
      //   if (response.ok && response.status === 200) {
      //     return {
      //       json: response.data as Github.starred_repository[],
      //       response,
      //       pagination,
      //     };
      //   }

      //   return {
      //     json: [],
      //     response,
      //     pagination,
      //   };
      // });

      return makeTypedGithubRequest<Github.starred_repository[]>(
        `https://api.github.com/user/starred?page=${page}&per_page=${perPage}`,
        input.accessToken
      );
    },
    /** @see https://docs.github.com/en/rest/activity/starring?apiVersion=2022-11-28#list-repositories-starred-by-a-user */
    getUserStars: (input: {
      username: string;
      accessToken: string;
      page: number;
      perPage: number;
    }) => {
      const { page = 1, perPage = 100 } = input;
      return makeTypedGithubRequest<Github.starred_repository[]>(
        `https://api.github.com/user/${input.username}starred?page=${page}&per_page=${perPage}`,
        input.accessToken
      );
    },
  }),
}) {}

// https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api?apiVersion=2022-11-28
const prevPattern = /(?<=<)([\S]*)(?=>; rel="prev")/i;
const nextPattern = /(?<=<)([\S]*)(?=>; rel="next")/i;
const lastPattern = /(?<=<)([\S]*)(?=>; rel="last")/i;

const extractPaginationParam = (url: string, key: "page" | "per_page") => {
  const urlObject = new URL(url);
  const page = urlObject.searchParams.get(key);
  return page ? Number.parseInt(page, 10) : 1;
};

const makeGitHubRequest = (url: string, accessToken: string) =>
  Effect.tryPromise({
    try: async (): Promise<Response> => {
      console.log("[--> GH]:", url);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3.star+json",
          "User-Agent": "Edwin-Stars-Organizer",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      // const total = response.headers.get("link")?.match(lastPattern)?.[0]

      // Check for rate limiting
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const resetTime = response.headers.get("X-RateLimit-Reset");

      if (response.status === 403 && remaining === "0") {
        const resetDate = resetTime
          ? new Date(Number.parseInt(resetTime, 10) * 1000)
          : new Date(Date.now() + 60000);
        const waitTime = Math.max(0, resetDate.getTime() - Date.now());
        throw new GitHubRateLimitError({
          retryAfter: Math.ceil(waitTime / 1000),
          message: `Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)} seconds`,
        });
      }

      if (!response.ok) {
        const error = await response.text();

        // Handle token expiration/invalidity
        if (response.status === 401) {
          throw new GitHubAuthError({
            message: "GitHub token expired or invalid. Please re-authenticate.",
          });
        }

        throw new GitHubApiError({
          status: response.status,
          message: `GitHub API error (${response.status}): ${error}`,
        });
      }

      // Log rate limit info for debugging
      if (remaining) {
        console.log(`GitHub API calls remaining: ${remaining}`);
      }

      return response;
    },
    catch: (error) =>
      new GitHubRequestError({
        cause: error,
        message: `GitHub API request failed: ${String(error)}`,
      }),
  });

const getPagination = (response: Response) => {
  const link = response.headers.get("link");
  if (!link) return null;

  const prevLink = link.match(prevPattern)?.[0];
  const nextLink = link.match(nextPattern)?.[0];
  const totalLink = link.match(lastPattern)?.[0];

  const prev = prevLink ? extractPaginationParam(prevLink, "page") : null;
  const next = nextLink ? extractPaginationParam(nextLink, "page") : null;
  const total = totalLink
    ? extractPaginationParam(totalLink, "page") * extractPaginationParam(totalLink, "per_page")
    : null;

  return { prev, next, total };
};

const makeTypedGithubRequest = Effect.fn(function* <T>(url: string, accessToken: string) {
  const response = yield* makeGitHubRequest(url, accessToken);
  const json = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => new GitHubRequestError({ cause: error, message: "Failed to parse JSON" }),
  });

  const pagination = yield* Effect.try({
    try: () => getPagination(response),
    catch: (error) =>
      new GitHubRequestError({ cause: error, message: "Failed to parse pagination" }),
  });

  return { json: json as T, response, pagination };
});
