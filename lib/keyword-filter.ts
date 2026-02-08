// Keyword Pre-Filter for Article Analysis
// Eliminates obviously irrelevant articles before sending to Claude API

// --- Hardcoded fallback keyword tiers ---

const FALLBACK_PRIMARY: string[] = [
  "antisemitism", "antisemitic", "anti-semitism", "anti-semitic",
  "anti-jewish", "jew-hatred", "judeophobia",
  "neo-nazi", "swastika", "white supremacist", "white nationalist",
];

const FALLBACK_SECONDARY: string[] = [
  "jewish", "jews", "synagogue", "rabbi", "torah", "kosher", "yeshiva",
  "hebrew", "zionist", "zionism", "israel", "israeli", "palestinian",
  "holocaust", "shoah", "pogrom", "blood libel", "adl",
  "anti-defamation league", "ajc", "american jewish committee", "bds",
  "boycott divestment", "jewish community", "jewish organizations",
  "jewish leaders", "jewish neighborhood", "pro-israel", "anti-israel",
  "israel lobby", "hate speech", "hate group", "hate incident", "intifada",
  "from the river", "globalist", "dual loyalty", "zionist entity",
  "jewish state", "mezuzah", "menorah", "kippah", "star of david",
  "concentration camp", "auschwitz", "dachau", "kristallnacht", "nuremberg",
  "white supremacy", "neo nazi",
];

const FALLBACK_CONTEXT: string[] = [
  "hate crime", "hate incident", "vandalism", "attack", "threat",
  "discrimination", "campus", "university", "protest", "activism",
  "legislation", "bill", "executive order", "policy", "controversy",
  "backlash", "condemned", "denounced", "report", "study", "research",
  "survey", "data", "arrested", "charged", "indicted", "sentenced",
  "convicted", "graffiti", "slur", "harassment", "intimidation", "bullying",
  "fired", "suspended", "expelled", "resigned", "rally", "march",
  "demonstration", "counter-protest", "funding", "grant", "donation",
  "endowment", "social media", "online", "viral", "trending",
];

// --- DB-backed keyword loading ---

interface KeywordTiers {
  primary: string[];
  secondary: string[];
  context: string[];
}

let cachedKeywords: KeywordTiers | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getKeywordTiers(): Promise<KeywordTiers> {
  const now = Date.now();
  if (cachedKeywords && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedKeywords;
  }

  try {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("keyword_config")
      .select("keyword, tier")
      .eq("is_active", true);

    if (error || !data || data.length === 0) {
      console.log("DB keywords unavailable, using hardcoded fallback");
      return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, context: FALLBACK_CONTEXT };
    }

    const tiers: KeywordTiers = { primary: [], secondary: [], context: [] };
    for (const row of data) {
      if (row.tier === "primary") tiers.primary.push(row.keyword);
      else if (row.tier === "secondary") tiers.secondary.push(row.keyword);
      else if (row.tier === "context") tiers.context.push(row.keyword);
    }

    cachedKeywords = tiers;
    cacheTimestamp = now;
    return tiers;
  } catch {
    console.log("DB keywords fetch failed, using hardcoded fallback");
    return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, context: FALLBACK_CONTEXT };
  }
}

// --- Types ---

export interface FilterResult {
  passFilter: boolean;
  matchedKeywords: string[];
  confidence: "high" | "medium" | "skip";
  reason: string;
}

interface ArticleForFilter {
  title: string;
  raw_content: string | null;
}

// --- Matching Logic ---

function buildWordBoundaryPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function findMatchingKeywords(
  text: string,
  keywords: string[]
): string[] {
  const matches: string[] = [];
  for (const keyword of keywords) {
    const pattern = buildWordBoundaryPattern(keyword);
    if (pattern.test(text)) {
      matches.push(keyword);
    }
  }
  return matches;
}

// --- Main Filter Function ---

export async function filterArticleByKeywords(
  article: ArticleForFilter
): Promise<FilterResult> {
  const { primary, secondary, context } = await getKeywordTiers();

  const searchText = [
    article.title || "",
    article.raw_content || "",
  ].join(" ");

  // Check primary keywords first (any match = high confidence pass)
  const primaryMatches = findMatchingKeywords(searchText, primary);
  if (primaryMatches.length > 0) {
    return {
      passFilter: true,
      matchedKeywords: primaryMatches,
      confidence: "high",
      reason: `Primary keyword match: ${primaryMatches.join(", ")}`,
    };
  }

  // Check secondary and context keywords
  const secondaryMatches = findMatchingKeywords(searchText, secondary);
  const contextMatches = findMatchingKeywords(searchText, context);

  // Medium confidence: 1+ secondary match (with or without context)
  if (secondaryMatches.length >= 1) {
    return {
      passFilter: true,
      matchedKeywords: [...secondaryMatches, ...contextMatches],
      confidence: "medium",
      reason: `Secondary keyword match: ${secondaryMatches.join(", ")}${contextMatches.length ? ` + context: ${contextMatches.join(", ")}` : ""}`,
    };
  }

  // Skip: no meaningful matches
  const allMatches = [...secondaryMatches, ...contextMatches];
  return {
    passFilter: false,
    matchedKeywords: allMatches,
    confidence: "skip",
    reason:
      allMatches.length > 0
        ? `Insufficient matches (${secondaryMatches.length} secondary, ${contextMatches.length} context)`
        : "No keyword matches found",
  };
}
