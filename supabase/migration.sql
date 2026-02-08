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
