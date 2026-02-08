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
