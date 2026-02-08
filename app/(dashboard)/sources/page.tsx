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

interface KeywordStats {
  matches_30d: number;
  matches_7d: number;
  relevant_matches: number;
  last_matched: string | null;
}

type Tab = "rss" | "gnews" | "keywords";

const TABS: { key: Tab; label: string; description: string }[] = [
  {
    key: "rss",
    label: "RSS Feeds",
    description:
      "RSS feeds are checked every day for new articles. Each feed is polled, and any new articles published in the last 24 hours are ingested into the pipeline. Articles from these feeds go through keyword filtering and then Claude analysis before appearing in the digest.",
  },
  {
    key: "gnews",
    label: "GNews Queries",
    description:
      "GNews queries search a news aggregation API for articles matching specific search terms. They complement RSS feeds by catching articles from sources we don't have direct RSS access to. Higher priority queries run first. Each query uses boolean search syntax (AND/OR) to target specific topics.",
  },
  {
    key: "keywords",
    label: "Keywords",
    description:
      "Keywords pre-filter articles before sending them to Claude for analysis, saving API costs by skipping irrelevant articles. Primary keywords pass immediately on any match. Secondary keywords need 2+ matches, or 1 match plus a context keyword. Context keywords only count when paired with a secondary keyword.",
  },
];

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function SourcesPage() {
  const [data, setData] = useState<{
    rss_feeds: RSSSource[];
    gnews_queries: GNewsQuery[];
    keywords: Keyword[];
    keyword_stats: Record<string, KeywordStats>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("rss");

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

  // Keyword helpers
  const stats = data.keyword_stats || {};

  function getStats(keyword: string): KeywordStats {
    return stats[keyword.toLowerCase()] || {
      matches_30d: 0,
      matches_7d: 0,
      relevant_matches: 0,
      last_matched: null,
    };
  }

  function sortedKeywordsForTier(tier: "primary" | "secondary" | "context") {
    return data.keywords
      .filter((k) => k.tier === tier)
      .sort((a, b) => {
        const sa = getStats(a.keyword);
        const sb = getStats(b.keyword);
        return sb.matches_30d - sa.matches_30d;
      });
  }

  function tierSummary(keywords: Keyword[]) {
    const active = keywords.filter((k) => k.is_active);
    const withMatches = active.filter(
      (k) => getStats(k.keyword).matches_30d > 0
    );
    return `${withMatches.length} of ${active.length} active keywords matched articles in the last 30 days`;
  }

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  const tabCounts: Record<Tab, number> = {
    rss: data.rss_feeds.length,
    gnews: data.gnews_queries.length,
    keywords: data.keywords.length,
  };

  // Find the max matches_30d across all keywords for bar scaling
  const maxMatches = Math.max(
    1,
    ...data.keywords.map((k) => getStats(k.keyword).matches_30d)
  );

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab description */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
        {currentTab.description}
      </div>

      {/* RSS Feeds Tab */}
      {activeTab === "rss" && (
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Articles (7d)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">New (7d)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.rss_feeds.map((feed) => (
                  <tr key={feed.id} className={!feed.is_active ? "opacity-50" : ""}>
                    <td className="px-4 py-3 text-sm font-medium">{feed.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                        {typeLabel[feed.type] || feed.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        !feed.is_active
                          ? "bg-yellow-100 text-yellow-800"
                          : feed.status === "success"
                            ? "bg-green-100 text-green-800"
                            : feed.status === "failure"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-500"
                      }`}>
                        {!feed.is_active ? "Paused" : feed.status === "success" ? "Active" : feed.status === "failure" ? "Failed" : "Unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{feed.articles_7d}</td>
                    <td className="px-4 py-3 text-sm text-right">{feed.new_articles_7d}</td>
                    <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                      <button onClick={() => toggleFeed(feed.id, feed.is_active)} className="text-xs text-blue-600 hover:text-blue-800 mr-3">
                        {feed.is_active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => deleteFeed(feed.id, feed.name)} className="text-xs text-red-600 hover:text-red-800">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* GNews Queries Tab */}
      {activeTab === "gnews" && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">GNews Queries ({data.gnews_queries.length})</h2>
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
              <button onClick={addGNews} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Add
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Results</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.gnews_queries.map((q) => (
                  <tr key={q.id} className={!q.is_active ? "opacity-50" : ""}>
                    <td className="px-4 py-3 text-xs font-mono max-w-xs truncate">{q.query}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{q.category || "--"}</td>
                    <td className="px-4 py-3 text-sm text-center">{q.priority}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${q.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                        {q.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {q.last_run_at ? new Date(q.last_run_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{q.last_result_count}</td>
                    <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                      <button onClick={() => toggleGNews(q.id, q.is_active)} className="text-xs text-blue-600 hover:text-blue-800 mr-3">
                        {q.is_active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => deleteGNews(q.id)} className="text-xs text-red-600 hover:text-red-800">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Keywords Tab */}
      {activeTab === "keywords" && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Keywords ({data.keywords.length})</h2>
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
              <button onClick={addKeyword} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Add
              </button>
            </div>
          )}

          {(["primary", "secondary", "context"] as const).map((tier) => {
            const tierKeywords = sortedKeywordsForTier(tier);
            return (
              <div key={tier} className="mb-8">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">
                    {tierLabel[tier]} ({tierKeywords.length})
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {tierSummary(tierKeywords)}
                </p>

                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Keyword</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">7d</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">30d</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-36">Matches (30d)</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Relevance</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Last Match</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tierKeywords.map((k) => {
                        const s = getStats(k.keyword);
                        const relevanceRate =
                          s.matches_30d > 0
                            ? Math.round((s.relevant_matches / s.matches_30d) * 100)
                            : 0;
                        const barWidth = Math.max(
                          0,
                          Math.round((s.matches_30d / maxMatches) * 100)
                        );
                        const noMatches = s.matches_30d === 0;

                        return (
                          <tr
                            key={k.id}
                            className={`${!k.is_active ? "opacity-40" : ""} ${
                              noMatches && k.is_active ? "bg-orange-50/50" : ""
                            }`}
                          >
                            <td className="px-4 py-2 text-sm font-medium">
                              {k.keyword}
                              {noMatches && k.is_active && (
                                <span className="ml-2 text-xs text-orange-500">no matches</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-right tabular-nums text-gray-600">
                              {s.matches_7d}
                            </td>
                            <td className="px-4 py-2 text-sm text-right tabular-nums font-medium">
                              {s.matches_30d}
                            </td>
                            <td className="px-4 py-2">
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    relevanceRate >= 50
                                      ? "bg-green-500"
                                      : relevanceRate > 0
                                        ? "bg-blue-500"
                                        : "bg-gray-300"
                                  }`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              {s.matches_30d > 0 ? (
                                <span
                                  className={`font-medium ${
                                    relevanceRate >= 50
                                      ? "text-green-700"
                                      : relevanceRate > 0
                                        ? "text-blue-700"
                                        : "text-gray-400"
                                  }`}
                                >
                                  {relevanceRate}%
                                  <span className="text-xs text-gray-400 ml-1">
                                    ({s.relevant_matches}/{s.matches_30d})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-gray-300">--</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">
                              {s.last_matched ? timeAgo(s.last_matched) : "Never"}
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              <button
                                onClick={() => toggleKeyword(k.id, k.is_active)}
                                className="text-xs text-blue-600 hover:text-blue-800 mr-2"
                              >
                                {k.is_active ? "Pause" : "Resume"}
                              </button>
                              <button
                                onClick={() => deleteKeyword(k.id, k.keyword)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {tierKeywords.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 text-sm text-gray-400 text-center">
                            No keywords in this tier
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
