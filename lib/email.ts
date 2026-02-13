import { Resend } from "resend";
import { CATEGORY_ORDER, getArticleAgeCutoff } from "./config";
import { supabase } from "./supabase";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface DigestArticle {
  title: string;
  url: string;
  source: string;
  source_type: string;
  author: string | null;
  published_at: string;
  summary: string;
  category: string;
  is_international: boolean;
  clusterHeadline?: string;
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
  const intlBadge = article.is_international
    ? ` <span style="display: inline-block; background: #f59e0b; color: #fff; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 3px; vertical-align: middle;">INTL</span>`
    : "";
  return `
    <div class="article">
      <a href="${article.url}">${escapeHtml(article.title)}</a>${intlBadge}
      <div class="source-info">${escapeHtml(article.source)}${authorPart} &bull; ${formatDate(article.published_at)}</div>
      <p class="summary">${escapeHtml(article.summary)}</p>
    </div>`;
}

function renderClusterGroup(articles: DigestArticle[], headline: string): string {
  let html = `
    <div style="border: 1px solid #d1d5db; border-radius: 6px; padding: 12px 16px; margin-bottom: 18px;">
      <div style="font-weight: bold; font-size: 15px; color: #1a1a1a; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(headline)} <span style="font-weight: normal; font-size: 13px; color: #888;">(${articles.length} article${articles.length !== 1 ? "s" : ""})</span></div>`;
  for (const article of articles) {
    html += renderFullArticle(article);
  }
  html += `
    </div>`;
  return html;
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
    grouped[cat].sort((a, b) => {
      // US-focused first, international last
      if (a.is_international !== b.is_international) {
        return a.is_international ? 1 : -1;
      }
      return (
        new Date(b.published_at).getTime() -
        new Date(a.published_at).getTime()
      );
    });
  }
  return grouped;
}

function buildEmailHtml(articles: DigestArticle[], date: string, categorySummaries?: Record<string, string[]>): string {
  const sources = new Set(articles.map((a) => a.source));
  const categoryCount = new Set(articles.map((a) => a.category)).size;
  const rssCount = articles.filter((a) => a.source_type === "rss").length;
  const gnewsCount = articles.filter((a) => a.source_type === "gnews_api").length;
  const sourceBreakdown = gnewsCount > 0
    ? ` (${rssCount} RSS, ${gnewsCount} via news API)`
    : "";
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
    <div class="meta">${date} &bull; ${articles.length} article${articles.length !== 1 ? "s" : ""} from ${sources.size} source${sources.size !== 1 ? "s" : ""}${sourceBreakdown}</div>
  </div>`;

  const renderCategoryBullets = (category: string): string => {
    const bullets = categorySummaries?.[category];
    if (!bullets || bullets.length === 0) return "";
    let html = `<div style="margin-bottom: 16px; padding: 10px 14px; background: #f8f9fa; border-radius: 4px;">`;
    if (bullets.length > 1) {
      html += `<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px;">Key Developments</div>`;
    }
    for (const bullet of bullets) {
      html += `<div style="font-size: 13px; color: #444; line-height: 1.5; margin-bottom: 4px; padding-left: 12px; position: relative;"><span style="position: absolute; left: 0; color: #999;">&ndash;</span> ${escapeHtml(bullet)}</div>`;
    }
    html += `</div>`;
    return html;
  };

  const renderCategoryArticles = (catArticles: DigestArticle[]): string => {
    let catHtml = "";
    // Group articles by cluster headline
    const clusterGroups = new Map<string, DigestArticle[]>();
    const standalone: DigestArticle[] = [];

    for (const article of catArticles) {
      if (article.clusterHeadline) {
        if (!clusterGroups.has(article.clusterHeadline)) {
          clusterGroups.set(article.clusterHeadline, []);
        }
        clusterGroups.get(article.clusterHeadline)!.push(article);
      } else {
        standalone.push(article);
      }
    }

    // Render multi-article clusters first, then standalone
    for (const [headline, clusterArticles] of clusterGroups) {
      if (clusterArticles.length > 1) {
        catHtml += renderClusterGroup(clusterArticles, headline);
      } else {
        standalone.push(clusterArticles[0]);
      }
    }

    for (const article of standalone) {
      catHtml += renderFullArticle(article);
    }

    return catHtml;
  };

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
      html += renderCategoryBullets(category);
      html += renderCategoryArticles(catArticles);
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
      html += renderCategoryBullets(category);
      html += renderCategoryArticles(catArticles);
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

export async function sendDigest(articles: DigestArticle[], categorySummaries?: Record<string, string[]>) {
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
    ? buildEmailHtml(articles, date, categorySummaries)
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
      is_international,
      articles!inner (
        title,
        url,
        source,
        source_type,
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

  // Fetch cluster headlines
  const clusterIds = [
    ...new Set(
      rows.map((r: any) => r.cluster_id).filter((id: any) => id != null)
    ),
  ];

  let clusterHeadlines = new Map<number, string>();
  if (clusterIds.length > 0) {
    const { data: clusterData } = await supabase
      .from("story_clusters")
      .select("id, cluster_headline")
      .in("id", clusterIds);

    if (clusterData) {
      clusterHeadlines = new Map(
        clusterData.map((c: any) => [c.id, c.cluster_headline])
      );
    }
  }

  // Fetch category summaries for today
  const todayDate = new Date().toISOString().split("T")[0];
  const { data: summaryData } = await supabase
    .from("category_summaries")
    .select("category, summary_bullets")
    .eq("run_date", todayDate);

  const categorySummaries: Record<string, string[]> = {};
  for (const row of summaryData || []) {
    categorySummaries[row.category] = row.summary_bullets as string[];
  }

  // Build all articles with cluster headline and is_international attached
  const articles: DigestArticle[] = rows.map((row: any) => ({
    title: row.articles.title,
    url: row.articles.url,
    source: row.articles.source,
    source_type: row.articles.source_type || "rss",
    author: row.articles.author,
    published_at: row.articles.published_at,
    summary: row.summary,
    category: row.category,
    is_international: row.is_international || false,
    clusterHeadline: row.cluster_id
      ? clusterHeadlines.get(row.cluster_id) || undefined
      : undefined,
  }));

  const result = await sendDigest(articles, categorySummaries);

  await supabase.from("digest_logs").insert({
    recipient: result.recipient,
    articles_included: result.articles_included,
    resend_message_id: result.resend_message_id,
    status: "success",
  });

  return result;
}
