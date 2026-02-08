import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { getArticleAgeCutoff } from "./config";
import { filterArticleByKeywords, FilterResult } from "./keyword-filter";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = "claude-sonnet-4-20250514";
const BATCH_SIZE = 20;
const ANALYSIS_TIMEOUT_MS = 50_000; // Stop before Vercel's 60s limit

interface ArticleInput {
  id: string;
  title: string;
  source: string;
  raw_content: string | null;
}

interface AnalysisResult {
  index: number;
  is_relevant: boolean;
  summary: string | null;
  category: string | null;
}

function truncate(text: string | null, maxChars: number): string {
  if (!text) return "(no content available)";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

function buildBatchPrompt(articles: ArticleInput[]): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `[ARTICLE ${i}]
Title: ${a.title}
Source: ${a.source}
Content: ${truncate(a.raw_content, 500)}`
    )
    .join("\n\n");

  return `Analyze each article below and determine if it relates to antisemitism.

Return a JSON array with one object per article, in order. Each object must have:
{
  "index": number,
  "is_relevant": boolean,
  "summary": string or null,
  "category": string or null
}

RELEVANCE CRITERIA:
An article is relevant if it substantively covers:
- Antisemitic incidents, hate crimes, or discrimination
- Policy, legislation, or government action addressing antisemitism
- Organizational responses to antisemitism (ADL, universities, etc.)
- Academic research or reports about antisemitism
- Public discourse, controversies, or debates about antisemitism

An article is NOT relevant if it:
- Merely mentions Jewish people/culture without an antisemitism angle
- Covers general Middle East news without antisemitism focus
- Is historical content with no current news hook

For NOT relevant articles: set summary and category to null.

For relevant articles:
- summary: 1-2 sentences, neutral factual tone, key newsworthy element
- category: exactly ONE of:
  "Campus & Academia", "Government & Policy", "Hate Crimes & Violence",
  "Media & Public Discourse", "International", "Organizational Response",
  "Legal & Civil Rights", "Other"

Return ONLY the JSON array, no other text.

${articleBlocks}`;
}

async function analyzeBatch(
  batchArticles: any[],
  errors: string[]
): Promise<{ relevant: number; notRelevant: number }> {
  let relevant = 0;
  let notRelevant = 0;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system:
      "You analyze news articles to determine if they relate to antisemitism. Respond with valid JSON only, no other text.",
    messages: [
      {
        role: "user",
        content: buildBatchPrompt(
          batchArticles.map((a) => ({
            id: a.id,
            title: a.title,
            source: a.source,
            raw_content: a.raw_content,
          }))
        ),
      },
    ],
  });

  let text =
    response.content[0].type === "text" ? response.content[0].text : "[]";
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  let results: AnalysisResult[];
  try {
    results = JSON.parse(text);
  } catch {
    errors.push(`Failed to parse Claude response: ${text.slice(0, 200)}`);
    return { relevant, notRelevant };
  }

  const analysisRows: any[] = [];
  const analyzedIds: string[] = [];

  for (const result of results) {
    const article = batchArticles[result.index];
    if (!article) {
      errors.push(`Invalid index ${result.index} in Claude response`);
      continue;
    }

    if (!result.is_relevant) {
      result.summary = null;
      result.category = null;
    }

    analysisRows.push({
      article_id: article.id,
      is_relevant: result.is_relevant,
      summary: result.summary,
      category: result.category,
      model_used: MODEL,
    });

    analyzedIds.push(article.id);
    if (result.is_relevant) relevant++;
    else notRelevant++;
  }

  if (analysisRows.length > 0) {
    const { error: insertErr } = await supabase
      .from("article_analysis")
      .insert(analysisRows);
    if (insertErr) {
      errors.push(`Batch insert error: ${insertErr.message}`);
    }
  }

  if (analyzedIds.length > 0) {
    const { error: updateErr } = await supabase
      .from("articles")
      .update({ analyzed: true })
      .in("id", analyzedIds);
    if (updateErr) {
      errors.push(`Batch update error: ${updateErr.message}`);
    }
  }

  return { relevant, notRelevant };
}

export async function runAnalysis() {
  const startTime = Date.now();
  const cutoff = getArticleAgeCutoff();

  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("*")
    .eq("analyzed", false)
    .gte("fetched_at", cutoff);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!articles || articles.length === 0) {
    return {
      success: true,
      keyword_filter: {
        total_unanalyzed: 0,
        passed_filter: 0,
        skipped: 0,
        high_confidence: 0,
        medium_confidence: 0,
      },
      claude_analysis: {
        articles_processed: 0,
        articles_relevant: 0,
        articles_not_relevant: 0,
        errors: [],
      },
      remaining_unanalyzed: 0,
    };
  }

  // --- Step 1: Keyword Pre-Filter ---
  let filterResults: Map<string, FilterResult>;
  let passedArticles: typeof articles;
  let skippedArticles: typeof articles;
  let highConfidence = 0;
  let mediumConfidence = 0;

  try {
    filterResults = new Map();
    for (const article of articles) {
      const result = filterArticleByKeywords({
        title: article.title,
        raw_content: article.raw_content,
      });
      filterResults.set(article.id, result);
    }

    passedArticles = articles.filter(
      (a) => filterResults.get(a.id)!.passFilter
    );
    skippedArticles = articles.filter(
      (a) => !filterResults.get(a.id)!.passFilter
    );

    for (const result of filterResults.values()) {
      if (result.confidence === "high") highConfidence++;
      else if (result.confidence === "medium") mediumConfidence++;
    }

    // Save keyword filter results to DB (jsonb varies per article, so update individually)
    await Promise.all(
      articles.map((article) => {
        const result = filterResults.get(article.id)!;
        return supabase
          .from("articles")
          .update({
            keyword_passed: result.passFilter,
            keyword_matches: {
              keywords: result.matchedKeywords,
              confidence: result.confidence,
              reason: result.reason,
            },
          })
          .eq("id", article.id);
      })
    );

    // Mark skipped articles as analyzed with is_relevant = false
    if (skippedArticles.length > 0) {
      const skipAnalysisRows = skippedArticles.map((a) => ({
        article_id: a.id,
        is_relevant: false,
        summary: null,
        category: null,
        model_used: "keyword-filter",
      }));

      const { error: skipInsertErr } = await supabase
        .from("article_analysis")
        .insert(skipAnalysisRows);

      if (skipInsertErr) {
        console.error(`Skip insert error: ${skipInsertErr.message}`);
      }

      const skipIds = skippedArticles.map((a) => a.id);
      const { error: skipUpdateErr } = await supabase
        .from("articles")
        .update({ analyzed: true })
        .in("id", skipIds);

      if (skipUpdateErr) {
        console.error(`Skip update error: ${skipUpdateErr.message}`);
      }
    }
  } catch (filterError: any) {
    // Fail open: if keyword filter errors, send everything to Claude
    console.error(`Keyword filter error, falling back to full analysis: ${filterError?.message}`);
    passedArticles = articles;
    skippedArticles = [];
    highConfidence = 0;
    mediumConfidence = 0;
    filterResults = new Map();
  }

  const keywordFilterStats = {
    total_unanalyzed: articles.length,
    passed_filter: passedArticles.length,
    skipped: skippedArticles.length,
    high_confidence: highConfidence,
    medium_confidence: mediumConfidence,
  };

  // --- Step 2: Claude Analysis in batches ---
  const errors: string[] = [];
  let totalRelevant = 0;
  let totalNotRelevant = 0;
  let articlesProcessed = 0;
  let timedOut = false;

  for (let i = 0; i < passedArticles.length; i += BATCH_SIZE) {
    // Check timeout before starting a new batch
    if (Date.now() - startTime > ANALYSIS_TIMEOUT_MS) {
      timedOut = true;
      break;
    }

    const batch = passedArticles.slice(i, i + BATCH_SIZE);
    const { relevant, notRelevant } = await analyzeBatch(batch, errors);
    totalRelevant += relevant;
    totalNotRelevant += notRelevant;
    articlesProcessed += batch.length;
  }

  // Count remaining unanalyzed articles
  const remaining = passedArticles.length - articlesProcessed;

  return {
    success: true,
    keyword_filter: keywordFilterStats,
    claude_analysis: {
      articles_processed: articlesProcessed,
      articles_relevant: totalRelevant,
      articles_not_relevant: totalNotRelevant,
      errors,
    },
    remaining_unanalyzed: remaining,
    timed_out: timedOut,
  };
}
