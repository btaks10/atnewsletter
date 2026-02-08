"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#e11d48",
  "#65a30d",
];

const TIME_RANGES = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function InsightsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/insights?days=${days}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-500 text-sm">Failed to load data.</p>;

  const lineData = (data.pipeline_stats || []).map((stat: any) => ({
    date: stat.run_date,
    ingested: stat.articles_ingested,
    keyword_passed: stat.articles_keyword_passed,
    relevant: stat.articles_relevant,
  }));

  const categoryData = Object.entries(data.category_breakdown || {})
    .map(([name, count]) => ({ name, count: count as number }))
    .sort((a, b) => b.count - a.count);

  const sourceData = Object.entries(data.source_breakdown || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 15)
    .map(([name, count]) => ({ name, count: count as number }));

  const sourceTypeData = Object.entries(data.source_type_breakdown || {}).map(
    ([name, value]) => ({
      name: name === "gnews_api" ? "GNews" : "RSS",
      value: value as number,
    })
  );

  // Pipeline health averages
  const stats = data.pipeline_stats || [];
  const avgDuration = stats.length
    ? Math.round(
        stats.reduce((sum: number, s: any) => sum + (s.total_duration_ms || 0), 0) /
          stats.length /
          1000
      )
    : 0;
  const totalIngested = stats.reduce(
    (sum: number, s: any) => sum + (s.articles_ingested || 0),
    0
  );
  const totalKeywordPassed = stats.reduce(
    (sum: number, s: any) => sum + (s.articles_keyword_passed || 0),
    0
  );
  const totalRelevant = stats.reduce(
    (sum: number, s: any) => sum + (s.articles_relevant || 0),
    0
  );
  const keywordRate = totalIngested
    ? Math.round((totalKeywordPassed / totalIngested) * 100)
    : 0;
  const relevanceRate = totalKeywordPassed
    ? Math.round((totalRelevant / totalKeywordPassed) * 100)
    : 0;

  const fb = data.feedback_summary || {};

  return (
    <div className="space-y-8">
      {/* Time range selector */}
      <div className="flex gap-2">
        {TIME_RANGES.map((range) => (
          <button
            key={range.value}
            onClick={() => setDays(range.value)}
            className={`px-3 py-1.5 text-sm rounded-md ${
              days === range.value
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Pipeline health */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Avg Pipeline Time" value={`${avgDuration}s`} />
        <StatCard label="Total Ingested" value={totalIngested} />
        <StatCard label="Keyword Pass Rate" value={`${keywordRate}%`} />
        <StatCard label="Relevance Rate" value={`${relevanceRate}%`} />
        <StatCard label="Total Relevant" value={totalRelevant} />
      </div>

      {/* Line chart */}
      {lineData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-4">Volume Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="ingested"
                stroke="#94a3b8"
                name="Ingested"
              />
              <Line
                type="monotone"
                dataKey="keyword_passed"
                stroke="#f59e0b"
                name="Keyword Passed"
              />
              <Line
                type="monotone"
                dataKey="relevant"
                stroke="#2563eb"
                name="Relevant"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category breakdown */}
        {categoryData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-4">By Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={160}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Source type pie */}
        {sourceTypeData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-4">By Source Type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceTypeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {sourceTypeData.map((_: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top sources */}
      {sourceData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-4">Top Sources</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                dataKey="name"
                type="category"
                width={150}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Feedback summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold mb-4">Feedback Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Feedback" value={fb.total || 0} />
          <StatCard label="Marked Relevant" value={fb.relevant || 0} />
          <StatCard
            label="Marked Not Relevant"
            value={fb.not_relevant || 0}
          />
        </div>
      </div>
    </div>
  );
}
