"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ArticleData {
  id: string;
  article_id: string;
  summary: string;
  category: string;
  cluster_id: number | null;
  is_primary_in_cluster: boolean;
  is_international: boolean;
  articles: {
    id: string;
    title: string;
    url: string;
    source: string;
    source_type: string;
    author: string | null;
    published_at: string;
  };
  feedback: {
    feedback: string;
    reason: string | null;
    notes: string | null;
  } | null;
}

interface ArticlesResponse {
  date: string;
  total: number;
  total_analyzed: number;
  sources: string[];
  categories: Record<string, ArticleData[]>;
  clusters: Record<string, string>;
}

interface ClusterGroup {
  clusterHeadline: string | null;
  clusterArticleCount: number;
  articles: ArticleData[];
}

function groupByClusters(
  articles: ArticleData[],
  clusterHeadlines: Record<string, string>
): ClusterGroup[] {
  const clusters = new Map<number, ArticleData[]>();
  const standalone: ArticleData[] = [];

  for (const article of articles) {
    if (article.cluster_id) {
      if (!clusters.has(article.cluster_id)) {
        clusters.set(article.cluster_id, []);
      }
      clusters.get(article.cluster_id)!.push(article);
    } else {
      standalone.push(article);
    }
  }

  const result: ClusterGroup[] = [];

  for (const [clusterId, group] of clusters) {
    result.push({
      clusterHeadline: clusterHeadlines[String(clusterId)] || null,
      clusterArticleCount: group.length,
      articles: group,
    });
  }

  for (const article of standalone) {
    result.push({
      clusterHeadline: null,
      clusterArticleCount: 1,
      articles: [article],
    });
  }

  return result;
}

function sortByInternational(articles: ArticleData[]): ArticleData[] {
  return [...articles].sort((a, b) => {
    if (a.is_international === b.is_international) return 0;
    return a.is_international ? 1 : -1;
  });
}

function buildDigest(data: ArticlesResponse) {
  const allGrouped: { group: ClusterGroup; category: string }[] = [];
  for (const [cat, articles] of Object.entries(data.categories)) {
    for (const g of groupByClusters(
      articles as ArticleData[],
      data.clusters || {}
    )) {
      allGrouped.push({ group: g, category: cat });
    }
  }

  allGrouped.sort(
    (a, b) => b.group.clusterArticleCount - a.group.clusterArticleCount
  );

  const topStories = allGrouped.filter(
    (g) => g.group.clusterArticleCount > 1
  );

  const catBreakdown: {
    name: string;
    stories: number;
    articles: number;
  }[] = [];
  for (const [cat, articles] of Object.entries(data.categories)) {
    const grouped = groupByClusters(
      articles as ArticleData[],
      data.clusters || {}
    );
    catBreakdown.push({
      name: cat,
      stories: grouped.length,
      articles: (articles as ArticleData[]).length,
    });
  }

  return {
    totalAnalyzed: data.total_analyzed,
    totalRelevant: data.total,
    uniqueSources: data.sources.length,
    uniqueStories: allGrouped.length,
    topStories: topStories.slice(0, 7),
    catBreakdown,
  };
}

const FEEDBACK_REASONS = [
  { value: "not_relevant", label: "Not relevant to antisemitism" },
  { value: "duplicate", label: "Duplicate article" },
  { value: "wrong_category", label: "Wrong category" },
  { value: "low_priority", label: "Low priority / not newsworthy" },
];

export default function ArticlesPage() {
  const [date, setDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [digestOpen, setDigestOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<ArticlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>(
    {}
  );
  const [toast, setToast] = useState("");
  const [reasonDropdown, setReasonDropdown] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const reasonDropdownRef = useRef<string | null>(null);
  reasonDropdownRef.current = reasonDropdown;

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (category) params.set("category", category);
    if (source) params.set("source", source);
    if (sourceType) params.set("source_type", sourceType);

    try {
      const res = await fetch(`/api/dashboard/articles?${params}`);
      const json = await res.json();
      setData(json);

      const fb: Record<string, string> = {};
      for (const articles of Object.values(json.categories || {})) {
        for (const article of articles as ArticleData[]) {
          if (article.feedback) {
            fb[article.article_id] = article.feedback.feedback;
          }
        }
      }
      setFeedbackState(fb);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, category, source, sourceType]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Close reason dropdown on click-away
  useEffect(() => {
    if (!reasonDropdown) return;
    function handleClickAway(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-reason-dropdown]")) {
        setReasonDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [reasonDropdown]);

  async function handleFeedback(
    articleId: string,
    feedback: string,
    reason?: string
  ) {
    const isUndo = feedbackState[articleId] === feedback;

    setFeedbackState((prev) => {
      const next = { ...prev };
      if (isUndo) {
        delete next[articleId];
      } else {
        next[articleId] = feedback;
      }
      return next;
    });

    setReasonDropdown(null);

    try {
      if (isUndo) {
        await fetch("/api/feedback", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: articleId }),
        });
        setToast("Feedback removed");
      } else {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: articleId, feedback, reason }),
        });
        setToast("Feedback saved");
      }
      setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("Failed to update feedback");
      setTimeout(() => setToast(""), 2000);
    }
  }

  function renderArticleCard(article: ArticleData) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <a
              href={article.articles.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-100 hover:text-blue-400 leading-snug"
            >
              {article.articles.title}
            </a>
            <span className="text-xs text-gray-500 shrink-0">
              {article.articles.source}
              {article.articles.source_type === "gnews_api" && (
                <span className="ml-1 text-blue-400">API</span>
              )}
              {article.is_international && (
                <span className="ml-1 text-amber-400 font-medium">INTL</span>
              )}
            </span>
          </div>
          {article.summary && (
            <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
              {article.summary}
            </p>
          )}
        </div>
        <div
          className="shrink-0 mt-0.5 relative"
          data-reason-dropdown
        >
          <button
            onClick={() => {
              if (feedbackState[article.article_id] === "not_relevant") {
                handleFeedback(article.article_id, "not_relevant");
              } else {
                setReasonDropdown(
                  reasonDropdown === article.article_id
                    ? null
                    : article.article_id
                );
              }
            }}
            className={`w-5 h-5 flex items-center justify-center rounded text-xs font-medium transition-colors ${
              feedbackState[article.article_id] === "not_relevant"
                ? "bg-red-800 text-red-300"
                : "text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300"
            }`}
            title="Flag this article"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M3.5 2a.5.5 0 0 1 .5.5v1h8.5a.5.5 0 0 1 .404.796L10.902 7.5l2.002 3.204A.5.5 0 0 1 12.5 11.5H4v2a.5.5 0 0 1-1 0v-11A.5.5 0 0 1 3.5 2Z" />
            </svg>
          </button>
          {reasonDropdown === article.article_id && (
            <div className="absolute right-0 top-7 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-2 w-52">
              <p className="px-3 pb-2 text-[11px] text-gray-400 border-b border-gray-700 mb-1">
                What&apos;s wrong with this article?
              </p>
              {FEEDBACK_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() =>
                    handleFeedback(
                      article.article_id,
                      "not_relevant",
                      r.value
                    )
                  }
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const categories = [
    "Hate Crimes & Violence",
    "Government & Policy",
    "Campus & Academia",
    "Legal & Civil Rights",
    "Media & Public Discourse",
    "Organizational Response",
    "International",
    "Other",
  ];

  return (
    <div>
      {/* Date + Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-700 rounded-md px-3 py-1.5 text-sm bg-gray-800 text-gray-100"
        />
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors border ${
            filtersOpen || category || source || sourceType
              ? "bg-gray-800 text-gray-100 border-gray-600"
              : "bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
              clipRule="evenodd"
            />
          </svg>
          Filters
          {(category || source || sourceType) && (
            <span className="bg-gray-600 text-gray-200 rounded-full px-1.5 text-[10px]">
              {[category, source, sourceType].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Expandable filters */}
      {filtersOpen && (
        <div className="flex flex-wrap gap-3 mb-4 pl-1">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-700 rounded-md px-3 py-1.5 text-sm bg-gray-800 text-gray-100"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="border border-gray-700 rounded-md px-3 py-1.5 text-sm bg-gray-800 text-gray-100"
          >
            <option value="">All Sources</option>
            {(data?.sources || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="border border-gray-700 rounded-md px-3 py-1.5 text-sm bg-gray-800 text-gray-100"
          >
            <option value="">All Types</option>
            <option value="rss">RSS</option>
            <option value="gnews_api">GNews API</option>
          </select>
          {(category || source || sourceType) && (
            <button
              onClick={() => {
                setCategory("");
                setSource("");
                setSourceType("");
              }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading articles...</p>}

      {!loading && data && data.total === 0 && (
        <p className="text-gray-400 text-sm">
          No articles found for {data.date}.
        </p>
      )}

      {/* TLDR Digest — collapsible summary card */}
      {!loading &&
        data &&
        data.total > 0 &&
        (() => {
          const digest = buildDigest(data);
          return (
            <div className="mb-6">
              <button
                onClick={() => setDigestOpen(!digestOpen)}
                className={`w-full flex items-center justify-between bg-gray-900 border border-gray-800 px-5 py-3 hover:bg-gray-800/70 transition-colors ${
                  digestOpen ? "rounded-t-lg" : "rounded-lg"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-100">
                    TLDR
                  </span>
                  <span className="text-xs text-gray-500">
                    {digest.totalAnalyzed} reviewed, {digest.totalRelevant}{" "}
                    relevant, {digest.uniqueStories} stories
                  </span>
                </div>
                <span className="text-gray-500 text-xs">
                  {digestOpen ? "Hide" : "Show"}
                </span>
              </button>

              {digestOpen && (
                <div className="bg-gray-900 border border-t-0 border-gray-800 rounded-b-lg px-5 pb-5">
                  {/* Scan summary */}
                  <div className="pt-4 pb-4 border-b border-gray-800">
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Scanned{" "}
                      <span className="text-gray-100 font-medium">
                        {digest.totalAnalyzed} articles
                      </span>{" "}
                      from{" "}
                      <span className="text-gray-100 font-medium">
                        {digest.uniqueSources} sources
                      </span>
                      .{" "}
                      <span className="text-gray-100 font-medium">
                        {digest.totalRelevant}
                      </span>{" "}
                      flagged as relevant across{" "}
                      <span className="text-gray-100 font-medium">
                        {digest.catBreakdown.length} categories
                      </span>
                      , distilling to{" "}
                      <span className="text-gray-100 font-medium">
                        {digest.uniqueStories} distinct stories
                      </span>
                      .
                    </p>

                    {/* Category breakdown pills */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {digest.catBreakdown.map((cat) => (
                        <span
                          key={cat.name}
                          className="text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full"
                        >
                          {cat.name}{" "}
                          <span className="text-gray-500">
                            {cat.stories}
                            {cat.stories !== cat.articles &&
                              ` (${cat.articles} articles)`}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top stories */}
                  {digest.topStories.length > 0 && (
                    <div className="pt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        Most Covered Stories
                      </h3>
                      <div className="space-y-3">
                        {digest.topStories.map(({ group, category: cat }) => (
                          <button
                            key={group.articles[0].id}
                            className="flex gap-3 items-start w-full text-left hover:bg-gray-800/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                            onClick={() => {
                              const clusterId = group.articles[0].cluster_id;
                              if (!clusterId) return;
                              setCollapsedCats((prev) => ({
                                ...prev,
                                [cat]: false,
                              }));
                              setTimeout(() => {
                                const el = document.getElementById(
                                  `cluster-${clusterId}`
                                );
                                if (el) {
                                  el.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                                  el.classList.add("ring-2", "ring-gray-500");
                                  setTimeout(
                                    () =>
                                      el.classList.remove(
                                        "ring-2",
                                        "ring-gray-500"
                                      ),
                                    2000
                                  );
                                }
                              }, 50);
                            }}
                          >
                            <span className="text-xs font-medium text-gray-600 bg-gray-800 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                              {group.clusterArticleCount}x
                            </span>
                            <div className="min-w-0">
                              <span className="text-sm text-gray-200 leading-snug">
                                {group.clusterHeadline ||
                                  group.articles[0].summary ||
                                  group.articles[0].articles.title}
                              </span>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {cat} &bull;{" "}
                                {group.articles
                                  .map((a) => a.articles.source)
                                  .join(", ")}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Single-source stories count */}
                  {digest.uniqueStories - digest.topStories.length > 0 && (
                    <p className="text-xs text-gray-600 mt-4 pt-3 border-t border-gray-800">
                      + {digest.uniqueStories - digest.topStories.length}{" "}
                      single-source stories across all categories
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* Articles list */}
      {!loading && data && data.total > 0 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            {data.date} &mdash; {data.total} article
            {data.total !== 1 ? "s" : ""}
          </p>

          {Object.entries(data.categories).map(([cat, articles]) => {
            const sorted = sortByInternational(articles as ArticleData[]);
            const grouped = groupByClusters(sorted, data.clusters || {});
            const isCollapsed = collapsedCats[cat] ?? true;
            return (
              <section key={cat}>
                <button
                  onClick={() =>
                    setCollapsedCats((prev) => ({
                      ...prev,
                      [cat]: !isCollapsed,
                    }))
                  }
                  className="w-full flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2 group"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {cat}
                    </h2>
                    <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                      {(articles as ArticleData[]).length}
                    </span>
                  </div>
                  <span className="text-gray-600 text-xs group-hover:text-gray-400 transition-colors">
                    {isCollapsed ? "Show" : "Hide"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1">
                    {grouped.map((cluster) =>
                      cluster.clusterHeadline &&
                      cluster.clusterArticleCount > 1 ? (
                        <div
                          key={`cluster-${cluster.articles[0].id}`}
                          id={cluster.articles[0].cluster_id ? `cluster-${cluster.articles[0].cluster_id}` : undefined}
                          className="border border-gray-600 rounded-lg overflow-hidden transition-shadow"
                        >
                          <div className="bg-gray-800 px-3 py-2 border-b border-gray-600 flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-200">
                              {cluster.clusterHeadline}
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
                              {cluster.clusterArticleCount}
                            </span>
                          </div>
                          <div className="divide-y divide-gray-800/50">
                            {cluster.articles.map((article) => (
                              <div key={article.id} className="px-3 py-2">
                                {renderArticleCard(article)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        cluster.articles.map((article) => (
                          <div
                            key={article.id}
                            className="bg-gray-900 rounded border border-gray-800 px-3 py-2"
                          >
                            {renderArticleCard(article)}
                          </div>
                        ))
                      )
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-100 text-gray-900 text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
