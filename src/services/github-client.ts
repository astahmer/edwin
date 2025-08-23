import { Effect } from "effect";
import {
  GitHubApiError,
  GitHubAuthError,
  GitHubRateLimitError,
  GitHubRequestError,
} from "../errors";

export class GitHubClient extends Effect.Service<GitHubClient>()("GitHubClient", {
  effect: Effect.succeed({
    /** @see https://docs.github.com/en/rest/activity/starring?apiVersion=2022-11-28#list-repositories-starred-by-the-authenticated-user */
    getUserStars: (accessToken: string, page = 1, perPage = 100) =>
      makeTypedGithubRequest<StarredGithubRepo[]>(
        `https://api.github.com/user/starred?page=${page}&per_page=${perPage}`,
        accessToken
      ),
    getRepoDetails: (accessToken: string, fullName: string) =>
      makeTypedGithubRequest<GitHubRepo>(`https://api.github.com/repos/${fullName}`, accessToken),

    getAuthenticatedUser: (accessToken: string) =>
      makeTypedGithubRequest<GitHubUser>("https://api.github.com/user", accessToken),
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
      console.log("[<-- GH]:", url, response.status);
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

export interface StarredGithubRepo {
  starred_at: number;
  repo: GitHubRepo;
}

export interface GitHubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    user_view_type: string;
    site_admin: boolean;
  };
  html_url: string;
  description: string;
  fork: boolean;
  url: string;
  forks_url: string;
  keys_url: string;
  collaborators_url: string;
  teams_url: string;
  hooks_url: string;
  issue_events_url: string;
  events_url: string;
  assignees_url: string;
  branches_url: string;
  tags_url: string;
  blobs_url: string;
  git_tags_url: string;
  git_refs_url: string;
  trees_url: string;
  statuses_url: string;
  languages_url: string;
  stargazers_url: string;
  contributors_url: string;
  subscribers_url: string;
  subscription_url: string;
  commits_url: string;
  git_commits_url: string;
  comments_url: string;
  issue_comment_url: string;
  contents_url: string;
  compare_url: string;
  merges_url: string;
  archive_url: string;
  downloads_url: string;
  issues_url: string;
  pulls_url: string;
  milestones_url: string;
  notifications_url: string;
  labels_url: string;
  releases_url: string;
  deployments_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  svn_url: string;
  homepage: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  forks_count: number;
  mirror_url: string | null;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license: unknown | null;
  allow_forking: boolean;
  is_template: boolean;
  web_commit_signoff_required: boolean;
  topics: string[];
  visibility: string;
  forks: number;
  open_issues: number;
  watchers: number;
  default_branch: string;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export interface GitHubUser {
  id: string;
  login: string;
}
