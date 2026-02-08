"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const links = [
    { href: "/", label: "Articles" },
    { href: "/insights", label: "Insights" },
    { href: "/sources", label: "Sources" },
  ];

  const fetchLastSync = useCallback(() => {
    fetch("/api/dashboard/sync")
      .then((res) => res.json())
      .then((data) => {
        if (data.last_sync) setLastSync(data.last_sync);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  async function handleSync() {
    setSyncing(true);
    setSyncToast(null);
    try {
      const res = await fetch("/api/dashboard/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncToast(
          `Sync complete — ${data.analyze?.claude_analysis?.articles_relevant ?? 0} relevant articles found`
        );
        fetchLastSync();
      } else {
        setSyncToast(`Sync failed: ${data.error}`);
      }
    } catch {
      setSyncToast("Sync failed: network error");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
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
        <div className="fixed bottom-4 right-4 bg-gray-100 text-gray-900 text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {syncToast}
        </div>
      )}
    </div>
  );
}
