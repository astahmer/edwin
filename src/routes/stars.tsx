import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "~/auth.client";
import { requireAuthServerFn } from "~/utils/session";

export const Route = createFileRoute("/stars")({
  component: StarsComponent,
  beforeLoad: async (ctx) => {
    if (import.meta.env.SSR) {
      await requireAuthServerFn()
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
});

interface Repo {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description?: string;
  stars: number;
  language?: string;
  lastFetchedAt: string;
}

function StarsComponent() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "completed" | "error"
  >("connecting");
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    phase: "fetching" | "syncing" | "complete";
  } | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [sortBy, setSortBy] = useState<"stars" | "name" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repo[]>([]);

  // Filter repos based on search and filter criteria
  useEffect(() => {
    let filtered = repos;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.fullName.toLowerCase().includes(query) ||
          repo.owner.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)
      );
    }

    // Apply language filter
    if (selectedLanguage !== "all") {
      filtered = filtered.filter((repo) => repo.language === selectedLanguage);
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
        case "date":
        default:
          comparison = new Date(a.lastFetchedAt).getTime() - new Date(b.lastFetchedAt).getTime();
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    setFilteredRepos(filtered);
  }, [repos, searchQuery, selectedLanguage, sortBy, sortOrder]);

  // Update available languages when repos change
  useEffect(() => {
    const languages = Array.from(
      new Set(repos.map((repo) => repo.language).filter((lang): lang is string => Boolean(lang)))
    ).sort();
    setAvailableLanguages(languages);
  }, [repos]);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectToStream = () => {
      try {
        setLoading(true);
        setError(null);
        setConnectionStatus("connecting");

        // Connect to SSE stream
        eventSource = new EventSource("/api/stars/stream");

        eventSource.onopen = () => {
          console.log("SSE connection opened");
          setConnectionStatus("connected");
        };

        eventSource.addEventListener("connected", (event) => {
          console.log("Connected to stream:", event.data);
          setLoading(false);
        });

        eventSource.addEventListener("progress", (event) => {
          try {
            const progressData = JSON.parse(event.data);
            setSyncProgress(progressData);
            console.log("Sync progress:", progressData);
          } catch (e) {
            console.error("Failed to parse progress data:", e);
          }
        });

        eventSource.addEventListener("repo", (event) => {
          const repo = JSON.parse(event.data) as Repo;
          console.log("Received repo:", repo.name);
          setRepos((prev) => [...prev, repo]);
        });

        eventSource.addEventListener("complete", (event) => {
          console.log("Stream completed:", event.data);
          setConnectionStatus("completed");
          setLoading(false);
          eventSource?.close();
        });

        eventSource.addEventListener("error", (event: MessageEvent) => {
          try {
            const errorData = JSON.parse(event.data);
            console.error("API error:", errorData);

            if (
              errorData.message.includes("token expired") ||
              errorData.message.includes("invalid")
            ) {
              setError("Your GitHub authentication has expired. Please log in again.");
              // Redirect to login after a delay
              setTimeout(() => {
                window.location.href = "/login";
              }, 3000);
            } else if (errorData.message.includes("Rate limit")) {
              setError("GitHub API rate limit exceeded. Please try again later.");
            } else {
              setError(`GitHub API Error: ${errorData.message}`);
            }
          } catch (_e) {
            console.error("Stream error:", event);
            setError("Failed to fetch repositories from GitHub");
          }
          setConnectionStatus("error");
          setLoading(false);
          eventSource?.close();
        });

        eventSource.onerror = (event) => {
          console.error("SSE connection error:", event);
          setError("Connection to stream failed. Please check your network connection.");
          setConnectionStatus("error");
          setLoading(false);
          eventSource?.close();
        };
      } catch (err) {
        console.error("Failed to connect to stream:", err);
        setError("Failed to connect to stream");
        setConnectionStatus("error");
        setLoading(false);
      }
    };

    connectToStream();

    // Cleanup on unmount
    return () => {
      eventSource?.close();
    };
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Your Starred Repositories</h1>

          {/* Search and Filter Controls */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search Input */}
              <div className="md:col-span-2">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search repositories
                </label>
                <input
                  type="text"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, owner, or description..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {/* Language Filter */}
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Language
                </label>
                <select
                  id="language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
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

              {/* Sort Options */}
              <div>
                <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
                  Sort by
                </label>
                <div className="flex space-x-2">
                  <select
                    id="sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "stars" | "name" | "date")}
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="date">Date</option>
                    <option value="stars">Stars</option>
                    <option value="name">Name</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            </div>

            {/* Results Summary */}
            <div className="mt-4 text-sm text-gray-600">
              Showing {filteredRepos.length} of {repos.length} repositories
              {searchQuery && ` matching "${searchQuery}"`}
              {selectedLanguage !== "all" && ` in ${selectedLanguage}`}
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
                // No repos matching filters
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Try adjusting your search or filter criteria
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedLanguage("all");
                    }}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRepos.map((repo) => (
                <div key={repo.id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-gray-900 truncate">{repo.name}</h3>
                        <p className="text-sm text-gray-500 truncate">{repo.owner}</p>
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
                    {repo.language && (
                      <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {repo.language}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
