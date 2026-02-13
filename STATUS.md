# AT News Monitor — Status

*Last updated: February 13, 2026*

## Current State

The system is **fully operational** and running daily. All core functionality is built and deployed.

### What's Working

- **Daily pipeline**: 7 staggered cron jobs run every morning at ~6am EST. RSS ingestion, GNews ingestion, 3 analysis passes, clustering, and email digest all fire independently within Vercel's 60s limit.
- **Dashboard**: Password-protected web UI at https://atnewsletter.vercel.app with articles view (date picker, category/source/type filters, TLDR summary card, feedback buttons), sources management (RSS feeds, GNews queries, keywords with effectiveness stats), and manual sync.
- **Source coverage**: ~78 RSS feeds, ~51 GNews queries, 110+ keywords across 3 tiers. Covers Jewish media, mainstream US outlets, campus papers, analysis orgs, Google News RSS, and Reddit.
- **Analysis pipeline**: Full text enrichment for short articles, 3-tier keyword pre-filter, Claude Sonnet batch analysis (20 articles per call), parallel clustering by category with Claude Haiku.
- **Email digest**: Daily email via Resend with articles grouped by category, cluster merging (primary article + "also covered by" links), TLDR-style layout.
- **Feedback system**: Users can upvote/downvote articles on the dashboard. Stored in `article_feedback` table.

### Database Numbers (as of Feb 8, 2026)

- ~1133 total articles ingested
- ~150 relevant articles identified
- ~53 story clusters formed

## What's Not Built Yet

### Use Feedback Signal
The `article_feedback` table stores user +/- votes but the pipeline doesn't use them. Accumulated votes could:
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
- A/B test different email formats
- Add subscriber management (currently single hardcoded recipient)
- Weekly summary in addition to daily

**Code quality**:
- Extract inline utility functions (timeAgo, groupByClusters, buildDigest) into shared lib
- Add error boundaries to React pages
- Add basic tests for keyword filter and clustering logic
- Move inline types to a shared types file

## Recent Changes

| Commit | Description |
|--------|-------------|
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
