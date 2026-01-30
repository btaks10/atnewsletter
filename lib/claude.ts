import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = "claude-sonnet-4-20250514";

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

function buildBatchPrompt(articles: ArticleInput[]): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `[ARTICLE ${i}]
Title: ${a.title}
Source: ${a.source}
Content: ${a.raw_content || "(no content available)"}`
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

export async function runAnalysis() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("*")
    .eq("analyzed", false)
    .gte("fetched_at", cutoff)
    .limit(150);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!articles || articles.length === 0) {
    return {
      success: true,
      articles_processed: 0,
      articles_relevant: 0,
      articles_not_relevant: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let relevant = 0;
  let notRelevant = 0;

  // Send ALL articles in a single Claude API call
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system:
      "You analyze news articles to determine if they relate to antisemitism. Respond with valid JSON only, no other text.",
    messages: [
      {
        role: "user",
        content: buildBatchPrompt(
          articles.map((a) => ({
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

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  let results: AnalysisResult[];
  try {
    results = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse Claude response: ${text.slice(0, 200)}`);
  }

  // Store results and mark articles as analyzed
  for (const result of results) {
    const article = articles[result.index];
    if (!article) {
      errors.push(`Invalid index ${result.index} in Claude response`);
      continue;
    }

    if (!result.is_relevant) {
      result.summary = null;
      result.category = null;
    }

    try {
      await supabase.from("article_analysis").insert({
        article_id: article.id,
        is_relevant: result.is_relevant,
        summary: result.summary,
        category: result.category,
        model_used: MODEL,
      });

      await supabase
        .from("articles")
        .update({ analyzed: true })
        .eq("id", article.id);

      if (result.is_relevant) relevant++;
      else notRelevant++;
    } catch (err: any) {
      errors.push(
        `DB error for "${article.title}": ${err?.message || String(err)}`
      );
    }
  }

  return {
    success: true,
    articles_processed: articles.length,
    articles_relevant: relevant,
    articles_not_relevant: notRelevant,
    errors,
  };
}
