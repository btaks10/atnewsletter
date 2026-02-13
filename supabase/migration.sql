-- Antisemitism News Monitor - Database Migration
-- Run this in the Supabase SQL Editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Articles table: stores raw articles from RSS feeds
create table articles (
  id uuid primary key default uuid_generate_v4(),
  url text unique not null,
  title text not null,
  author text,
  source text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  raw_content text,
  analyzed boolean not null default false
);

create index idx_articles_analyzed on articles (analyzed) where analyzed = false;
create index idx_articles_fetched_at on articles (fetched_at);

-- Article analysis table: stores Claude's analysis results
create table article_analysis (
  id uuid primary key default uuid_generate_v4(),
  article_id uuid not null references articles(id) on delete cascade,
  is_relevant boolean not null,
  summary text,
  category text,
  analyzed_at timestamptz not null default now(),
  model_used text not null
);

create index idx_article_analysis_relevant on article_analysis (is_relevant) where is_relevant = true;
create index idx_article_analysis_analyzed_at on article_analysis (analyzed_at);

-- Keyword filter columns on articles table (added for pre-filter step)
alter table articles add column if not exists keyword_passed boolean;
alter table articles add column if not exists keyword_matches jsonb;

-- Story clusters table: groups articles covering the same story
create table story_clusters (
  id serial primary key,
  cluster_headline text,
  article_count integer,
  category text,
  created_at timestamptz default now()
);

-- Clustering columns on article_analysis
alter table article_analysis add column if not exists cluster_id integer references story_clusters(id);
alter table article_analysis add column if not exists is_primary_in_cluster boolean default true;

-- Ingest logs table: tracks RSS feed processing results
create table ingest_logs (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  status text not null,
  articles_found integer not null default 0,
  articles_new integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

-- Digest logs table: tracks email delivery
create table digest_logs (
  id uuid primary key default uuid_generate_v4(),
  recipient text not null,
  articles_included integer not null default 0,
  resend_message_id text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

-- Pipeline stats table: tracks full pipeline run metrics
create table pipeline_stats (
  id serial primary key,
  run_date date,
  articles_ingested integer,
  articles_keyword_passed integer,
  articles_analyzed integer,
  articles_relevant integer,
  clusters_formed integer,
  email_sent boolean,
  total_duration_ms integer,
  created_at timestamptz default now()
);

-- Source type tracking on articles
alter table articles add column if not exists source_type text default 'rss';
create index if not exists idx_articles_source_type on articles(source_type);

-- Pipeline stats source breakdown
alter table pipeline_stats add column if not exists articles_from_rss integer default 0;
alter table pipeline_stats add column if not exists articles_from_gnews integer default 0;

-- GNews query management
create table gnews_queries (
  id serial primary key,
  query text not null,
  category text,
  is_active boolean default true,
  priority integer default 0,
  last_run_at timestamptz,
  last_result_count integer default 0,
  created_at timestamptz default now()
);

-- Seed initial GNews queries
insert into gnews_queries (query, category, priority) values
  ('"antisemitism"', null, 10),
  ('"antisemitic"', null, 10),
  ('"anti-semitism"', null, 10),
  ('"anti-semitic"', null, 10),
  ('"jewish" AND ("hate crime" OR "discrimination" OR "threat" OR "attack")', 'Hate Crimes & Violence', 8),
  ('"synagogue" AND ("vandalism" OR "attack" OR "threat" OR "bomb")', 'Hate Crimes & Violence', 8),
  ('"holocaust" AND ("denial" OR "memorial" OR "education" OR "controversy")', 'Media & Public Discourse', 7),
  ('"anti-defamation league" OR "ADL"', 'Organizational Response', 7),
  ('"american jewish committee" OR "AJC"', 'Organizational Response', 7),
  ('"jewish students" AND ("campus" OR "university" OR "college")', 'Campus & Academia', 7),
  ('"zionist" AND ("campus" OR "protest" OR "university")', 'Campus & Academia', 7),
  ('"antisemitism" AND ("legislation" OR "executive order" OR "bill" OR "policy")', 'Government & Policy', 7),
  ('"IHRA definition"', 'Government & Policy', 6),
  ('"BDS" AND ("jewish" OR "israel" OR "boycott")', 'Media & Public Discourse', 5);

-- Sprint 3: Dashboard support

-- Article feedback table
create table if not exists article_feedback (
  id serial primary key,
  article_id uuid not null references articles(id) on delete cascade,
  feedback text not null check (feedback in ('relevant', 'not_relevant')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_feedback_article on article_feedback(article_id);

-- Expanded GNews queries
insert into gnews_queries (query, category, priority) values
  ('"jewish community" AND ("threat" OR "concern" OR "safety" OR "fear")', 'Hate Crimes & Violence', 7),
  ('"hate speech" AND ("jewish" OR "synagogue" OR "antisemitic")', 'Hate Crimes & Violence', 7),
  ('"white supremacy" AND ("jewish" OR "antisemitic" OR "synagogue")', 'Hate Crimes & Violence', 7),
  ('"campus protest" AND ("jewish" OR "zionist" OR "israel")', 'Campus & Academia', 7),
  ('"neo-nazi" OR "neo nazi"', 'Hate Crimes & Violence', 8),
  ('"swastika" AND ("graffiti" OR "vandalism" OR "found" OR "painted")', 'Hate Crimes & Violence', 8),
  ('"holocaust denial" OR "holocaust denier"', 'Media & Public Discourse', 7),
  ('"from the river to the sea"', 'Media & Public Discourse', 6),
  ('"dual loyalty" AND ("jewish" OR "israel")', 'Media & Public Discourse', 6),
  ('"jewish students" AND ("safety" OR "threat" OR "fear" OR "harassed")', 'Campus & Academia', 7),
  ('"synagogue" AND ("security" OR "police" OR "protection" OR "guard")', 'Organizational Response', 6),
  ('"SPLC" AND ("antisemitism" OR "hate group")', 'Organizational Response', 6);

-- Sprint 4: Source & Keyword Management

-- RSS feeds table (replaces hardcoded config)
create table if not exists rss_feeds (
  id serial primary key,
  name text not null,
  url text not null unique,
  type text not null default 'mainstream',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed RSS feeds from hardcoded config
insert into rss_feeds (name, url, type) values
  ('Jewish Insider', 'https://jewishinsider.com/feed/', 'jewish_media'),
  ('JTA', 'https://www.jta.org/feed', 'jewish_media'),
  ('Forward', 'https://forward.com/feed/', 'jewish_media'),
  ('Jerusalem Post', 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', 'jewish_media'),
  ('Algemeiner', 'https://www.algemeiner.com/feed/', 'jewish_media'),
  ('NYT - Home', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'mainstream'),
  ('NYT - Middle East', 'https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml', 'mainstream'),
  ('NYT - Politics', 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', 'mainstream'),
  ('NYT - Education', 'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml', 'mainstream'),
  ('NYT - Opinion', 'https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml', 'mainstream'),
  ('WaPo - National', 'https://feeds.washingtonpost.com/rss/national', 'mainstream'),
  ('WaPo - World', 'https://feeds.washingtonpost.com/rss/world', 'mainstream'),
  ('CNN - US', 'http://rss.cnn.com/rss/cnn_us.rss', 'mainstream'),
  ('CNN - World', 'http://rss.cnn.com/rss/cnn_world.rss', 'mainstream'),
  ('CNN - Politics', 'http://rss.cnn.com/rss/cnn_allpolitics.rss', 'mainstream'),
  ('BBC - News', 'https://feeds.bbci.co.uk/news/rss.xml', 'mainstream'),
  ('BBC - Middle East', 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', 'mainstream'),
  ('BBC - Education', 'https://feeds.bbci.co.uk/news/education/rss.xml', 'mainstream'),
  ('NPR - World', 'https://feeds.npr.org/1004/rss.xml', 'mainstream'),
  ('NPR - Politics', 'https://feeds.npr.org/1014/rss.xml', 'mainstream'),
  ('NPR - Middle East', 'https://feeds.npr.org/1009/rss.xml', 'mainstream'),
  ('NPR - Education', 'https://feeds.npr.org/1013/rss.xml', 'mainstream'),
  ('Guardian - US News', 'https://www.theguardian.com/us-news/rss', 'mainstream'),
  ('Guardian - Middle East', 'https://www.theguardian.com/world/middleeast/rss', 'mainstream'),
  ('Guardian - Education', 'https://www.theguardian.com/education/rss', 'mainstream'),
  ('WSJ - World', 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'mainstream'),
  ('WSJ - Opinion', 'https://feeds.a.dj.com/rss/RSSOpinion.xml', 'mainstream'),
  ('Fox News - Politics', 'https://moxie.foxnews.com/google-publisher/politics.xml', 'mainstream'),
  ('Fox News - US', 'https://moxie.foxnews.com/google-publisher/us.xml', 'mainstream'),
  ('NBC News - Top Stories', 'https://feeds.nbcnews.com/feeds/topstories', 'mainstream'),
  ('NBC News - World', 'https://feeds.nbcnews.com/feeds/worldnews', 'mainstream'),
  ('ABC News - Top Stories', 'https://feeds.abcnews.com/abcnews/topstories', 'mainstream'),
  ('ABC News - Politics', 'https://feeds.abcnews.com/abcnews/politicsheadlines', 'mainstream'),
  ('NY Post', 'https://nypost.com/feed/', 'mainstream'),
  ('The Atlantic', 'https://www.theatlantic.com/feed/all/', 'mainstream'),
  ('Guardian - Opinion', 'https://www.theguardian.com/commentisfree/rss', 'analysis'),
  ('The Intercept', 'https://theintercept.com/feed/?rss', 'analysis'),
  ('Vox', 'https://www.vox.com/rss/index.xml', 'analysis')
on conflict (url) do nothing;

-- Keyword config table (replaces hardcoded arrays)
create table if not exists keyword_config (
  id serial primary key,
  keyword text not null,
  tier text not null check (tier in ('primary', 'secondary', 'context')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (keyword, tier)
);

-- Seed primary keywords
insert into keyword_config (keyword, tier) values
  ('antisemitism', 'primary'),
  ('antisemitic', 'primary'),
  ('anti-semitism', 'primary'),
  ('anti-semitic', 'primary'),
  ('anti-jewish', 'primary'),
  ('jew-hatred', 'primary'),
  ('judeophobia', 'primary'),
  ('neo-nazi', 'primary'),
  ('swastika', 'primary'),
  ('white supremacist', 'primary'),
  ('white nationalist', 'primary')
on conflict (keyword, tier) do nothing;

-- Seed secondary keywords
insert into keyword_config (keyword, tier) values
  ('jewish', 'secondary'),
  ('jews', 'secondary'),
  ('synagogue', 'secondary'),
  ('rabbi', 'secondary'),
  ('torah', 'secondary'),
  ('kosher', 'secondary'),
  ('yeshiva', 'secondary'),
  ('hebrew', 'secondary'),
  ('zionist', 'secondary'),
  ('zionism', 'secondary'),
  ('israel', 'secondary'),
  ('israeli', 'secondary'),
  ('palestinian', 'secondary'),
  ('holocaust', 'secondary'),
  ('shoah', 'secondary'),
  ('pogrom', 'secondary'),
  ('blood libel', 'secondary'),
  ('adl', 'secondary'),
  ('anti-defamation league', 'secondary'),
  ('ajc', 'secondary'),
  ('american jewish committee', 'secondary'),
  ('bds', 'secondary'),
  ('boycott divestment', 'secondary'),
  ('jewish community', 'secondary'),
  ('jewish organizations', 'secondary'),
  ('jewish leaders', 'secondary'),
  ('jewish neighborhood', 'secondary'),
  ('pro-israel', 'secondary'),
  ('anti-israel', 'secondary'),
  ('israel lobby', 'secondary'),
  ('hate speech', 'secondary'),
  ('hate group', 'secondary'),
  ('hate incident', 'secondary'),
  ('intifada', 'secondary'),
  ('from the river', 'secondary'),
  ('globalist', 'secondary'),
  ('dual loyalty', 'secondary'),
  ('zionist entity', 'secondary'),
  ('jewish state', 'secondary'),
  ('mezuzah', 'secondary'),
  ('menorah', 'secondary'),
  ('kippah', 'secondary'),
  ('star of david', 'secondary'),
  ('concentration camp', 'secondary'),
  ('auschwitz', 'secondary'),
  ('dachau', 'secondary'),
  ('kristallnacht', 'secondary'),
  ('nuremberg', 'secondary'),
  ('white supremacy', 'secondary'),
  ('neo nazi', 'secondary')
on conflict (keyword, tier) do nothing;

-- Seed context keywords
insert into keyword_config (keyword, tier) values
  ('hate crime', 'context'),
  ('hate incident', 'context'),
  ('vandalism', 'context'),
  ('attack', 'context'),
  ('threat', 'context'),
  ('discrimination', 'context'),
  ('campus', 'context'),
  ('university', 'context'),
  ('protest', 'context'),
  ('activism', 'context'),
  ('legislation', 'context'),
  ('bill', 'context'),
  ('executive order', 'context'),
  ('policy', 'context'),
  ('controversy', 'context'),
  ('backlash', 'context'),
  ('condemned', 'context'),
  ('denounced', 'context'),
  ('report', 'context'),
  ('study', 'context'),
  ('research', 'context'),
  ('survey', 'context'),
  ('data', 'context'),
  ('arrested', 'context'),
  ('charged', 'context'),
  ('indicted', 'context'),
  ('sentenced', 'context'),
  ('convicted', 'context'),
  ('graffiti', 'context'),
  ('slur', 'context'),
  ('harassment', 'context'),
  ('intimidation', 'context'),
  ('bullying', 'context'),
  ('fired', 'context'),
  ('suspended', 'context'),
  ('expelled', 'context'),
  ('resigned', 'context'),
  ('rally', 'context'),
  ('march', 'context'),
  ('demonstration', 'context'),
  ('counter-protest', 'context'),
  ('funding', 'context'),
  ('grant', 'context'),
  ('donation', 'context'),
  ('endowment', 'context'),
  ('social media', 'context'),
  ('online', 'context'),
  ('viral', 'context'),
  ('trending', 'context')
on conflict (keyword, tier) do nothing;

-- =============================================================
-- Sprint 5: Source Expansion (GNews Essentials + new RSS feeds)
-- =============================================================

-- New RSS feeds: restored Jewish media + mainstream + campus papers
insert into rss_feeds (name, url, type) values
  -- Restored Jewish media
  ('Times of Israel', 'https://www.timesofisrael.com/feed/', 'jewish_media'),
  ('Haaretz', 'https://www.haaretz.com/srv/haaretz-latest-headlines', 'jewish_media'),
  ('Haaretz - Israel', 'https://www.haaretz.com/srv/israel-news-rss', 'jewish_media'),
  ('Haaretz - US', 'https://www.haaretz.com/srv/u.s.-news-rss', 'jewish_media'),
  -- New mainstream
  ('Politico', 'https://rss.politico.com/politics-news.xml', 'mainstream'),
  ('Politico - Congress', 'https://rss.politico.com/congress.xml', 'mainstream'),
  ('The Hill', 'https://thehill.com/news/feed/', 'mainstream'),
  ('Newsweek', 'https://www.newsweek.com/rss', 'mainstream'),
  ('ProPublica', 'https://www.propublica.org/feeds/propublica/main', 'mainstream'),
  ('Daily Beast', 'https://www.thedailybeast.com/arc/outboundfeeds/rss/articles/', 'mainstream'),
  ('AP News', 'https://feedx.net/rss/ap.xml', 'mainstream'),
  -- Campus newspapers
  ('Columbia Spectator', 'https://www.columbiaspectator.com/arc/outboundfeeds/rss/?outputType=xml', 'mainstream'),
  ('Michigan Daily', 'https://www.michigandaily.com/feed/', 'mainstream'),
  ('Stanford Daily', 'https://stanforddaily.com/feed/', 'mainstream'),
  ('NYU News', 'https://nyunews.com/feed/', 'mainstream'),
  ('Cornell Daily Sun', 'https://www.cornellsun.com/plugin/feeds/all.xml', 'mainstream')
on conflict (url) do nothing;

-- Expanded GNews queries for Essentials plan (1,000 requests/day, 25 articles each)

-- Hate Crimes & Violence: broader net
insert into gnews_queries (query, category, priority) values
  ('"antisemitic attack" OR "antisemitic assault"', 'Hate Crimes & Violence', 9),
  ('"antisemitic threat" OR "antisemitic threats"', 'Hate Crimes & Violence', 8),
  ('"jewish hate crime" OR "hate crime jewish"', 'Hate Crimes & Violence', 8),
  ('"synagogue vandalism" OR "synagogue attack" OR "synagogue threat"', 'Hate Crimes & Violence', 8),
  ('"jewish cemetery" AND ("vandalism" OR "desecration" OR "damage")', 'Hate Crimes & Violence', 7),
  ('"mezuzah" AND ("ripped" OR "torn" OR "vandalism" OR "removed")', 'Hate Crimes & Violence', 7),
  ('"menorah" AND ("vandalism" OR "destroyed" OR "damaged")', 'Hate Crimes & Violence', 7),
  ('"kosher" AND ("attack" OR "vandalism" OR "threat" OR "arson")', 'Hate Crimes & Violence', 6),
  ('"jewish" AND ("stabbing" OR "shooting" OR "bombing" OR "arson")', 'Hate Crimes & Violence', 8),
  ('"antisemitic incident" OR "antisemitic incidents"', 'Hate Crimes & Violence', 8),
  ('"anti-jewish" AND ("attack" OR "violence" OR "hate")', 'Hate Crimes & Violence', 7),

  -- Campus & Academia: biggest coverage gap
  ('"antisemitism" AND "campus"', 'Campus & Academia', 8),
  ('"antisemitism" AND "university"', 'Campus & Academia', 8),
  ('"jewish students" AND ("harassed" OR "threatened" OR "unsafe" OR "hostile")', 'Campus & Academia', 8),
  ('"antisemitic" AND ("professor" OR "faculty" OR "instructor")', 'Campus & Academia', 7),
  ('"SJP" AND ("jewish" OR "antisemitic" OR "zionist")', 'Campus & Academia', 7),
  ('"students for justice in palestine" AND ("jewish" OR "antisemitic")', 'Campus & Academia', 6),
  ('"campus antisemitism" OR "university antisemitism"', 'Campus & Academia', 8),
  ('"hillel" AND ("campus" OR "university" OR "antisemitism")', 'Campus & Academia', 6),
  ('"academic boycott" AND ("israel" OR "jewish")', 'Campus & Academia', 6),
  ('"Title VI" AND ("antisemitism" OR "jewish")', 'Campus & Academia', 7),
  ('"jewish" AND ("fraternity" OR "sorority") AND ("vandalism" OR "attack" OR "targeted")', 'Campus & Academia', 6),

  -- Government & Policy
  ('"antisemitism" AND ("legislation" OR "bill" OR "law" OR "act")', 'Government & Policy', 7),
  ('"antisemitism" AND ("executive order" OR "White House" OR "Biden" OR "Trump")', 'Government & Policy', 8),
  ('"IHRA definition" AND "antisemitism"', 'Government & Policy', 7),
  ('"antisemitism envoy" OR "antisemitism coordinator" OR "antisemitism czar"', 'Government & Policy', 7),
  ('"congress" AND "antisemitism"', 'Government & Policy', 7),
  ('"state department" AND "antisemitism"', 'Government & Policy', 6),
  ('"antisemitism task force" OR "antisemitism commission"', 'Government & Policy', 6),
  ('"FBI" AND ("antisemitism" OR "antisemitic" OR "jewish hate crime")', 'Government & Policy', 7),

  -- Legal & Civil Rights
  ('"antisemitism" AND ("lawsuit" OR "sued" OR "litigation")', 'Legal & Civil Rights', 7),
  ('"jewish" AND "discrimination" AND ("employment" OR "workplace" OR "fired")', 'Legal & Civil Rights', 6),
  ('"jewish" AND ("civil rights" OR "civil liberties") AND ("violation" OR "complaint")', 'Legal & Civil Rights', 6),
  ('"Brandeis Center" AND ("antisemitism" OR "discrimination" OR "jewish")', 'Legal & Civil Rights', 6),

  -- Organizational Response
  ('"ADL" AND ("antisemitism" OR "report" OR "audit" OR "data")', 'Organizational Response', 7),
  ('"AJC" AND ("antisemitism" OR "survey" OR "report")', 'Organizational Response', 6),
  ('"jewish federation" AND ("antisemitism" OR "security" OR "hate")', 'Organizational Response', 6),
  ('"StandWithUs" AND ("antisemitism" OR "campus" OR "jewish")', 'Organizational Response', 5),
  ('"Hillel International" AND ("antisemitism" OR "jewish students")', 'Organizational Response', 5),
  ('"jewish security" OR "synagogue security" OR "jewish community security"', 'Organizational Response', 7),

  -- Media & Public Discourse
  ('"antisemitic trope" OR "antisemitic tropes"', 'Media & Public Discourse', 7),
  ('"antisemitic conspiracy" OR "jewish conspiracy"', 'Media & Public Discourse', 7),
  ('"antisemitism" AND ("social media" OR "Twitter" OR "X" OR "TikTok" OR "Instagram")', 'Media & Public Discourse', 7),
  ('"antisemitic" AND ("celebrity" OR "influencer" OR "rapper" OR "athlete")', 'Media & Public Discourse', 7),
  ('"antisemitic remarks" OR "antisemitic comments" OR "antisemitic speech"', 'Media & Public Discourse', 7),
  ('"antisemitic cartoon" OR "antisemitic meme" OR "antisemitic imagery"', 'Media & Public Discourse', 6),
  ('"anti-zionism" AND "antisemitism"', 'Media & Public Discourse', 6),
  ('"BDS" AND ("antisemitic" OR "antisemitism" OR "jewish")', 'Media & Public Discourse', 6),

  -- International
  ('"antisemitism" AND "Europe"', 'International', 7),
  ('"antisemitism" AND ("UK" OR "Britain" OR "United Kingdom" OR "London")', 'International', 7),
  ('"antisemitism" AND ("France" OR "Paris")', 'International', 7),
  ('"antisemitism" AND ("Germany" OR "Berlin")', 'International', 7),
  ('"antisemitism" AND "Canada"', 'International', 6),
  ('"antisemitism" AND ("Australia" OR "Melbourne" OR "Sydney")', 'International', 6),
  ('"antisemitism" AND ("Latin America" OR "Argentina" OR "Brazil")', 'International', 5),
  ('"jewish" AND ("attack" OR "targeted") AND ("Europe" OR "UK" OR "France" OR "Germany")', 'International', 7),

  -- Broader catch-all queries
  ('"antisemitism report" OR "antisemitism data" OR "antisemitism statistics"', 'Organizational Response', 7),
  ('"rise in antisemitism" OR "surge in antisemitism" OR "spike in antisemitism"', 'Other', 8),
  ('"combating antisemitism" OR "fighting antisemitism" OR "addressing antisemitism"', 'Other', 6),
  ('"antisemitism awareness" OR "antisemitism education" OR "Holocaust education"', 'Other', 6)
on conflict do nothing;

-- =============================================================
-- Sprint 5: Cluster display, dedup, international, feedback
-- =============================================================

-- Issue 3b: Fuzzy title dedup
ALTER TABLE articles ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES articles(id);
CREATE INDEX IF NOT EXISTS idx_articles_duplicate ON articles(duplicate_of);

-- Issue 4: International sort-to-bottom
ALTER TABLE article_analysis ADD COLUMN IF NOT EXISTS is_international boolean DEFAULT false;

-- Issue 5: Feedback reasons
ALTER TABLE article_feedback ADD COLUMN IF NOT EXISTS reason text CHECK (reason IN ('not_relevant', 'duplicate', 'wrong_category', 'low_priority'));
UPDATE article_feedback SET reason = 'not_relevant' WHERE reason IS NULL;
