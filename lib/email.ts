import { Resend } from "resend";
import { CATEGORY_ORDER, getArticleAgeCutoff } from "./config";
import { supabase } from "./supabase";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface DigestArticle {
  title: string;
  url: string;
  source: string;
  author: string | null;
  published_at: string;
  summary: string;
  category: string;
  relatedArticles?: { source: string; url: string }[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TOP_STORIES_LIMIT = 30;

function renderFullArticle(article: DigestArticle): string {
  const authorPart = article.author ? ` &bull; ${article.author}` : "";
  const alsoCoveredBy =
    article.relatedArticles && article.relatedArticles.length > 0
      ? `\n      <div class="source-info" style="margin-top: 4px;">Also covered by: ${article.relatedArticles.map((r) => `<a href="${r.url}" style="color: #888; text-decoration: underline;">${escapeHtml(r.source)}</a>`).join(", ")}</div>`
      : "";
  return `
    <div class="article">
      <a href="${article.url}">${escapeHtml(article.title)}</a>
      <div class="source-info">${escapeHtml(article.source)}${authorPart} &bull; ${formatDate(article.published_at)}</div>
      <p class="summary">${escapeHtml(article.summary)}</p>${alsoCoveredBy}
    </div>`;
}

function renderCompactArticle(article: DigestArticle): string {
  return `
    <div style="margin-bottom: 8px; padding-left: 16px; border-left: 2px solid #e0e0e0;">
      <a href="${article.url}" style="color: #1a1a1a; text-decoration: none; font-weight: bold; font-size: 14px;">${escapeHtml(article.title)}</a>
      <span style="font-size: 12px; color: #888;"> &mdash; ${escapeHtml(article.source)}</span>
    </div>`;
}

function groupByCategory(articles: DigestArticle[]): Record<string, DigestArticle[]> {
  const grouped: Record<string, DigestArticle[]> = {};
  for (const article of articles) {
    const cat = article.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(article);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort(
      (a, b) =>
        new Date(b.published_at).getTime() -
        new Date(a.published_at).getTime()
    );
  }
  return grouped;
}

function buildEmailHtml(articles: DigestArticle[], date: string): string {
  const sources = new Set(articles.map((a) => a.source));
  const categoryCount = new Set(articles.map((a) => a.category)).size;
  const isLargeVolume = articles.length > TOP_STORIES_LIMIT;

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 680px; margin: 0 auto; padding: 20px; background: #ffffff; }
    .header { border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; margin: 0 0 4px 0; }
    .header .meta { font-size: 14px; color: #666; }
    .category { margin-bottom: 28px; }
    .category h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 14px; }
    .article { margin-bottom: 18px; padding-left: 16px; border-left: 3px solid #e0e0e0; }
    .article a { color: #1a1a1a; text-decoration: none; font-weight: bold; font-size: 16px; }
    .article a:hover { text-decoration: underline; }
    .article .source-info { font-size: 13px; color: #888; margin: 2px 0 4px 0; }
    .article .summary { font-size: 14px; color: #444; line-height: 1.5; margin: 0; }
    .footer { border-top: 1px solid #ddd; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #999; }
    .section-divider { border-top: 2px solid #ddd; padding-top: 16px; margin-top: 28px; margin-bottom: 20px; }
    .section-divider h2 { font-size: 18px; color: #333; margin: 0 0 4px 0; }
    .section-divider .meta { font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Daily Antisemitism News Monitor</h1>
    <div class="meta">${date} &bull; ${articles.length} article${articles.length !== 1 ? "s" : ""} from ${sources.size} source${sources.size !== 1 ? "s" : ""} across ${categoryCount} categor${categoryCount !== 1 ? "ies" : "y"}</div>
  </div>`;

  if (isLargeVolume) {
    // Split into Top Stories (full format) and Full Coverage (compact)
    const topStories: DigestArticle[] = [];
    const remaining: DigestArticle[] = [];
    const grouped = groupByCategory(articles);

    // Take first articles by category priority order until we hit the limit
    let count = 0;
    for (const category of CATEGORY_ORDER) {
      const catArticles = grouped[category];
      if (!catArticles) continue;
      for (const article of catArticles) {
        if (count < TOP_STORIES_LIMIT) {
          topStories.push(article);
          count++;
        } else {
          remaining.push(article);
        }
      }
    }

    // Top Stories section
    const topGrouped = groupByCategory(topStories);
    for (const category of CATEGORY_ORDER) {
      const catArticles = topGrouped[category];
      if (!catArticles || catArticles.length === 0) continue;
      html += `
  <div class="category">
    <h2>${category}</h2>`;
      for (const article of catArticles) {
        html += renderFullArticle(article);
      }
      html += `
  </div>`;
    }

    // Full Coverage section (compact)
    if (remaining.length > 0) {
      const remainGrouped = groupByCategory(remaining);
      html += `
  <div class="section-divider">
    <h2>Full Coverage</h2>
    <div class="meta">${remaining.length} additional article${remaining.length !== 1 ? "s" : ""}</div>
  </div>`;

      for (const category of CATEGORY_ORDER) {
        const catArticles = remainGrouped[category];
        if (!catArticles || catArticles.length === 0) continue;
        html += `
  <div class="category">
    <h2>${category}</h2>`;
        for (const article of catArticles) {
          html += renderCompactArticle(article);
        }
        html += `
  </div>`;
      }
    }
  } else {
    // Standard rendering for <= 30 articles
    const grouped = groupByCategory(articles);
    for (const category of CATEGORY_ORDER) {
      const catArticles = grouped[category];
      if (!catArticles || catArticles.length === 0) continue;
      html += `
  <div class="category">
    <h2>${category}</h2>`;
      for (const article of catArticles) {
        html += renderFullArticle(article);
      }
      html += `
  </div>`;
    }
  }

  html += `
  <div class="footer">
    <p>This digest was automatically generated by the Nexus News Monitor.</p>
    <p>Questions? Contact bryan@notionstate.com</p>
  </div>
</body>
</html>`;

  return html;
}

function buildEmptyHtml(date: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 680px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; margin: 0 0 4px 0; }
    .header .meta { font-size: 14px; color: #666; }
    .content { font-size: 15px; color: #444; line-height: 1.6; }
    .footer { border-top: 1px solid #ddd; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Daily Antisemitism News Monitor</h1>
    <div class="meta">${date}</div>
  </div>
  <div class="content">
    <p>No antisemitism-related articles were found in monitored sources for the past 24 hours.</p>
  </div>
  <div class="footer">
    <p>This digest was automatically generated by the Nexus News Monitor.</p>
    <p>Questions? Contact bryan@notionstate.com</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendDigest(articles: DigestArticle[]) {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const recipient = process.env.EMAIL_RECIPIENT || "bryan@notionstate.com";
  const hasArticles = articles.length > 0;

  const subject = hasArticles
    ? `Antisemitism News Digest - ${date}`
    : `Antisemitism News Digest - ${date} (No articles)`;

  const html = hasArticles
    ? buildEmailHtml(articles, date)
    : buildEmptyHtml(date);

  const { data, error } = await resend.emails.send({
    from: "Nexus News Monitor <onboarding@resend.dev>",
    to: [recipient],
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  return {
    recipient,
    articles_included: articles.length,
    categories_included: hasArticles
      ? new Set(articles.map((a) => a.category)).size
      : 0,
    resend_message_id: data?.id || null,
  };
}

export async function runDigest() {
  const cutoff = getArticleAgeCutoff();

  const { data, error: fetchError } = await supabase
    .from("article_analysis")
    .select(
      `
      summary,
      category,
      cluster_id,
      is_primary_in_cluster,
      articles!inner (
        title,
        url,
        source,
        author,
        published_at
      )
    `
    )
    .eq("is_relevant", true)
    .gte("analyzed_at", cutoff);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = data || [];

  // Group by cluster_id to merge clustered articles
  const clusterMap = new Map<number, any[]>();
  const unclustered: any[] = [];

  for (const row of rows) {
    if (row.cluster_id) {
      if (!clusterMap.has(row.cluster_id)) {
        clusterMap.set(row.cluster_id, []);
      }
      clusterMap.get(row.cluster_id)!.push(row);
    } else {
      unclustered.push(row);
    }
  }

  const articles: DigestArticle[] = [];

  // Process unclustered articles (render as individual items)
  for (const row of unclustered) {
    articles.push({
      title: row.articles.title,
      url: row.articles.url,
      source: row.articles.source,
      author: row.articles.author,
      published_at: row.articles.published_at,
      summary: row.summary,
      category: row.category,
    });
  }

  // Process clustered articles (merge into primary with "Also covered by")
  for (const [, clusterRows] of clusterMap) {
    const primary = clusterRows.find((r: any) => r.is_primary_in_cluster);
    const related = clusterRows.filter((r: any) => !r.is_primary_in_cluster);

    if (!primary) {
      // Fallback: if no primary found, render all individually
      for (const row of clusterRows) {
        articles.push({
          title: row.articles.title,
          url: row.articles.url,
          source: row.articles.source,
          author: row.articles.author,
          published_at: row.articles.published_at,
          summary: row.summary,
          category: row.category,
        });
      }
      continue;
    }

    articles.push({
      title: primary.articles.title,
      url: primary.articles.url,
      source: primary.articles.source,
      author: primary.articles.author,
      published_at: primary.articles.published_at,
      summary: primary.summary,
      category: primary.category,
      relatedArticles: related.map((r: any) => ({
        source: r.articles.source,
        url: r.articles.url,
      })),
    });
  }

  const result = await sendDigest(articles);

  await supabase.from("digest_logs").insert({
    recipient: result.recipient,
    articles_included: result.articles_included,
    resend_message_id: result.resend_message_id,
    status: "success",
  });

  return result;
}
