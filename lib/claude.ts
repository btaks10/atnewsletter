import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You analyze news articles to determine if they relate to antisemitism. Respond with valid JSON only, no other text.`;

function buildUserPrompt(
  title: string,
  source: string,
  rawContent: string | null
): string {
  return `Analyze this article and return a JSON response with this exact structure:
{
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

SUMMARY REQUIREMENTS (only if relevant):
- 1-2 sentences maximum
- Neutral, factual tone
- Capture the key newsworthy element
- No editorializing

CATEGORY REQUIREMENTS (only if relevant):
Assign exactly ONE category. Categories are mutually exclusive:
1. "Campus & Academia" - University incidents, student activism, faculty issues, academic research
2. "Government & Policy" - Legislation, political statements, government actions
3. "Hate Crimes & Violence" - Physical attacks, vandalism, criminal incidents
4. "Media & Public Discourse" - Coverage controversies, public figures' statements, social media
5. "International" - Events outside the United States
6. "Organizational Response" - ADL/AJC/etc. statements, reports, initiatives
7. "Legal & Civil Rights" - Lawsuits, civil rights cases, discrimination claims
8. "Other" - Use sparingly, only when no other category fits

ARTICLE TO ANALYZE:
Title: ${title}
Source: ${source}
Content: ${rawContent || "(no content available)"}`;
}

export interface AnalysisResult {
  is_relevant: boolean;
  summary: string | null;
  category: string | null;
}

export async function analyzeArticle(
  title: string,
  source: string,
  rawContent: string | null
): Promise<{ result: AnalysisResult; model: string }> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(title, source, rawContent),
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed: AnalysisResult = JSON.parse(text);

  if (!parsed.is_relevant) {
    parsed.summary = null;
    parsed.category = null;
  }

  return { result: parsed, model: MODEL };
}

const BATCH_SIZE = 5;

export async function runAnalysis() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const MAX_ARTICLES = 100;

  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("*")
    .eq("analyzed", false)
    .gte("fetched_at", cutoff)
    .limit(MAX_ARTICLES);

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
      timing: {},
    };
  }

  let relevant = 0;
  let notRelevant = 0;
  const errors: string[] = [];
  const batchTimings: string[] = [];

  // Process sequentially to avoid rate limits
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batchStart = Date.now();
    const batch = articles.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (article) => {
        try {
          const { result, model } = await analyzeArticle(
            article.title,
            article.source,
            article.raw_content
          );

          await supabase.from("article_analysis").insert({
            article_id: article.id,
            is_relevant: result.is_relevant,
            summary: result.summary,
            category: result.category,
            model_used: model,
          });

          await supabase
            .from("articles")
            .update({ analyzed: true })
            .eq("id", article.id);

          return result.is_relevant;
        } catch (err: any) {
          const msg = `Article "${article.title}": ${err?.message || String(err)}`;
          errors.push(msg);
          return null;
        }
      })
    );

    const batchMs = Date.now() - batchStart;
    batchTimings.push(`batch${Math.floor(i / BATCH_SIZE)}:${batchMs}ms`);

    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) {
        if (r.value) relevant++;
        else notRelevant++;
      }
    }
  }

  return {
    success: true,
    articles_processed: articles.length,
    articles_relevant: relevant,
    articles_not_relevant: notRelevant,
    errors,
    timing: batchTimings,
  };
}
