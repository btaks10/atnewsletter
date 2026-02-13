"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SYNC_STAGES = [
  { url: "/api/ingest-articles", label: "Ingesting RSS feeds..." },
  { url: "/api/ingest-gnews", label: "Querying GNews API..." },
  { url: "/api/analyze-articles", label: "Analyzing articles with Claude..." },
  { url: "/api/cluster-stories", label: "Clustering related stories..." },
  { url: "/api/generate-summaries", label: "Generating category summaries..." },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const abortRef = useRef(false);

  const links = [
    { href: "/", label: "Articles" },
    { href: "/sources", label: "Sources" },
  ];

  const fetchLastSync = useCallback(() => {
    return fetch("/api/dashboard/sync")
      .then((res) => res.json())
      .then((data) => {
        if (data.last_sync) setLastSync(data.last_sync);
        return data;
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  async function handleSync() {
    setSyncing(true);
    abortRef.current = false;

    const startTime = Date.now();
    let totalNew = 0;
    let totalRelevant = 0;

    const stageErrors: string[] = [];
    for (const stage of SYNC_STAGES) {
      if (abortRef.current) break;
      setSyncToast(stage.label);

      try {
        const res = await fetch(stage.url, { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          stageErrors.push(stage.label);
          continue; // Continue to next stage instead of aborting
        }

        // Collect stats from each stage
        if (data.new_articles_inserted) totalNew += data.new_articles_inserted;
        if (data.claude_analysis?.articles_relevant) {
          totalRelevant += data.claude_analysis.articles_relevant;
        }
      } catch {
        stageErrors.push(stage.label);
        continue; // Continue to next stage instead of aborting
      }
    }

    // Log pipeline stats so "Last sync" updates
    await fetch("/api/dashboard/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articles_ingested: totalNew,
        articles_relevant: totalRelevant,
        duration_ms: Date.now() - startTime,
      }),
    }).catch(() => {});

    fetchLastSync();
    setSyncing(false);
    const errNote = stageErrors.length > 0
      ? ` (${stageErrors.length} stage${stageErrors.length > 1 ? "s" : ""} timed out)`
      : "";
    setSyncToast(
      `Sync complete — ${totalNew} new articles, ${totalRelevant} relevant${errNote}`
    );
    setTimeout(() => setSyncToast(null), 8000);
  }

  return (
    <div>
      <nav className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="font-bold text-lg text-gray-100">
              AT News Monitor
            </Link>
            <div className="flex items-center gap-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm ${
                    pathname === link.href
                      ? "text-white font-medium"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex items-center gap-3 ml-2 pl-4 border-l border-gray-700">
                {lastSync && (
                  <span className="text-xs text-gray-500">
                    Last sync: {timeAgo(lastSync)}
                  </span>
                )}
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    syncing
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700"
                  }`}
                >
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Sync toast */}
      {syncToast && (
        <div className="fixed bottom-4 right-4 bg-gray-100 text-gray-900 text-sm px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm">
          {syncToast}
        </div>
      )}
    </div>
  );
}
