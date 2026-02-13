# AT News Monitor — Status

*Last updated: February 13, 2026*

## Current State

The system is **fully operational** and running daily. Sprint 5 was completed on Feb 13, addressing direct feedback from the end user (Aryeh Tuchman).

### What's Working

- **Daily pipeline**: 7 staggered cron jobs run every morning at ~6am EST. RSS ingestion, GNews ingestion, 3 analysis passes, clustering, and email digest all fire independently within Vercel's 60s limit.
- **Dashboard**: Password-protected web UI at https://atnewsletter.vercel.app with articles view (date picker, category/source/type filters, TLDR summary card, feedback buttons), sources management (RSS feeds, GNews queries, keywords with effectiveness stats), and manual sync (4 stages including clustering).
- **Source coverage**: ~78 RSS feeds, ~51 GNews queries, 110+ keywords across 3 tiers. Covers Jewish media, mainstream US outlets, campus papers, analysis orgs, Google News RSS, and Reddit.
- **Analysis pipeline**: Full text enrichment for short articles, 3-tier keyword pre-filter, Claude Sonnet batch analysis (20 articles per call), parallel clustering by category with Claude Haiku.
- **Cluster display**: Topic-based grouping — cluster headline with article count, all articles shown fully inside bordered container. Single-article clusters rendered as standalone cards. Same layout in dashboard and email digest.
- **International sorting**: Articles flagged `is_international` by Claude during analysis. INTL articles sort to bottom within each category on both dashboard and email. Amber "INTL" badge on cards.
- **Title-based dedup**: Jaccard similarity (>85% threshold) catches duplicate articles with different URLs during both RSS and GNews ingestion. Duplicates linked via `duplicate_of`, skipped by analysis pipeline.
- **Google News source labels**: Publisher name parsed from RSS title format ("Headline - Publisher") so articles show actual source instead of "Google News".
- **Feedback system**: Thumbs-up saves immediately as "relevant". Thumbs-down opens a 4-option reason dropdown (not relevant, duplicate, wrong category, low priority). Stored in `article_feedback` table.
- **Email digest**: Daily email via Resend with articles grouped by category, cluster group rendering (topic header + all articles), INTL badges, international-to-bottom sorting.

### Database Numbers (as of Feb 8, 2026)

- ~1133 total articles ingested
- ~150 relevant articles identified
- ~53 story clusters formed

## Sprint 5 — Completed Feb 13, 2026

Addressed 6 issues from user feedback:

| # | Issue | Status |
|---|-------|--------|
| 1 | Clustering broken since Feb 9 (missing from manual sync + threshold too high) | Fixed |
| 2 | Redesign cluster display from "primary + Also:" to "topic header + all articles" | Done |
| 3 | Google News source labels + title-based fuzzy dedup | Done |
| 4 | International sort-to-bottom within categories | Done |
| 5 | Feedback with reason dropdown on thumbs-down | Done |
| 6 | GNews queries vs keywords explanation (no code) | Answered |

**Key decisions made:**
- Jaccard word-overlap similarity at >0.85 threshold for dedup (no external library)
- Google News publisher parsed from title suffix pattern, not from feed metadata
- `is_international` determined by Claude during analysis (not a separate pass)
- Clustering threshold lowered from 4 to 2 articles minimum
- Feedback reasons are: `not_relevant`, `duplicate`, `wrong_category`, `low_priority`
- DB migration uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for safety

**Files created:** `lib/dedup.ts`, `CLAUDE.md`, `STATUS.md`

**Files modified:** `lib/rss.ts`, `lib/gnews.ts`, `lib/claude.ts`, `lib/email.ts`, `lib/story-clustering.ts`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`, `app/api/dashboard/articles/route.ts`, `app/api/feedback/route.ts`, `supabase/migration.sql`

**DB migration run:** Added `articles.duplicate_of`, `article_analysis.is_international`, `article_feedback.reason` columns.

## What's Not Built Yet

### Use Feedback Signal
The `article_feedback` table now stores user votes with reasons but the pipeline doesn't use them yet. Accumulated votes could:
- Adjust keyword weights (keywords that lead to frequently downvoted articles get deprioritized)
- Fine-tune Claude's relevance prompt with examples of user-approved/rejected articles
- Surface a "feedback needed" queue for ambiguous articles

### Re-enable Insights Tab
The `/insights` page is fully built with Recharts (articles/day line chart, category bar chart, source bar chart, source type pie chart, pipeline health stats). It's hidden from the navigation. Just needs to be unhidden in the dashboard layout nav links.

### Keyword Effectiveness Tracking
The Sources page already shows keyword match stats (7d, 30d, relevance %). Could be extended to:
- Auto-flag keywords with zero matches over 30 days for review
- Suggest new keywords based on article content that passes Claude analysis but doesn't match existing keywords
- Auto-prune consistently low-performing keywords

### Potential Improvements

**Pipeline reliability**:
- Add retry logic to individual cron jobs (currently each runs once)
- Add alerting if a pipeline stage fails (email or webhook notification)
- Track per-feed health over time (some RSS feeds may go stale)

**Coverage expansion**:
- Add more campus newspapers (only 6 currently)
- Add UK/European Jewish media sources
- Add more Google News RSS search terms for emerging topics

**Dashboard UX**:
- Add article search/full-text search
- Add pagination (currently loads all articles for a date)
- Add export (CSV/PDF) for reports
- Mobile-responsive improvements

**Email digest**:
- Add subscriber management (currently single hardcoded recipient)
- Weekly summary in addition to daily

**Code quality**:
- Extract inline utility functions into shared lib
- Add error boundaries to React pages
- Add basic tests for keyword filter and clustering logic
- Move inline types to a shared types file

## What the Next Session Needs to Know

1. **Sprint 5 just deployed** — the Vercel deploy triggered by the commit should be live. First thing to verify: open the dashboard, run a manual sync, confirm cluster groups display correctly and Google News articles show real publisher names.
2. **Dedup only applies to new articles** — existing duplicates in the DB from before Feb 13 won't retroactively get `duplicate_of` set. Only new ingestions use the dedup logic.
3. **`is_international` only applies to newly analyzed articles** — existing article_analysis rows have `is_international = false` (the column default). Articles analyzed after this deploy will get the correct value.
4. **Feedback reasons are stored but not used** — the next logical step is to use accumulated feedback to tune the pipeline (keyword weights, Claude prompt examples, etc.).
5. **Email digest `renderCompactArticle` doesn't have cluster/INTL support** — the "Full Coverage" overflow section (>30 articles) still renders compact without cluster groups or INTL badges. This is fine for now since daily volumes rarely exceed 30 relevant articles.

## Recent Changes

| Commit | Description |
|--------|-------------|
| `278cf94` | Sprint 5: Cluster display redesign, dedup, international sorting, feedback reasons |
| `66263c1` | Only cluster unclustered articles to reduce scope and prevent timeout |
| `50abbf7` | Batch clustering DB writes and parallelize Claude calls |
| `39d24bb` | Parallelize clustering: all categories processed concurrently |
| `336f60a` | Batch clustering by category to prevent timeout with large article sets |
| `b145f9e` | Fix clustering truncation: increase max_tokens to 16384 |

## Deployment

- **Hosting**: Vercel (Hobby plan) — auto-deploys on push to `main`
- **Database**: Supabase (free tier)
- **Repo**: https://github.com/btaks10/atnewsletter
- **Live**: https://atnewsletter.vercel.app
