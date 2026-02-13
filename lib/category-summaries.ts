import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { getArticleAgeCutoff } from "./config";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-haiku-4-5-20251001";

interface CategoryArticle {
  title: string;
  summary: string;
  cluster_id: number | null;
}

function buildSummaryPrompt(
  category: string,
  articles: CategoryArticle[]
): string {
  // Track cluster counts for context
  const clusterCounts = new Map<number, number>();
  for (const a of articles) {
    if (a.cluster_id) {
      clusterCounts.set(
        a.cluster_id,
        (clusterCounts.get(a.cluster_id) || 0) + 1
      );
    }
  }

  const articleBlocks = articles
    .map((a) => {
      const clusterNote =
        a.cluster_id && (clusterCounts.get(a.cluster_id) || 0) > 1
          ? ` (Also covered by ${clusterCounts.get(a.cluster_id)! - 1} other source${clusterCounts.get(a.cluster_id)! - 1 > 1 ? "s" : ""})`
          : "";
      return `- Title: ${a.title}\n  Summary: ${a.summary}${clusterNote}`;
    })
    .join("\n");

  const bulletCount = articles.length === 1 ? "1 bullet point" : "3-5 bullet points";

  return `You are summarizing today's antisemitism-related news for the category "${category}".

Below are the articles in this category. Write ${bulletCount} summarizing the key developments. Each bullet should be:
- One sentence, factual, neutral tone
- Capture a distinct development (don't repeat the same story)
- If multiple articles cover the same event, synthesize into one bullet
- Prioritize the most significant or impactful developments first

Articles:
${articleBlocks}

Return ONLY a JSON array of strings, e.g. ["bullet 1", "bullet 2", "bullet 3"].`;
}

export async function generateCategorySummaries() {
  const cutoff = getArticleAgeCutoff();
  const runDate = new Date().toISOString().split("T")[0];

  // Fetch all relevant articles with their analysis
  const { data, error: fetchError } = await supabase
    .from("article_analysis")
    .select(
      `
      summary,
      category,
      cluster_id,
      articles!inner (
        title
      )
    `
    )
    .eq("is_relevant", true)
    .gte("analyzed_at", cutoff);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!data || data.length === 0) {
    return { categories_summarized: 0, total_articles: 0, errors: [] };
  }

  // Group by category
  const byCategory = new Map<string, CategoryArticle[]>();
  for (const row of data) {
    const cat = row.category || "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({
      title: (row as any).articles.title,
      summary: row.summary || "",
      cluster_id: row.cluster_id,
    });
  }

  const errors: string[] = [];
  let categoriesSummarized = 0;

  // Generate summaries in parallel
  const entries = [...byCategory.entries()];
  const results = await Promise.allSettled(
    entries.map(async ([category, articles]) => {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          "You summarize news articles into concise bullet points. Respond with valid JSON only, no other text.",
        messages: [
          {
            role: "user",
            content: buildSummaryPrompt(category, articles),
          },
        ],
      });

      let text =
        response.content[0].type === "text" ? response.content[0].text : "[]";
      text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

      let bullets: string[];
      try {
        bullets = JSON.parse(text);
      } catch {
        throw new Error(`${category}: JSON parse failed`);
      }

      return { category, bullets, articleCount: articles.length };
    })
  );

  // Upsert results
  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason?.message || String(result.reason));
      continue;
    }

    const { category, bullets, articleCount } = result.value;

    const { error: upsertError } = await supabase
      .from("category_summaries")
      .upsert(
        {
          run_date: runDate,
          category,
          summary_bullets: bullets,
          article_count: articleCount,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "run_date,category" }
      );

    if (upsertError) {
      errors.push(`Upsert ${category}: ${upsertError.message}`);
    } else {
      categoriesSummarized++;
    }
  }

  return {
    categories_summarized: categoriesSummarized,
    total_articles: data.length,
    run_date: runDate,
    errors,
  };
}
