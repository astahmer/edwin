import { Effect, Context, Layer } from "effect";

export interface StarredGithubRepo {
  starred_at: string
  repo: GitHubRepo
}

export interface GitHubRepo {
  id: number
  node_id: string
  name: string
  full_name: string
  private: boolean
  owner: {
     login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  user_view_type: string
  site_admin: boolean
  };
  html_url: string
  description: string
  fork: boolean
  url: string
  forks_url: string
  keys_url: string
  collaborators_url: string
  teams_url: string
  hooks_url: string
  issue_events_url: string
  events_url: string
  assignees_url: string
  branches_url: string
  tags_url: string
  blobs_url: string
  git_tags_url: string
  git_refs_url: string
  trees_url: string
  statuses_url: string
  languages_url: string
  stargazers_url: string
  contributors_url: string
  subscribers_url: string
  subscription_url: string
  commits_url: string
  git_commits_url: string
  comments_url: string
  issue_comment_url: string
  contents_url: string
  compare_url: string
  merges_url: string
  archive_url: string
  downloads_url: string
  issues_url: string
  pulls_url: string
  milestones_url: string
  notifications_url: string
  labels_url: string
  releases_url: string
  deployments_url: string
  created_at: string
  updated_at: string
  pushed_at: string
  git_url: string
  ssh_url: string
  clone_url: string
  svn_url: string
  homepage: string
  size: number
  stargazers_count: number
  watchers_count: number
  language: string
  has_issues: boolean
  has_projects: boolean
  has_downloads: boolean
  has_wiki: boolean
  has_pages: boolean
  has_discussions: boolean
  forks_count: number
  mirror_url: any
  archived: boolean
  disabled: boolean
  open_issues_count: number
  license: any[]
  allow_forking: boolean
  is_template: boolean
  web_commit_signoff_required: boolean
  topics: any[]
  visibility: string
  forks: number
  open_issues: number
  watchers: number
  default_branch: string
  permissions: {
     admin: boolean
  maintain: boolean
  push: boolean
  triage: boolean
  pull: boolean
  }
}

export interface GitHubUser {
  id: string;
  login: string;
}

export class GitHubClient extends Context.Tag("GitHubClient")<
  GitHubClient,
  {
    readonly getUserStars: (accessToken: string, page?: number, perPage?: number) => Effect.Effect<StarredGithubRepo[], Error>;
    readonly getAllUserStars: (accessToken: string) => Effect.Effect<StarredGithubRepo[], Error>;
    readonly getRepoDetails: (accessToken: string, fullName: string) => Effect.Effect<GitHubRepo, Error>;
    readonly getAuthenticatedUser: (accessToken: string) => Effect.Effect<GitHubUser, Error>;
  }
>() {}

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

      // Check for rate limiting
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const resetTime = response.headers.get('X-RateLimit-Reset');

      if (response.status === 403 && remaining === '0') {
        const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : new Date(Date.now() + 60000);
        const waitTime = Math.max(0, resetDate.getTime() - Date.now());
        throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)} seconds`);
      }

      if (!response.ok) {
        const error = await response.text();
        
        // Handle token expiration/invalidity
        if (response.status === 401) {
          throw new Error(`GitHub token expired or invalid. Please re-authenticate.`);
        }
        
        throw new Error(`GitHub API error (${response.status}): ${error}`);
      }

      // Log rate limit info for debugging
      if (remaining) {
        console.log(`GitHub API calls remaining: ${remaining}`);
      }

      return await response.json();
    },
    catch: (error) => new Error(`GitHub API request failed: ${String(error)}`),
  });

export const GitHubClientLive = Layer.succeed(GitHubClient, {
  getUserStars: (accessToken: string, page = 1, perPage = 100) =>
    makeGitHubRequest<StarredGithubRepo[]>(
      `https://api.github.com/user/starred?page=${page}&per_page=${perPage}`,
      accessToken
    ),

  getAllUserStars: (accessToken: string) =>
    Effect.gen(function* (_) {
      const allRepos: StarredGithubRepo[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const repos = yield* makeGitHubRequest<StarredGithubRepo[]>(
          `https://api.github.com/user/starred?page=${page}&per_page=100`,
          accessToken
        );

        allRepos.push(...repos);
        
        // If we got fewer than 100 repos, we've reached the end
        hasMore = repos.length === 100;
        page++;
      }

      return allRepos;
    }),

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
