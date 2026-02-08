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
