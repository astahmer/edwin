import { useNavigate, useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TagsInput } from "~/components/ui/tags-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import type { ConnectionState } from "~/components/use-sse";
import type { StarredRepoMessage } from "~/services/star-sync-service";

export function StarsPage(props: {
  total: number | undefined;
  repoList: StarredRepoMessage[];
  connectionStatus: ConnectionState;
  error: string | null;
}) {
  const { repoList, connectionStatus, error } = props;

  // Handle authentication error redirect
  useEffect(() => {
    if (error?.includes("authentication has expired")) {
      setTimeout(() => {
        window.location.href = "/login";
      }, 3000);
    }
  }, [error]);

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
    <YourStarredRepositories
      repoList={repoList}
      total={connectionStatus === "completed" ? undefined : props.total}
      connectionStatus={connectionStatus}
    />
  );
}

const YourStarredRepositories = (props: {
  repoList: StarredRepoMessage[];
  total: number | undefined;
  connectionStatus: ConnectionState;
}) => {
  const { repoList, connectionStatus } = props;
  const availableLanguages = useAvailableLanguages(repoList);
  const filteredRepos = useFilteredRepos(repoList);

  const filtersExpanded = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.filtersExpanded,
  });
  const navigate = useNavigate({ from: "/stars" });

  const setFiltersExpanded = (expanded: boolean) => {
    navigate({
      search: (prev) => ({
        ...prev,
        filtersExpanded: expanded ? true : undefined,
      }),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-2xl font-bold mb-6">Your Starred Repositories</h1>

          {/* Search and Filter Controls */}
          <div className="relative bg-white rounded-lg shadow p-6 mb-6">
            {/* Always visible search with filters toggle */}
            <div className="flex gap-3 items-center mb-4">
              <div className="flex-1 flex gap-6 items-end">
                <div className="flex-1">
                  <SearchInput />
                </div>
                <div className="flex-1">
                  <OwnerFilter />
                </div>
                <div className="w-auto">
                  <DateRangePickerWithPresets />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 self-end"
              >
                {filtersExpanded ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
                {filtersExpanded ? "Hide filters" : "Show more filters"}
              </Button>
            </div>

            {/* Collapsible filters */}
            {filtersExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
                <TagsFilter />
                <LanguageFilter availableLanguages={availableLanguages} />
                <ActivityPresetFilter />
              </div>
            )}

            <div className="flex justify-between">
              <ResultsSummary
                filteredRepos={filteredRepos}
                repoList={repoList}
                total={props.total}
              />
              <div className="flex gap-4">
                <ClearFiltersButton />
                <StarRangeFilter />
                <SortControls />
              </div>
            </div>
          </div>

          <ResultList
            filteredRepos={filteredRepos}
            repoList={repoList}
            connectionStatus={connectionStatus}
          />
        </div>
      </div>
    </div>
  );
};

const LoadingRepositoriesState = () => (
  <>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
    <h3 className="mt-2 text-sm font-medium text-gray-900">Loading starred repositories...</h3>
    <p className="mt-1 text-sm text-gray-500">Fetching your starred repositories from GitHub</p>
  </>
);

const NoRepositoriesState = () => (
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
    <h3 className="mt-2 text-sm font-medium text-gray-900">No starred repositories yet</h3>
    <p className="mt-1 text-sm text-gray-500">Start by starring some repositories on GitHub!</p>
  </>
);

const ResultList = (props: {
  filteredRepos: StarredRepoMessage[];
  repoList: StarredRepoMessage[];
  connectionStatus: ConnectionState;
}) => {
  const { filteredRepos, repoList, connectionStatus } = props;

  if (filteredRepos.length > 0) {
    return <RepositoryGrid repoList={filteredRepos} />;
  }

  return (
    <div className="text-center py-12">
      {repoList.length === 0 ? (
        // Check if we're still loading or truly have no repos
        connectionStatus === "connected" || connectionStatus === "connecting" ? (
          <LoadingRepositoriesState />
        ) : (
          <NoRepositoriesState />
        )
      ) : (
        // No repos matching filters - use RepositoryGrid for empty state
        <RepositoryGrid repoList={filteredRepos} />
      )}
    </div>
  );
};

const ResultsSummary = (props: {
  filteredRepos: StarredRepoMessage[];
  repoList: StarredRepoMessage[];
  total: number | undefined;
}) => {
  const searchQuery = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.search || "",
  });
  const ownerFilter = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.owner || "",
  });
  const tagsFilter = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.tags || "").split(",").filter(Boolean),
  });
  const selectedLanguage = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.language || "all",
  });
  const minStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minStars ? Number.parseInt(search.minStars, 10) : undefined),
  });
  const maxStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxStars ? Number.parseInt(search.maxStars, 10) : undefined),
  });
  const minDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minDate ? new Date(search.minDate) : undefined),
  });
  const maxDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxDate ? new Date(search.maxDate) : undefined),
  });
  const activePreset = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.activePreset || "all",
  });

  const getRepositoryCount = () => {
    if (props.total && props.total > props.repoList.length) {
      return `~${props.total}`;
    }
    return props.repoList.length;
  };

  const getStarsFilter = () => {
    if (minStars !== undefined && maxStars !== undefined) {
      return `${minStars}-${maxStars} stars`;
    }
    if (minStars !== undefined) {
      return `at least ${minStars} stars`;
    }
    if (maxStars !== undefined) {
      return `at most ${maxStars} stars`;
    }
    return null;
  };

  const getDateFilter = () => {
    if (minDate !== undefined && maxDate !== undefined) {
      return `between ${minDate.toLocaleDateString()} and ${maxDate.toLocaleDateString()}`;
    }
    if (minDate !== undefined) {
      return `after ${minDate.toLocaleDateString()}`;
    }
    if (maxDate !== undefined) {
      return `before ${maxDate.toLocaleDateString()}`;
    }
    return null;
  };

  const getactivePreset = () => {
    const activityLabels = {
      week: "active in the last week",
      month: "active in the last month",
      year: "active in the last year",
      "5years": "active in the last 5 years",
      "10years": "active in the last 10 years",
    };
    return activePreset !== "all"
      ? activityLabels[activePreset as keyof typeof activityLabels]
      : null;
  };

  const starsFilter = getStarsFilter();
  const dateFilter = getDateFilter();
  const activeFilter = getactivePreset();

  return (
    <div className="mt-4 text-sm text-gray-600">
      Showing {props.filteredRepos.length} of {getRepositoryCount()} repositories
      {searchQuery && ` matching "${searchQuery}"`}
      {ownerFilter && ` by owner "${ownerFilter}"`}
      {tagsFilter.length > 0 && ` with tags: ${tagsFilter.join(", ")}`}
      {selectedLanguage !== "all" && ` in ${selectedLanguage}`}
      {starsFilter && ` with ${starsFilter}`}
      {dateFilter && ` starred ${dateFilter}`}
      {activeFilter && ` that were ${activeFilter}`}
    </div>
  );
};

// Custom hook for optimized filtering and sorting of repositories
function useFilteredRepos(repoList: StarredRepoMessage[]) {
  const searchQuery = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.search || "",
  });
  const ownerFilter = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.owner || "",
  });
  const tagsFilter = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.tags || "").split(",").filter(Boolean),
  });
  const selectedLanguage = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.language || "all",
  });
  const minStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minStars ? Number.parseInt(search.minStars, 10) : undefined),
  });
  const maxStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxStars ? Number.parseInt(search.maxStars, 10) : undefined),
  });
  const minDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minDate ? new Date(search.minDate) : undefined),
  });
  const maxDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxDate ? new Date(search.maxDate) : undefined),
  });
  const activePreset = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.activePreset || "all",
  });
  const sortBy = useSearch({
    from: "/_authenticated/stars",
    select: (search) =>
      (search.sortBy as "stars" | "name" | "starredDate" | "createdDate" | "pushedDate") ||
      "starredDate",
  });
  const sortOrder = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.sortOrder as "asc" | "desc") || "desc",
  });

  const applyactivePreset = useCallback((repos: StarredRepoMessage[], filter: string) => {
    if (filter === "all") return repos;

    const now = Date.now();
    return repos.filter((repo) => {
      if (!repo.pushed_at) return false;

      const pushDate = repo.pushed_at;
      switch (filter) {
        case "week":
          return now - pushDate <= 7 * 24 * 60 * 60 * 1000;
        case "month":
          return now - pushDate <= 30 * 24 * 60 * 60 * 1000;
        case "year":
          return now - pushDate <= 365 * 24 * 60 * 60 * 1000;
        case "5years":
          return now - pushDate <= 5 * 365 * 24 * 60 * 60 * 1000;
        case "10years":
          return now - pushDate <= 10 * 365 * 24 * 60 * 60 * 1000;
        default:
          return true;
      }
    });
  }, []);

  return useMemo(() => {
    let filtered = repoList;

    // Apply search filter (searches in most fields)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query) ||
          repo.owner.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query) ||
          (repo.topics ?? []).some((topic) => topic.toLowerCase().includes(query)) ||
          repo.language?.toLowerCase().includes(query)
      );
    }

    // Apply owner filter (only searches in owner field)
    if (ownerFilter.trim()) {
      const owner = ownerFilter.toLowerCase();
      filtered = filtered.filter((repo) => repo.owner.toLowerCase().includes(owner));
    }

    // Apply tags filter (searches in name and description for multiple keywords)
    if (tagsFilter.length > 0) {
      filtered = filtered.filter((repo) => {
        const searchText = `${repo.name} ${repo.description || ""}`.toLowerCase();
        return tagsFilter.some((tag) => searchText.includes(tag.toLowerCase()));
      });
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

    // Apply activity filter (based on last push date)
    filtered = applyactivePreset(filtered, activePreset);

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
        case "createdDate":
          comparison = (a.created_at || 0) - (b.created_at || 0);
          break;
        case "pushedDate":
          comparison = (a.pushed_at || 0) - (b.pushed_at || 0);
          break;
        case "starredDate":
        default:
          comparison = new Date(a.starred_at).getTime() - new Date(b.starred_at).getTime();
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [
    repoList,
    searchQuery,
    ownerFilter,
    tagsFilter,
    selectedLanguage,
    minStars,
    maxStars,
    minDate,
    maxDate,
    activePreset,
    sortBy,
    sortOrder,
    applyactivePreset,
  ]);
}

// Custom hook for available languages
function useAvailableLanguages(repoList: StarredRepoMessage[]) {
  return useMemo(
    () =>
      Array.from(
        new Set(
          repoList.map((repo) => repo.language).filter((lang): lang is string => Boolean(lang))
        )
      ).sort(),
    [repoList]
  );
}

// SearchInput component with optimized re-renders
function SearchInput() {
  const search = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.search || "",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <Label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
        Search repositories
      </Label>
      <Input
        type="text"
        id="search"
        defaultValue={search}
        onChange={(e) => navigate({ search: (prev) => ({ ...prev, search: e.target.value }) })}
        placeholder="Search by anything like name, description, owner, topics, langage..."
        className="w-full"
      />
    </div>
  );
}

// OwnerFilter component for filtering by repository owner
function OwnerFilter() {
  const owner = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.owner || "",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <Label htmlFor="owner" className="block text-sm font-medium text-gray-700 mb-1">
        Filter by owner
      </Label>
      <Input
        type="text"
        id="owner"
        defaultValue={owner}
        onChange={(e) => navigate({ search: (prev) => ({ ...prev, owner: e.target.value }) })}
        placeholder="Enter owner (user or organization) name..."
        className="w-full"
      />
    </div>
  );
}

// TagsFilter component for searching with multiple keywords
function TagsFilter() {
  const tagsString = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.tags || "",
  });
  const tags = tagsString.split(",").filter(Boolean);
  const navigate = useNavigate({ from: "/stars" });

  const handleTagsChange = (newTags: string[]) => {
    navigate({ search: (prev) => ({ ...prev, tags: newTags.join(",") }) });
  };

  return (
    <div>
      <div className="block text-sm font-medium text-gray-700 mb-1">Search tags</div>
      <TagsInput value={tags} onChange={handleTagsChange} placeholder="Add search keywords..." />
      <p className="text-xs text-gray-500 mt-1">
        Add keywords to search in repository names and descriptions
      </p>
    </div>
  );
}

// Individual filter components with their own useSearch hooks

function LanguageFilter({ availableLanguages }: { availableLanguages: string[] }) {
  const language = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.language || "all",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div>
      <Label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
        Language
      </Label>
      <Select
        value={language}
        onValueChange={(value: string) =>
          navigate({ search: (prev) => ({ ...prev, language: value }) })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent className="bg-white text-gray-900 border border-gray-200 shadow-lg">
          <SelectItem value="all" className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100">
            All Languages
          </SelectItem>
          {availableLanguages.map((lang) => (
            <SelectItem
              key={lang}
              value={lang}
              className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
            >
              {lang}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StarRangeFilter() {
  const minStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minStars ? Number.parseInt(search.minStars, 10) : undefined),
  });
  const maxStars = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxStars ? Number.parseInt(search.maxStars, 10) : undefined),
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div className="flex flex-1 gap-4 self-end">
      <div className="flex-1 max-w-32">
        <Input
          type="number"
          id="minStars"
          placeholder="Min stars"
          defaultValue={minStars}
          onChange={(e) =>
            navigate({ search: (prev) => ({ ...prev, minStars: e.target.value || undefined }) })
          }
          className="w-full text-sm h-8"
          min="0"
        />
      </div>
      <div className="flex-1 max-w-32">
        <Input
          type="number"
          id="maxStars"
          placeholder="Max stars"
          defaultValue={maxStars}
          onChange={(e) =>
            navigate({ search: (prev) => ({ ...prev, maxStars: e.target.value || undefined }) })
          }
          className="w-full text-sm h-8"
          min="0"
        />
      </div>
    </div>
  );
}

const presets = [
  // {
  //   label: "Today",
  //   range: {
  //     from: new Date(),
  //     to: new Date(),
  //   },
  // },
  // {
  //   label: "Yesterday",
  //   range: {
  //     from: new Date(Date.now() - 24 * 60 * 60 * 1000),
  //     to: new Date(Date.now() - 24 * 60 * 60 * 1000),
  //   },
  // },
  {
    label: "Last 7 days",
    range: {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "Last 30 days",
    range: {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "Last 3 months",
    range: {
      from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "Last 6 months",
    range: {
      from: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "Last year",
    range: {
      from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "Last 3 years",
    range: {
      from: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  },
  {
    label: "All time",
    range: {
      from: undefined,
      to: undefined,
    },
  },
];

function DateRangePickerWithPresets() {
  const minDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.minDate ? new Date(search.minDate) : undefined),
  });
  const maxDate = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.maxDate ? new Date(search.maxDate) : undefined),
  });
  const navigate = useNavigate({ from: "/stars" });
  const [isOpen, setIsOpen] = useState(false);

  const dateRange = {
    from: minDate,
    to: maxDate,
  };

  const setDateRange = (range: { from?: Date; to?: Date }) => {
    navigate({
      search: (prev) => ({
        ...prev,
        minDate: range.from ? range.from.toISOString().split("T")[0] : undefined,
        maxDate: range.to ? range.to.toISOString().split("T")[0] : undefined,
      }),
    });
  };

  const formatDisplayValue = () => {
    if (!dateRange.from && !dateRange.to) {
      // return "Select date range";
      return "";
    }
    if (dateRange.from && !dateRange.to) {
      return `From ${format(dateRange.from, "MMM d, yyyy")}`;
    }
    if (!dateRange.from && dateRange.to) {
      return `Until ${format(dateRange.to, "MMM d, yyyy")}`;
    }
    if (dateRange.from && dateRange.to) {
      if (dateRange.from.getTime() === dateRange.to.getTime()) {
        return format(dateRange.from, "MMM d, yyyy");
      }
      return `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`;
    }
    // return "Select date range";
    return "";
  };

  const displayValue = formatDisplayValue();

  return (
    <>
      {/* <Label className="block text-sm font-medium text-gray-700 mb-1">Date range</Label> */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start text-left font-normal flex gap-2">
            <CalendarIcon className="h-4 w-4" />
            {displayValue}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-white text-gray-900" align="start">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="border-r bg-gray-50 p-2 flex flex-col gap-1">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm font-normal text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                  onClick={() => {
                    setDateRange(preset.range);
                    setIsOpen(false);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {/* Calendar */}
            <div className="flex-1 p-3 bg-white">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  if (range) {
                    setDateRange({
                      from: range.from,
                      to: range.to,
                    });
                  }
                }}
                numberOfMonths={2}
                defaultMonth={dateRange.from}
                className="text-gray-900"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function ActivityPresetFilter() {
  const activePreset = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.activePreset || "all",
  });
  const navigate = useNavigate({ from: "/stars" });

  const activityOptions = [
    { value: "all", label: "All repositories" },
    { value: "week", label: "Active last week" },
    { value: "month", label: "Active last month" },
    { value: "year", label: "Active last year" },
    { value: "5years", label: "Active last 5 years" },
    { value: "10years", label: "Active last 10 years" },
  ];

  return (
    <div>
      <Label htmlFor="activity" className="block text-sm font-medium text-gray-700 mb-1">
        Repository Activity
      </Label>
      <Select
        value={activePreset}
        onValueChange={(value: string) =>
          navigate({ search: (prev) => ({ ...prev, activePreset: value }) })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Filter by activity" />
        </SelectTrigger>
        <SelectContent className="bg-white text-gray-900 border border-gray-200 shadow-lg">
          {activityOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SortControls() {
  const sortBy = useSearch({
    from: "/_authenticated/stars",
    select: (search) =>
      (search.sortBy as "stars" | "name" | "starredDate" | "createdDate" | "pushedDate") ||
      "starredDate",
  });
  const sortOrder = useSearch({
    from: "/_authenticated/stars",
    select: (search) => (search.sortOrder as "asc" | "desc") || "desc",
  });
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div className="flex items-end gap-2">
      {/* <Label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
        Sort by
      </Label> */}
      <div className="flex space-x-2">
        <Select
          value={sortBy}
          onValueChange={(value: "stars" | "name" | "starredDate" | "createdDate" | "pushedDate") =>
            navigate({
              search: (prev) => ({ ...prev, sortBy: value }),
            })
          }
        >
          <SelectTrigger className="flex-1 h-8 rounded-md px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white text-gray-900 border border-gray-200 shadow-lg">
            <SelectItem
              value="starredDate"
              className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
            >
              Sort by Starred Date {sortOrder === "desc" ? "(newest first)" : "(oldest first)"}
            </SelectItem>
            <SelectItem
              value="createdDate"
              className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
            >
              Sort by Creation Date {sortOrder === "desc" ? "(newest first)" : "(oldest first)"}
            </SelectItem>
            <SelectItem
              value="pushedDate"
              className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
            >
              Sort by Last Push Date {sortOrder === "desc" ? "(newest first)" : "(oldest first)"}
            </SelectItem>
            <SelectItem value="stars" className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100">
              Sort by Stars {sortOrder === "desc" ? "(highest first)" : "(lowest first)"}
            </SelectItem>
            <SelectItem value="name" className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100">
              Sort by Name {sortOrder === "desc" ? "(Z-A)" : "(A-Z)"}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigate({
              search: (prev) => ({ ...prev, sortOrder: sortOrder === "asc" ? "desc" : "asc" }),
            })
          }
          className="px-3 py-2"
        >
          {sortOrder === "asc" ? "↓" : "↑"}
        </Button>
      </div>
    </div>
  );
}

function ClearFiltersButton() {
  const navigate = useNavigate({ from: "/stars" });

  return (
    <div className="mt-4">
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          navigate({
            search: {
              search: "",
              owner: "",
              tags: "",
              language: "all",
              minStars: undefined,
              maxStars: undefined,
              minDate: undefined,
              maxDate: undefined,
              activePreset: "all",
              sortBy: "starredDate",
              sortOrder: "desc",
              filtersExpanded: undefined,
            },
          })
        }
        className="inline-flex items-center"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
          <title>Clear filters</title>
        </svg>
        Clear filters
      </Button>
    </div>
  );
}

const RepositoryCard = React.memo(function RepositoryCard({
  repo,
  selectedLanguage,
  onLanguageClick,
}: {
  repo: StarredRepoMessage;
  selectedLanguage: string;
  onLanguageClick: (language: string) => void;
}) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg" onClick={() => console.log(repo)}>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (repo.language) {
                  onLanguageClick(repo.language);
                }
              }}
              className={`transition-colors cursor-pointer ${
                selectedLanguage === repo.language
                  ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {repo.language}
            </Button>
          )}
          <div className="text-xs text-gray-500 ml-auto mt-4 flex flex-col items-end gap-1">
            <span>
              Starred on{" "}
              {new Date(repo.starred_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            {repo.pushed_at && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      Last push {formatDistanceToNow(new Date(repo.pushed_at), { addSuffix: true })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {new Date(repo.pushed_at).toLocaleString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const RepositoryGrid = function RepositoryGrid({ repoList }: { repoList: StarredRepoMessage[] }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate({ from: "/stars" });
  const selectedLanguage = useSearch({
    from: "/_authenticated/stars",
    select: (search) => search.language || "all",
  });

  // Calculate items per row based on screen size
  const getItemsPerRow = () => {
    if (typeof window === "undefined") return 3; // SSR fallback
    if (window.innerWidth >= 1280) return 3; // xl: 3 cards per row
    if (window.innerWidth >= 768) return 2; // md: 2 cards per row
    return 1; // sm: 1 card per row
  };

  const itemsPerRow = getItemsPerRow();
  const rowCount = Math.ceil(repoList.length / itemsPerRow);

  // Virtualizer configuration for rows
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 185, // Estimated height of each row
    overscan: 3, // Number of rows to render outside visible area
    gap: 25,
  });

  if (repoList.length === 0) {
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
      className="max-h-fit min-h-[600px] overflow-auto"
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
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowStart = virtualRow.index * itemsPerRow;
          const rowEnd = Math.min(rowStart + itemsPerRow, repoList.length);
          const rowRepos = repoList.slice(rowStart, rowEnd);

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 h-full">
                {rowRepos.map((repo) => (
                  <RepositoryCard
                    key={repo.id}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
