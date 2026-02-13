# AT News Monitor

Antisemitism news monitoring system. Scrapes RSS feeds and GNews API daily, filters by keyword relevance, analyzes with Claude AI, clusters related stories, sends a daily email digest, and serves a password-protected web dashboard.

Built for Bryan and Aryeh.

## Tech Stack

- **Framework**: Next.js 15 (App Router) on Vercel Hobby plan (60s function timeout)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL), accessed via `@supabase/supabase-js` with service role key
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` — Sonnet for article analysis, Haiku for story clustering
- **Email**: Resend for daily digest delivery
- **RSS**: `rss-parser` (CommonJS — needs `serverExternalPackages` in next.config.ts)
- **News API**: GNews Essentials plan (1000 req/day, max 25 articles/request)
- **Styling**: Tailwind CSS 4.0 (dark theme throughout, no component library)
- **Charts**: Recharts (used on Insights page, currently hidden)
- **Auth**: Cookie-based with SHA-256 token (Web Crypto API for Edge Runtime compatibility)

## Project Structure

```
app/
  layout.tsx                          Root layout (dark mode: bg-gray-950)
  globals.css                         Tailwind imports
  login/page.tsx                      Password login form
  (dashboard)/
    layout.tsx                        Nav bar, "Sync Now" button, last sync timestamp
    page.tsx                          Articles page: date picker, filters, TLDR card, article cards, feedback
    insights/page.tsx                 Analytics charts (hidden from nav)
    sources/page.tsx                  Source management: RSS feeds, GNews queries, Keywords tabs
  api/
    auth/route.ts                     Login endpoint (password -> SHA-256 cookie)
    feedback/route.ts                 Article feedback: POST upsert, DELETE undo
    ingest-articles/route.ts          RSS ingestion (cron + manual)
    ingest-gnews/route.ts             GNews API ingestion (cron + manual)
    analyze-articles/route.ts         Keyword filter + Claude relevance analysis (cron + manual)
    cluster-stories/route.ts          Story clustering by category (cron + manual)
    send-digest/route.ts              Email digest + pipeline stats logging (cron)
    trigger-digest/route.ts           Full pipeline orchestrator (ingest -> analyze -> cluster -> email)
    process-articles/route.ts         Lightweight sync (ingest -> analyze -> cluster, no email)
    dashboard/
      articles/route.ts               GET articles by date, grouped by category
      insights/route.ts               GET aggregate pipeline stats for charts
      sources/route.ts                GET RSS/GNews/keyword config + keyword effectiveness stats
      sync/route.ts                   GET last sync time, POST log pipeline stats
      feeds/route.ts                  POST new RSS feed
      feeds/[id]/route.ts             PATCH/DELETE individual feed
      gnews/route.ts                  POST new GNews query
      gnews/[id]/route.ts             PATCH/DELETE individual query
      keywords/route.ts               POST new keyword
      keywords/[id]/route.ts          PATCH/DELETE individual keyword

lib/
  supabase.ts                         Supabase client singleton (service role key)
  rss.ts                              RSS feed parsing and ingestion
  gnews.ts                            GNews API queries (200ms rate limit between requests)
  dedup.ts                            Title-based fuzzy dedup (Jaccard similarity >85% threshold)
  claude.ts                           Claude Sonnet analysis: batches of 20, 50s timeout, 1500 char window
  keyword-filter.ts                   3-tier keyword pre-filter (primary/secondary/context)
  article-extractor.ts                Full text extraction from URLs (<p> tag parsing, max 5000 chars)
  story-clustering.ts                 Claude Haiku clustering: parallel by category, batch DB writes
  email.ts                            Resend email template builder with cluster group rendering
  config.ts                           Category order, getActiveFeeds(), getArticleAgeCutoff()

middleware.ts                         Auth middleware (public pipeline endpoints, protected dashboard)
vercel.json                           7 staggered daily cron jobs
supabase/migration.sql                Full DB schema + seed data
```

## Pipeline Flow

The pipeline runs daily via 7 staggered Vercel cron jobs (each gets its own 60s window):

```
5:45am EST  /api/ingest-articles     Pull from ~78 RSS feeds
5:50am      /api/ingest-gnews        Run ~51 GNews API queries
5:58am      /api/analyze-articles    Pass 1: enrich + keyword filter + Claude analysis (batch of 20)
6:03am      /api/analyze-articles    Pass 2: process remaining unanalyzed
6:08am      /api/analyze-articles    Pass 3: process remaining unanalyzed
6:13am      /api/cluster-stories     Group unclustered articles by category (parallel Claude Haiku)
6:15am      /api/send-digest         Email digest via Resend + log pipeline_stats
```

Analysis runs 3 times because each invocation processes one batch of 20 within the 60s limit.

### Manual Sync (Dashboard)

The "Sync Now" button calls 4 endpoints sequentially: ingest-articles -> ingest-gnews -> analyze-articles -> cluster-stories. Each gets its own 60s window. Progress is shown via toast notifications. The full pipeline orchestrator at `/api/trigger-digest` runs all stages including clustering and email.

### Analysis Pipeline Detail

1. **Article enrichment**: Fetches full article text from URLs for articles with < 300 chars content (max 20 per run, 5 concurrent)
2. **Keyword pre-filter**: 3-tier system — any primary keyword = pass, 1+ secondary keyword = pass, no matches = skip
3. **Claude analysis**: Batches of 20 articles, 1500 char content window, 50s timeout guard. Returns relevance, summary, category
4. **Clustering**: Groups unclustered relevant articles by category, fires parallel Claude Haiku calls, batch-writes clusters to DB

## Database Schema

10 tables in Supabase (see `supabase/migration.sql` for full DDL):

| Table | Purpose |
|-------|---------|
| `articles` | Raw ingested articles (url unique, source_type: rss/gnews_api, duplicate_of for dedup) |
| `article_analysis` | Claude's relevance analysis (is_relevant, summary, category, cluster_id, is_international) |
| `article_feedback` | User +/- votes with reason (not_relevant/duplicate/wrong_category/low_priority) |
| `story_clusters` | Grouped stories (cluster_headline, article_count, category) |
| `pipeline_stats` | Run metrics (ingested/relevant counts, duration, email_sent flag) |
| `ingest_logs` | Per-feed ingestion results (source, status, articles_found/new) |
| `digest_logs` | Email delivery tracking |
| `rss_feeds` | DB-managed RSS feed config (name, url, type, is_active) |
| `gnews_queries` | DB-managed GNews queries (query, category, priority, is_active) |
| `keyword_config` | DB-managed keywords (keyword, tier: primary/secondary/context, is_active) |

## Environment Variables

```
SUPABASE_URL              Supabase project URL
SUPABASE_SERVICE_ROLE_KEY Backend key (full DB access)
SUPABASE_ANON_KEY         Public key (not currently used in app code)
ANTHROPIC_API_KEY         Claude API key
GNEWS_API_KEY             GNews Essentials API key
RESEND_API_KEY            Resend email API key
DASHBOARD_PASSWORD        Login password for web dashboard
TEST_TRIGGER_SECRET       Bearer token for trigger-digest + salt for auth cookie
DIGEST_TO_EMAIL           Recipient email address
DIGEST_FROM_EMAIL         Sender email address
MAX_ARTICLE_AGE_HOURS     Article freshness window (default: 48)
```

## Commands

```bash
npm run dev       # Local dev server (needs .env.local with all vars)
npm run build     # Production build
npm run start     # Start production server
```

Deployed automatically on push to `main` via Vercel.

## Authentication

- **Middleware** (`middleware.ts`): Checks `atnews-auth` cookie on all routes except pipeline API endpoints and `/login`
- **Token**: SHA-256 hash of `DASHBOARD_PASSWORD + TEST_TRIGGER_SECRET`
- **Cookie**: httpOnly, secure (in production), 30-day expiry
- **Pipeline endpoints are public**: They rely on Vercel cron signatures or bearer tokens for authorization, not cookies
- **Dashboard API routes** (`/api/dashboard/*`): Protected by middleware cookie check

## Architecture Patterns

- **All components are client components** except root layout. No separate components directory — UI is inline in page files.
- **State management**: Local useState/useEffect only. No global state, no context providers.
- **Data fetching**: Direct fetch calls in useEffect hooks. No SWR, React Query, or server actions.
- **Supabase pattern**: Service role key only. Check `{ error }` in response — Supabase client doesn't throw.
- **Error handling**: Try-catch with `{ success: false, error: message }` responses. No error boundaries.
- **Dark theme**: All pages use gray-950/900/800 Tailwind classes. No theme toggle.
- **Toast notifications**: Simple div-based, not a library.
- **Utility functions**: Defined inline in page files (groupByClusters, buildDigest, timeAgo).
- **Dedup strategy**: Title-based fuzzy dedup using Jaccard word-overlap similarity (>0.85 threshold). Runs during ingestion for both RSS and GNews. Duplicates stored with `duplicate_of` pointing to original, marked `analyzed: true` to skip pipeline.
- **Cluster display**: Topic-based grouping — cluster headline with article count header, all articles shown fully inside bordered container. Single-article clusters rendered as standalone cards.
- **International sorting**: `is_international` boolean on `article_analysis`. INTL articles sort to bottom within each category on both dashboard and email. Amber "INTL" badge on cards.

## Source Coverage

- **~78 RSS feeds**: Jewish media (11), mainstream US (35+), campus papers (6), analysis orgs (7), Google News RSS (11), Reddit (3)
- **~51 GNews queries**: Campus-specific, city-specific, policy, incidents, discourse, international
- **110+ keywords**: 11 primary, 50+ secondary, 40+ context

## Known Gotchas

- **Vercel 60s timeout**: Pipeline must be split into independent cron jobs. No single request can run the full pipeline.
- **Clustering timeout**: 80+ articles in one Claude call will timeout. Must parallelize by category and filter to unclustered only.
- **`max_tokens` for clustering**: Needs 8192+ with large article sets (currently 8192 for clustering, 16384 for analysis).
- **Supabase PostgREST**: Query builder isn't a true Promise — can't push to `Promise<any>[]` for `Promise.all`.
- **`rss-parser` is CJS**: Requires `serverExternalPackages: ["rss-parser"]` in next.config.ts.
- **Supabase doesn't throw**: Always check `{ error }` in the response object.
- **GNews limits**: Essentials plan is max 25 articles per request, not 100.
- **Build output masking**: `npx next build 2>&1 | tail -5` masks exit codes — don't chain with `&&`.
- **Vercel fire-and-forget**: Unreliable on serverless — always await async operations.
- **Google News RSS overlap**: Biggest scope win for coverage, but GNews API heavily overlaps with RSS at scale.
- **Google News RSS source labels**: Title format is "Headline - Publisher". Parsed via `lastIndexOf(" - ")` during RSS ingestion. Without this, source shows as "Google News" instead of the actual publisher.
- **Manual sync must include clustering**: SYNC_STAGES in dashboard layout must list all 4 stages (RSS, GNews, analyze, cluster). Missing any stage means manual sync skips it.
- **Clustering threshold**: Minimum 2 articles per category to attempt clustering. Too high a threshold (e.g. 4) causes clusters to never form at daily volumes.
