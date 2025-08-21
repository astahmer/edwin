import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { Schema } from "effect";
import React, { useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { authClient } from "~/auth.client";
import type { RepoMessage } from "~/routes/api/stars.stream";
import { requireAuthServerFn } from "~/utils/session";

export const Route = createFileRoute("/stars")({
  validateSearch: Schema.standardSchemaV1(
    Schema.Struct({
      search: Schema.String.pipe(Schema.optional),
      language: Schema.String.pipe(Schema.optional),
      minStars: Schema.String.pipe(Schema.optional),
      maxStars: Schema.String.pipe(Schema.optional),
      minDate: Schema.String.pipe(Schema.optional),
      maxDate: Schema.String.pipe(Schema.optional),
      sortBy: Schema.String.pipe(Schema.optional),
      sortOrder: Schema.String.pipe(Schema.optional),
    })
  ),
  beforeLoad: async (ctx) => {
    if (import.meta.env.SSR) {
      await requireAuthServerFn();
    } else {
      // Check authentication by making a request to our session endpoint
      try {
        const response = await authClient.getSession();
        if (!response.data) {
          throw new Error("Not authenticated");
        }
        const session = response.data;
        if (!session?.user) {
          throw new Error("No user session");
        }
      } catch (_error) {
        // Redirect to login if not authenticated
        throw redirect({
          to: "/login",
          search: { redirect: ctx.location.href },
        });
      }
    }
  },
  component: StarsComponent,
});

function StarsComponent() {
  const navigate = useNavigate({ from: "/stars" });

  // Use custom hook for SSE connection
  const { repos, connectionStatus, syncProgress, error } =
    useStarredReposStream("/api/stars/stream");

  const loading = connectionStatus === "connecting" || connectionStatus === "connected";

  // Handle authentication error redirect
  useEffect(() => {
    if (error?.includes("authentication has expired")) {
      setTimeout(() => {
        window.location.href = "/login";
      }, 3000);
    }
  }, [error]);

  // Use custom hooks for optimized filtering and language extraction
  const availableLanguages = useAvailableLanguages(repos);
  const { filteredRepos, searchParams } = useFilteredRepos(repos);
  const { searchQuery, selectedLanguage, minStars, maxStars, minDate, maxDate, sortBy, sortOrder } =
    searchParams;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {connectionStatus === "connecting" && "Connecting to stream..."}
            {connectionStatus === "connected" && "Loading your starred repositories..."}
          </p>
          {syncProgress && (
            <div className="mt-4 w-full max-w-md mx-auto">
              <div className="mb-2 text-sm text-gray-600">
                {syncProgress.phase === "fetching" &&
                  `Fetching repositories... ${syncProgress.current}/${syncProgress.total || "?"}`}
                {syncProgress.phase === "syncing" &&
                  `Syncing repositories... ${syncProgress.current}/${syncProgress.total}`}
                {syncProgress.phase === "complete" &&
                  `Sync complete! ${syncProgress.total} repositories processed`}
              </div>
              {syncProgress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (connectionStatus === "completed") {
    console.log(repos);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold mb-8">Your Starred Repositories</h1>

          {/* Search and Filter Controls */}
          <div className="relative bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <SearchInput />
              <FilterControls availableLanguages={availableLanguages} />
            </div>

            {/* Results Summary */}
            <div className="mt-4 text-sm text-gray-600">
              Showing {filteredRepos.length} of {repos.length} repositories
              {searchQuery && ` matching "${searchQuery}"`}
              {selectedLanguage !== "all" && ` in ${selectedLanguage}`}
              {(minStars !== undefined || maxStars !== undefined) &&
                ` with ${
                  minStars !== undefined && maxStars !== undefined
                    ? `${minStars}-${maxStars} stars`
                    : minStars !== undefined
                      ? `at least ${minStars} stars`
                      : `at most ${maxStars} stars`
                }`}
              {(minDate !== undefined || maxDate !== undefined) &&
                ` starred ${
                  minDate !== undefined && maxDate !== undefined
                    ? `between ${minDate.toLocaleDateString()} and ${maxDate.toLocaleDateString()}`
                    : minDate !== undefined
                      ? `after ${minDate.toLocaleDateString()}`
                      : maxDate !== undefined
                        ? `before ${maxDate.toLocaleDateString()}`
                        : ""
                }`}
            </div>
          </div>

          {filteredRepos.length === 0 ? (
            <div className="text-center py-12">
              {repos.length === 0 ? (
                // No repos at all
                <>
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No starred repositories yet
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Start by starring some repositories on GitHub!
                  </p>
                </>
              ) : (
                // No repos matching filters - use RepositoryGrid for empty state
                <RepositoryGrid repos={filteredRepos} />
              )}
            </div>
          ) : (
            <RepositoryGrid repos={filteredRepos} />
          )}
        </div>
      </div>
    </div>
  );
}

// Custom hook for optimized filtering and sorting of repositories
function useFilteredRepos(repos: RepoMessage[]) {
  const searchQuery = useSearch({
    from: "/stars",
    select: (search) => search.search || "",
  });
  const selectedLanguage = useSearch({
    from: "/stars",
    select: (search) => search.language || "all",
  });
  const minStars = useSearch({
    from: "/stars",
    select: (search) => (search.minStars ? Number.parseInt(search.minStars, 10) : undefined),
  });
  const maxStars = useSearch({
    from: "/stars",
    select: (search) => (search.maxStars ? Number.parseInt(search.maxStars, 10) : undefined),
  });
  const minDate = useSearch({
    from: "/stars",
    select: (search) => (search.minDate ? new Date(search.minDate) : undefined),
  });
  const maxDate = useSearch({
    from: "/stars",
    select: (search) => (search.maxDate ? new Date(search.maxDate) : undefined),
  });
  const sortBy = useSearch({
    from: "/stars",
    select: (search) => (search.sortBy as "stars" | "name" | "date") || "date",
  });
  const sortOrder = useSearch({
    from: "/stars",
    select: (search) => (search.sortOrder as "asc" | "desc") || "desc",
  });
  return useMemo(() => {
    let filtered = repos;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query) ||
          repo.owner.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)
      );
    }

    // Apply language filter
    if (selectedLanguage !== "all") {
      filtered = filtered.filter((repo) => repo.language === selectedLanguage);
    }

    // Apply star range filter
    if (minStars !== undefined || maxStars !== undefined) {
      filtered = filtered.filter((repo) => {
        const stars = repo.stars;
        if (minStars !== undefined && stars < minStars) return false;
        if (maxStars !== undefined && stars > maxStars) return false;
        return true;
      });
    }

    // Apply date range filter
    if (minDate !== undefined || maxDate !== undefined) {
      filtered = filtered.filter((repo) => {
        const starredDate = new Date(repo.starred_at);
        if (minDate !== undefined && starredDate < minDate) return false;
        if (maxDate !== undefined && starredDate > maxDate) return false;
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "stars":
          comparison = a.stars - b.stars;
          break;
        case "name":
          comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        default:
          comparison = new Date(a.starred_at).getTime() - new Date(b.starred_at).getTime();
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return {
      filteredRepos: filtered,
      searchParams: {
        searchQuery,
        selectedLanguage,
        minStars,
        maxStars,
        minDate,
        maxDate,
        sortBy,
        sortOrder,
      },
    };
  }, [
    repos,
    searchQuery,
    selectedLanguage,
    minStars,
    maxStars,
    minDate,
    maxDate,
    sortBy,
    sortOrder,
  ]);
}

// Custom hook for available languages
function useAvailableLanguages(repos: RepoMessage[]) {
  return useMemo(
    () =>
      Array.from(
        new Set(repos.map((repo) => repo.language).filter((lang): lang is string => Boolean(lang)))
      ).sort(),
    [repos]
  );
}

// SearchInput component with optimized re-renders
function SearchInput() {
  const search = useSearch({
    from: "/stars",
    select: (search) => search.search || "",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div className="md:col-span-2">
      <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
        Search repositories
      </label>
      <input
        type="text"
        id="search"
        value={search}
        onChange={(e) => navigate({ search: (prev) => ({ ...prev, search: e.target.value }) })}
        placeholder="Search by name, owner, or description..."
        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-50"
      />
    </div>
  );
}

// Individual filter components with their own useSearch hooks

function LanguageFilter({ availableLanguages }: { availableLanguages: string[] }) {
  const language = useSearch({
    from: "/stars",
    select: (search) => search.language || "all",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
        Language
      </label>
      <select
        id="language"
        value={language}
        onChange={(e) => navigate({ search: (prev) => ({ ...prev, language: e.target.value }) })}
        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
      >
        <option value="all">All Languages</option>
        {availableLanguages.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
    </div>
  );
}

function StarRangeFilter() {
  const minStars = useSearch({
    from: "/stars",
    select: (search) => (search.minStars ? Number.parseInt(search.minStars, 10) : undefined),
  });
  const maxStars = useSearch({
    from: "/stars",
    select: (search) => (search.maxStars ? Number.parseInt(search.maxStars, 10) : undefined),
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <div className="flex space-y-2 flex-col">
        <div className="flex-1">
          <label htmlFor="minStars" className="sr-only">
            Minimum stars
          </label>
          <input
            type="number"
            id="minStars"
            placeholder="Min"
            value={minStars || ""}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, minStars: e.target.value || undefined }) })
            }
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            min="0"
          />
        </div>
      </div>
    </div>
  );
}

function DateRangeFilter() {
  const minDate = useSearch({
    from: "/stars",
    select: (search) => (search.minDate ? new Date(search.minDate) : undefined),
  });
  const maxDate = useSearch({
    from: "/stars",
    select: (search) => (search.maxDate ? new Date(search.maxDate) : undefined),
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <div className="flex space-y-2 flex-col">
        <div className="flex-1">
          <label htmlFor="minDate" className="text-sm font-medium text-gray-400 mb-1">
            From
          </label>
          <input
            type="date"
            id="minDate"
            value={minDate ? minDate.toISOString().split("T")[0] : ""}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, minDate: e.target.value || undefined }) })
            }
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="maxDate" className="text-sm font-medium text-gray-400 mb-1">
            To
          </label>
          <input
            type="date"
            id="maxDate"
            value={maxDate ? maxDate.toISOString().split("T")[0] : ""}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, maxDate: e.target.value || undefined }) })
            }
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function SortControls() {
  const sortBy = useSearch({
    from: "/stars",
    select: (search) => (search.sortBy as "stars" | "name" | "date") || "date",
  });
  const sortOrder = useSearch({
    from: "/stars",
    select: (search) => (search.sortOrder as "asc" | "desc") || "desc",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
        Sort by
      </label>
      <div className="flex space-x-2">
        <select
          id="sort"
          value={sortBy}
          onChange={(e) =>
            navigate({
              search: (prev) => ({ ...prev, sortBy: e.target.value as "stars" | "name" | "date" }),
            })
          }
          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="date">Date</option>
          <option value="stars">Stars</option>
          <option value="name">Name</option>
        </select>
        <button
          type="button"
          onClick={() =>
            navigate({
              search: (prev) => ({ ...prev, sortOrder: sortOrder === "asc" ? "desc" : "asc" }),
            })
          }
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
      </div>
    </div>
  );
}

function ClearFiltersButton() {
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div className="md:col-span-2 mt-4">
      <button
        type="button"
        onClick={() =>
          navigate({
            search: {
              search: "",
              language: "all",
              minStars: undefined,
              maxStars: undefined,
              minDate: undefined,
              maxDate: undefined,
            },
          })
        }
        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
          <title>Clear filters</title>
        </svg>
        Clear All Filters
      </button>
    </div>
  );
}

// FilterControls component that combines all individual filters
function FilterControls({ availableLanguages }: { availableLanguages: string[] }) {
  return (
    <>
      <LanguageFilter availableLanguages={availableLanguages} />
      <StarRangeFilter />
      <DateRangeFilter />
      <SortControls />
      <ClearFiltersButton />
    </>
  );
}

// RepositoryCard component with memoization
const RepositoryCard = React.memo(function RepositoryCard({
  repo,
  selectedLanguage,
  onLanguageClick,
}: {
  repo: RepoMessage;
  selectedLanguage: string;
  onLanguageClick: (language: string) => void;
}) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              <a
                href={`https://github.com/${repo.full_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline"
              >
                {repo.name}
              </a>
            </h3>
            <p className="text-sm text-gray-500 truncate">
              <a
                href={`https://github.com/${repo.owner}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline"
              >
                {repo.owner}
              </a>
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <svg
              className="h-4 w-4 text-yellow-400"
              fill="currentColor"
              viewBox="0 0 20 20"
              role="img"
              aria-label="Star rating"
            >
              <title>Star rating</title>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm text-gray-500">{repo.stars}</span>
          </div>
        </div>
        {repo.description && (
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{repo.description}</p>
        )}
        <div className="mt-auto pt-2 flex items-center gap-2">
          {repo.language && (
            <button
              type="button"
              onClick={() => {
                if (repo.language) {
                  onLanguageClick(repo.language);
                }
              }}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                selectedLanguage === repo.language
                  ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {repo.language}
            </button>
          )}
          <span className="text-xs text-gray-500 ml-auto mt-4">
            Starred on{" "}
            {new Date(repo.starred_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
});

// Virtualized RepositoryGrid component for performance with large lists
const RepositoryGrid = React.memo(function RepositoryGrid({ repos }: { repos: RepoMessage[] }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate({ from: "/stars" });
  const selectedLanguage = useSearch({
    from: "/stars",
    select: (search) => search.language || "all",
  });

  // Virtualizer configuration
  const virtualizer = useVirtualizer({
    count: repos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated height of each repository card
    overscan: 5, // Number of items to render outside visible area
  });

  if (repos.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
        <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-[600px] overflow-auto"
      style={{
        contain: "strict", // CSS containment for better performance
      }}
    >
      <div
        className="relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const repo = repos[virtualItem.index];
          return (
            <div
              key={repo.id}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="p-3">
                <RepositoryCard
                  repo={repo}
                  selectedLanguage={selectedLanguage}
                  onLanguageClick={(language) =>
                    navigate({
                      search: (prev) => ({
                        ...prev,
                        language: selectedLanguage === language ? "all" : language,
                      }),
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// Type definitions for SSE events
interface ProgressData {
  current: number;
  total: number;
  phase: "fetching" | "syncing" | "complete";
}

type SSEEventHandler = (data: any) => void;

// Generic SSE hook with configurable logging
function useSSE(
  url: string,
  options: {
    enableLogging?: boolean;
    eventHandlers: Record<string, SSEEventHandler>;
    onError?: (error: string) => void;
    onComplete?: () => void;
  } = { enableLogging: false, eventHandlers: {} }
) {
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "completed" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  const { enableLogging, eventHandlers, onError, onComplete } = options;

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectToStream = () => {
      try {
        setError(null);
        setConnectionStatus("connecting");

        if (enableLogging) {
          console.log("Connecting to SSE stream:", url);
        }

        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          if (enableLogging) {
            console.log("SSE connection opened");
          }
          setConnectionStatus("connected");
        };

        // Set up custom event handlers
        Object.entries(eventHandlers).forEach(([eventName, handler]) => {
          eventSource!.addEventListener(eventName, (event) => {
            try {
              const data = JSON.parse(event.data);
              if (enableLogging) {
                console.log(`SSE event '${eventName}':`, data);
              }
              handler(data);
            } catch (e) {
              if (enableLogging) {
                console.error(`Failed to parse ${eventName} data:`, e);
              }
            }
          });
        });

        // Handle completion
        eventSource.addEventListener("complete", (event) => {
          if (enableLogging) {
            console.log("Stream completed:", event.data);
          }
          setConnectionStatus("completed");
          onComplete?.();
          eventSource?.close();
        });

        // Handle errors
        eventSource.addEventListener("error", (event: MessageEvent) => {
          try {
            const errorData = JSON.parse(event.data);
            if (enableLogging) {
              console.error("SSE API error:", errorData);
            }

            let errorMessage = `Error: ${errorData.message}`;
            if (
              errorData.message.includes("token expired") ||
              errorData.message.includes("invalid")
            ) {
              errorMessage = "Your GitHub authentication has expired. Please log in again.";
            } else if (errorData.message.includes("Rate limit")) {
              errorMessage = "GitHub API rate limit exceeded. Please try again later.";
            }

            setError(errorMessage);
            onError?.(errorMessage);
          } catch (_e) {
            if (enableLogging) {
              console.error("SSE stream error:", event, _e);
            }
            const errorMessage = "Failed to fetch data from server";
            setError(errorMessage);
            onError?.(errorMessage);
          }
          setConnectionStatus("error");
          eventSource?.close();
        });

        eventSource.onerror = (event) => {
          if (enableLogging) {
            console.error("SSE connection error:", event);
          }
          const errorMessage = "Connection to stream failed. Please check your network connection.";
          setError(errorMessage);
          onError?.(errorMessage);
          setConnectionStatus("error");
          eventSource?.close();
        };
      } catch (err) {
        if (enableLogging) {
          console.error("Failed to connect to stream:", err);
        }
        const errorMessage = "Failed to connect to stream";
        setError(errorMessage);
        onError?.(errorMessage);
        setConnectionStatus("error");
      }
    };

    connectToStream();

    return () => {
      if (enableLogging) {
        console.log("Cleaning up SSE connection");
      }
      eventSource?.close();
    };
  }, [url, enableLogging, eventHandlers, onError, onComplete]);

  return { connectionStatus, error };
}

// Specialized hook for starred repositories using the generic SSE hook
function useStarredReposStream(url: string, enableLogging?: boolean) {
  const [repos, setRepos] = useState<RepoMessage[]>([]);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    phase: "fetching" | "syncing" | "complete";
  } | null>(null);

  // Memoize event handlers object
  const eventHandlers = useMemo(
    () => ({
      connected: () => {
        // Connection established
      },
      progress: (data: ProgressData) => {
        setSyncProgress(data);
      },
      repo: (data: RepoMessage) => {
        setRepos((prev) => {
          const ids = new Set(prev.map((repo) => repo.id));
          if (ids.has(data.id)) {
            return prev;
          }

          return [...prev, data];
        });
      },
    }),
    []
  );

  const { connectionStatus, error } = useSSE(url, {
    enableLogging,
    eventHandlers,
  });

  return { repos, connectionStatus, syncProgress, error };
}
