"use client";

import { useState, useEffect } from "react";

interface RSSSource {
  id: number;
  name: string;
  type: string;
  url: string;
  is_active: boolean;
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

interface Keyword {
  id: number;
  keyword: string;
  tier: "primary" | "secondary" | "context";
  is_active: boolean;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">
      {message}
    </div>
  );
}

export default function SourcesPage() {
  const [data, setData] = useState<{
    rss_feeds: RSSSource[];
    gnews_queries: GNewsQuery[];
    keywords: Keyword[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Add feed form
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: "", url: "", type: "mainstream" });

  // Add GNews form
  const [showAddGNews, setShowAddGNews] = useState(false);
  const [newGNews, setNewGNews] = useState({ query: "", category: "", priority: "7" });

  // Add keyword form
  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ keyword: "", tier: "secondary" });

  function reload() {
    fetch("/api/dashboard/sources")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-500 text-sm">Failed to load.</p>;

  const typeLabel: Record<string, string> = {
    jewish_media: "Jewish Media",
    mainstream: "Mainstream",
    analysis: "Analysis",
  };

  const tierLabel: Record<string, string> = {
    primary: "Primary",
    secondary: "Secondary",
    context: "Context",
  };

  const tierColor: Record<string, string> = {
    primary: "bg-red-100 text-red-800",
    secondary: "bg-blue-100 text-blue-800",
    context: "bg-gray-100 text-gray-600",
  };

  // --- Handlers ---

  async function toggleFeed(id: number, is_active: boolean) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            rss_feeds: prev.rss_feeds.map((f) =>
              f.id === id ? { ...f, is_active: !is_active } : f
            ),
          }
        : prev
    );
    const res = await fetch(`/api/dashboard/feeds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !is_active }),
    });
    if (!res.ok) reload();
    else setToast(`Feed ${!is_active ? "activated" : "paused"}`);
  }

  async function deleteFeed(id: number, name: string) {
    if (!confirm(`Delete feed "${name}"?`)) return;
    setData((prev) =>
      prev ? { ...prev, rss_feeds: prev.rss_feeds.filter((f) => f.id !== id) } : prev
    );
    const res = await fetch(`/api/dashboard/feeds/${id}`, { method: "DELETE" });
    if (!res.ok) reload();
    else setToast("Feed deleted");
  }

  async function addFeed() {
    if (!newFeed.name || !newFeed.url) return;
    const res = await fetch("/api/dashboard/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFeed),
    });
    if (res.ok) {
      setNewFeed({ name: "", url: "", type: "mainstream" });
      setShowAddFeed(false);
      setToast("Feed added");
      reload();
    } else {
      const err = await res.json();
      setToast(`Error: ${err.error}`);
    }
  }

  async function toggleGNews(id: number, is_active: boolean) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            gnews_queries: prev.gnews_queries.map((q) =>
              q.id === id ? { ...q, is_active: !is_active } : q
            ),
          }
        : prev
    );
    const res = await fetch(`/api/dashboard/gnews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !is_active }),
    });
    if (!res.ok) reload();
    else setToast(`Query ${!is_active ? "activated" : "paused"}`);
  }

  async function deleteGNews(id: number) {
    if (!confirm("Delete this GNews query?")) return;
    setData((prev) =>
      prev
        ? { ...prev, gnews_queries: prev.gnews_queries.filter((q) => q.id !== id) }
        : prev
    );
    const res = await fetch(`/api/dashboard/gnews/${id}`, { method: "DELETE" });
    if (!res.ok) reload();
    else setToast("Query deleted");
  }

  async function addGNews() {
    if (!newGNews.query) return;
    const res = await fetch("/api/dashboard/gnews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: newGNews.query,
        category: newGNews.category || null,
        priority: parseInt(newGNews.priority) || 5,
      }),
    });
    if (res.ok) {
      setNewGNews({ query: "", category: "", priority: "7" });
      setShowAddGNews(false);
      setToast("Query added");
      reload();
    } else {
      const err = await res.json();
      setToast(`Error: ${err.error}`);
    }
  }

  async function toggleKeyword(id: number, is_active: boolean) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            keywords: prev.keywords.map((k) =>
              k.id === id ? { ...k, is_active: !is_active } : k
            ),
          }
        : prev
    );
    const res = await fetch(`/api/dashboard/keywords/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !is_active }),
    });
    if (!res.ok) reload();
    else setToast(`Keyword ${!is_active ? "activated" : "paused"}`);
  }

  async function deleteKeyword(id: number, keyword: string) {
    if (!confirm(`Delete keyword "${keyword}"?`)) return;
    setData((prev) =>
      prev ? { ...prev, keywords: prev.keywords.filter((k) => k.id !== id) } : prev
    );
    const res = await fetch(`/api/dashboard/keywords/${id}`, { method: "DELETE" });
    if (!res.ok) reload();
    else setToast("Keyword deleted");
  }

  async function addKeyword() {
    if (!newKeyword.keyword) return;
    const res = await fetch("/api/dashboard/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newKeyword),
    });
    if (res.ok) {
      setNewKeyword({ keyword: "", tier: "secondary" });
      setShowAddKeyword(false);
      setToast("Keyword added");
      reload();
    } else {
      const err = await res.json();
      setToast(`Error: ${err.error}`);
    }
  }

  // Group keywords by tier
  const keywordsByTier = {
    primary: data.keywords.filter((k) => k.tier === "primary"),
    secondary: data.keywords.filter((k) => k.tier === "secondary"),
    context: data.keywords.filter((k) => k.tier === "context"),
  };

  return (
    <div className="space-y-8">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* RSS Feeds */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            RSS Feeds ({data.rss_feeds.length})
          </h2>
          <button
            onClick={() => setShowAddFeed(!showAddFeed)}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            {showAddFeed ? "Cancel" : "+ Add Feed"}
          </button>
        </div>

        {showAddFeed && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={newFeed.name}
                onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                placeholder="NYT - World"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex-[2] min-w-[300px]">
              <label className="block text-xs text-gray-500 mb-1">URL</label>
              <input
                type="url"
                value={newFeed.url}
                onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                placeholder="https://rss.nytimes.com/..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={newFeed.type}
                onChange={(e) => setNewFeed({ ...newFeed, type: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="jewish_media">Jewish Media</option>
                <option value="mainstream">Mainstream</option>
                <option value="analysis">Analysis</option>
              </select>
            </div>
            <button
              onClick={addFeed}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        )}

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
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.rss_feeds.map((feed) => (
                <tr key={feed.id} className={!feed.is_active ? "opacity-50" : ""}>
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
                        !feed.is_active
                          ? "bg-yellow-100 text-yellow-800"
                          : feed.status === "success"
                            ? "bg-green-100 text-green-800"
                            : feed.status === "failure"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {!feed.is_active
                        ? "Paused"
                        : feed.status === "success"
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
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <button
                      onClick={() => toggleFeed(feed.id, feed.is_active)}
                      className="text-xs text-blue-600 hover:text-blue-800 mr-3"
                    >
                      {feed.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => deleteFeed(feed.id, feed.name)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GNews Queries */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            GNews Queries ({data.gnews_queries.length})
          </h2>
          <button
            onClick={() => setShowAddGNews(!showAddGNews)}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            {showAddGNews ? "Cancel" : "+ Add Query"}
          </button>
        </div>

        {showAddGNews && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-[2] min-w-[300px]">
              <label className="block text-xs text-gray-500 mb-1">Query</label>
              <input
                type="text"
                value={newGNews.query}
                onChange={(e) => setNewGNews({ ...newGNews, query: e.target.value })}
                placeholder={'"antisemitism" AND "campus"'}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md font-mono"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select
                value={newGNews.category}
                onChange={(e) => setNewGNews({ ...newGNews, category: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="">None</option>
                <option value="Hate Crimes & Violence">Hate Crimes & Violence</option>
                <option value="Government & Policy">Government & Policy</option>
                <option value="Campus & Academia">Campus & Academia</option>
                <option value="Legal & Civil Rights">Legal & Civil Rights</option>
                <option value="Media & Public Discourse">Media & Public Discourse</option>
                <option value="Organizational Response">Organizational Response</option>
                <option value="International">International</option>
              </select>
            </div>
            <div className="w-[80px]">
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <input
                type="number"
                value={newGNews.priority}
                onChange={(e) => setNewGNews({ ...newGNews, priority: e.target.value })}
                min="1"
                max="10"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <button
              onClick={addGNews}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        )}

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
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.gnews_queries.map((q) => (
                <tr key={q.id} className={!q.is_active ? "opacity-50" : ""}>
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
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <button
                      onClick={() => toggleGNews(q.id, q.is_active)}
                      className="text-xs text-blue-600 hover:text-blue-800 mr-3"
                    >
                      {q.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => deleteGNews(q.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Keywords */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Keywords ({data.keywords.length})
          </h2>
          <button
            onClick={() => setShowAddKeyword(!showAddKeyword)}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            {showAddKeyword ? "Cancel" : "+ Add Keyword"}
          </button>
        </div>

        {showAddKeyword && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Keyword</label>
              <input
                type="text"
                value={newKeyword.keyword}
                onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                placeholder="antisemitic"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Tier</label>
              <select
                value={newKeyword.tier}
                onChange={(e) => setNewKeyword({ ...newKeyword, tier: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="context">Context</option>
              </select>
            </div>
            <button
              onClick={addKeyword}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          <strong>Primary</strong> = any single match sends to Claude.{" "}
          <strong>Secondary</strong> = 2+ matches or 1 + context needed.{" "}
          <strong>Context</strong> = only with secondary keywords.
        </div>

        {(["primary", "secondary", "context"] as const).map((tier) => (
          <div key={tier} className="mb-6">
            <h3 className="text-sm font-semibold mb-2 capitalize">
              {tierLabel[tier]} ({keywordsByTier[tier].length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {keywordsByTier[tier].map((k) => (
                <span
                  key={k.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full ${
                    k.is_active ? tierColor[tier] : "bg-gray-100 text-gray-400 line-through"
                  }`}
                >
                  {k.keyword}
                  <button
                    onClick={() => toggleKeyword(k.id, k.is_active)}
                    className="hover:opacity-70"
                    title={k.is_active ? "Pause" : "Resume"}
                  >
                    {k.is_active ? "||" : "->"}
                  </button>
                  <button
                    onClick={() => deleteKeyword(k.id, k.keyword)}
                    className="hover:opacity-70 text-red-500"
                    title="Delete"
                  >
                    x
                  </button>
                </span>
              ))}
              {keywordsByTier[tier].length === 0 && (
                <span className="text-xs text-gray-400">No keywords in this tier</span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
