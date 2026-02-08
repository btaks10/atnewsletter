"use client";

import { useState, useEffect, useCallback } from "react";

interface ArticleData {
  id: string;
  article_id: string;
  summary: string;
  category: string;
  cluster_id: number | null;
  is_primary_in_cluster: boolean;
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
    notes: string | null;
  } | null;
}

interface ArticlesResponse {
  date: string;
  total: number;
  sources: string[];
  categories: Record<string, ArticleData[]>;
}

interface GroupedArticle {
  primary: ArticleData;
  related: ArticleData[];
}

function groupByClusters(articles: ArticleData[]): GroupedArticle[] {
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

  const result: GroupedArticle[] = [];

  for (const [, group] of clusters) {
    const primary =
      group.find((a) => a.is_primary_in_cluster) || group[0];
    const related = group.filter((a) => a !== primary);
    result.push({ primary, related });
  }

  for (const article of standalone) {
    result.push({ primary: article, related: [] });
  }

  return result;
}

export default function ArticlesPage() {
  const [date, setDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [data, setData] = useState<ArticlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>(
    {}
  );
  const [toast, setToast] = useState("");

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

  async function handleFeedback(articleId: string, feedback: string) {
    setFeedbackState((prev) => ({ ...prev, [articleId]: feedback }));

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: articleId, feedback }),
      });
      setToast("Feedback saved");
      setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("Failed to save feedback");
      setTimeout(() => setToast(""), 2000);
    }
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
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-700 rounded-md px-3 py-1.5 text-sm bg-gray-800 text-gray-100"
        />
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
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading articles...</p>}

      {!loading && data && data.total === 0 && (
        <p className="text-gray-400 text-sm">
          No articles found for {data.date}.
        </p>
      )}

      {!loading && data && data.total > 0 && (
        <div className="space-y-8">
          <p className="text-sm text-gray-400">
            {data.date} &mdash; {data.total} article
            {data.total !== 1 ? "s" : ""}
          </p>

          {Object.entries(data.categories).map(([cat, articles]) => {
            const grouped = groupByClusters(articles as ArticleData[]);
            return (
              <section key={cat}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-800 pb-2 mb-4">
                  {cat}
                </h2>
                <div className="space-y-3">
                  {grouped.map(({ primary, related }) => (
                    <div
                      key={primary.id}
                      className="bg-gray-900 rounded-lg border border-gray-800 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <a
                            href={primary.articles.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-gray-100 hover:text-blue-400 leading-snug"
                          >
                            {primary.articles.title}
                          </a>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                            <span>{primary.articles.source}</span>
                            {primary.articles.author && (
                              <>
                                <span>&bull;</span>
                                <span>{primary.articles.author}</span>
                              </>
                            )}
                            <span>&bull;</span>
                            <span>
                              {new Date(
                                primary.articles.published_at
                              ).toLocaleDateString()}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                primary.articles.source_type === "gnews_api"
                                  ? "bg-blue-900 text-blue-300"
                                  : "bg-gray-800 text-gray-400"
                              }`}
                            >
                              {primary.articles.source_type === "gnews_api"
                                ? "API"
                                : "RSS"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() =>
                              handleFeedback(primary.article_id, "relevant")
                            }
                            className={`w-6 h-6 flex items-center justify-center rounded text-sm font-medium transition-colors ${
                              feedbackState[primary.article_id] === "relevant"
                                ? "bg-green-800 text-green-300"
                                : "text-green-600 bg-gray-800 hover:bg-gray-700"
                            }`}
                            title="Relevant"
                          >
                            +
                          </button>
                          <button
                            onClick={() =>
                              handleFeedback(
                                primary.article_id,
                                "not_relevant"
                              )
                            }
                            className={`w-6 h-6 flex items-center justify-center rounded text-sm font-medium transition-colors ${
                              feedbackState[primary.article_id] ===
                              "not_relevant"
                                ? "bg-red-800 text-red-300"
                                : "text-red-600 bg-gray-800 hover:bg-gray-700"
                            }`}
                            title="Not relevant"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {primary.summary && (
                        <p className="mt-2 text-sm text-gray-400">
                          {primary.summary}
                        </p>
                      )}
                      {related.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          Also covered by:{" "}
                          {related.map((r, i) => (
                            <span key={r.id}>
                              {i > 0 && ", "}
                              <a
                                href={r.articles.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline"
                              >
                                {r.articles.source}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-100 text-gray-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
