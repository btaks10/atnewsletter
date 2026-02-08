"use client";

import { useState, useEffect } from "react";

interface RSSSource {
  name: string;
  type: string;
  url: string;
  status: string;
  last_run: string | null;
  articles_7d: number;
  new_articles_7d: number;
}

interface GNewsQuery {
  id: number;
  query: string;
  category: string | null;
  is_active: boolean;
  priority: number;
  last_run_at: string | null;
  last_result_count: number;
}

export default function SourcesPage() {
  const [data, setData] = useState<{
    rss_feeds: RSSSource[];
    gnews_queries: GNewsQuery[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/sources")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-500 text-sm">Failed to load.</p>;

  const typeLabel: Record<string, string> = {
    jewish_media: "Jewish Media",
    mainstream: "Mainstream",
    analysis: "Analysis",
  };

  return (
    <div className="space-y-8">
      {/* RSS Feeds */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          RSS Feeds ({data.rss_feeds.length})
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Articles (7d)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  New (7d)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.rss_feeds.map((feed) => (
                <tr key={feed.name}>
                  <td className="px-4 py-3 text-sm font-medium">
                    {feed.name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                      {typeLabel[feed.type] || feed.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        feed.status === "success"
                          ? "bg-green-100 text-green-800"
                          : feed.status === "failure"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {feed.status === "success"
                        ? "Active"
                        : feed.status === "failure"
                          ? "Failed"
                          : "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {feed.articles_7d}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {feed.new_articles_7d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GNews Queries */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          GNews Queries ({data.gnews_queries.length})
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Query
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Run
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Results
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.gnews_queries.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-3 text-xs font-mono max-w-xs truncate">
                    {q.query}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {q.category || "--"}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">{q.priority}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        q.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {q.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {q.last_run_at
                      ? new Date(q.last_run_at).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {q.last_result_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
